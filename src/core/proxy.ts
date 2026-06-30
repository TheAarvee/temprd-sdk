import { randomUUID } from "crypto";
import { ContextCompressor } from "../healers/context-compressor";
import { HealPipeline } from "../healers/heal-pipeline";
import { InjectionGuard } from "../guards/injection-guard";
import { PIIStripper } from "../guards/pii-stripper";
import { ResponseValidator } from "../guards/response-validator";
import { SensitivityGate } from "../governance/sensitivity-gate";
import type { HealPatch, HealingContext, temprdConfig, temprdMessage } from "../types";
import { RuntimeTelemetry } from "../telemetry/runtime-telemetry";
import { hashMessages } from "../utils/hasher";
import { Logger } from "../utils/logger";
import { CircuitBreaker, CircuitBreakerOpenError } from "./circuit-breaker";
import { classifyFailure } from "./failure-classifier";
import { setRuntimeProviderModel } from "./runtime-config";
import { TokenTracker } from "./token-tracker";

type CreateParams = {
  messages?: temprdMessage[];
  [key: string]: unknown;
};

type CreateFunction = (params: CreateParams) => Promise<unknown>;

type CompletionShape = {
  create: CreateFunction;
  [key: string]: unknown;
};

type ChatShape = {
  completions: CompletionShape;
  [key: string]: unknown;
};

type ClientShape = {
  chat?: ChatShape;
  [key: string]: unknown;
};

type SuccessfulToolCall = {
  tool_name: string;
  arguments: unknown;
};

const CHAT_COMPLETIONS_TOOL_NAME = "chat.completions.create";
const MAX_SUCCESSFUL_CALLS_PER_TOOL = 5;

export class temprdProxy {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly tokenTracker: TokenTracker;
  private readonly injectionGuard = new InjectionGuard();
  private readonly responseValidator = new ResponseValidator();
  private readonly contextCompressor = new ContextCompressor();
  private readonly healPipeline: HealPipeline;
  private readonly sensitivityGate: SensitivityGate;
  private readonly telemetry: RuntimeTelemetry;
  private readonly logger: Logger;
  private readonly sessionId = randomUUID();
  private readonly promptHashes = new Map<string, number>();
  private readonly successfulCalls = new Map<string, SuccessfulToolCall[]>();
  private readonly threshold: number;
  private readonly piiStripper = new PIIStripper();

  constructor(private readonly config: temprdConfig) {
    this.threshold = config.circuit_breaker_threshold ?? 3;
    this.circuitBreaker = new CircuitBreaker(this.threshold);
    this.tokenTracker = new TokenTracker(config);
    this.healPipeline = new HealPipeline(config);
    this.sensitivityGate = new SensitivityGate(config);
    this.telemetry = new RuntimeTelemetry(config, this.sessionId);
    this.logger = new Logger(config.debug ?? false);
  }

  wrap<T>(client: T): T {
    const maybeClient = client as ClientShape;
    const nestedClient = (maybeClient as { client?: unknown }).client as ClientShape | undefined;
    if (!maybeClient.chat?.completions?.create && nestedClient?.chat?.completions?.create) {
      const wrappedProvider = this.wrap(nestedClient);
      return new Proxy(maybeClient, {
        get(target, prop, receiver) {
          if (prop === "client") return wrappedProvider;
          return Reflect.get(target, prop, receiver);
        }
      }) as T;
    }
    if (!maybeClient.chat?.completions?.create) {
      return client;
    }

    const originalCreate = maybeClient.chat.completions.create.bind(maybeClient.chat.completions);
    const proxy = new Proxy(maybeClient, {
      get: (target, prop, receiver) => {
        if (prop !== "chat") {
          return Reflect.get(target, prop, receiver);
        }

        return new Proxy(target.chat as ChatShape, {
          get: (chatTarget, chatProp, chatReceiver) => {
            if (chatProp !== "completions") {
              return Reflect.get(chatTarget, chatProp, chatReceiver);
            }

            return new Proxy(chatTarget.completions, {
              get: (completionTarget, completionProp, completionReceiver) => {
                if (completionProp !== "create") {
                  return Reflect.get(completionTarget, completionProp, completionReceiver);
                }

                return (params: CreateParams) => this.interceptCreate(originalCreate, params);
              }
            });
          }
        });
      }
    });

    return proxy as T;
  }

  resolveProviderClient(client: unknown): unknown {
    const candidate = client as { client?: unknown };
    const nested = candidate?.client as ClientShape | undefined;
    return nested?.chat?.completions?.create ? nested : client;
  }

  private async interceptCreate(originalCreate: CreateFunction, params: CreateParams): Promise<unknown> {
    if (this.tokenTracker.isExceeded()) {
      this.telemetry.emitProtection({
        event_type: "token_budget_exceeded",
        protection_category: "Token Budget Explosion",
        status: "exceeded",
        action: "blocked_llm_call",
        reason: "Configured token budget exceeded",
        tokens_used: this.tokenTracker.getUsed(),
        token_budget: this.tokenTracker.getBudget()
      });
      throw new Error("temprd: Token budget exceeded");
    }

    const nextParams: CreateParams = { ...params };
    if (typeof nextParams.model === "string") {
      setRuntimeProviderModel(nextParams.model);
    }

    if (nextParams.messages) {
      const scan = this.injectionGuard.scan(nextParams.messages);
      nextParams.messages = scan.sanitized_messages;
      if (!scan.clean) {
        this.logger.warn("injection-guard", "Injection patterns detected", scan.detections);
        const hasToolContent = nextParams.messages.some((message) => message.role === "tool");
        this.telemetry.emitProtection({
          event_type: hasToolContent ? "indirect_prompt_injection_detected" : "prompt_injection_detected",
          protection_category: hasToolContent ? "Indirect Prompt Injection" : "Direct Prompt Injection",
          status: "blocked",
          action: "sanitized_messages",
          reason: "Injection patterns detected in non-system messages",
          metadata: {
            detection_count: scan.detections.length,
            message_count: nextParams.messages.length
          }
        });
      }

      const redactedFields = new Set<string>();
      nextParams.messages = nextParams.messages.map((message) => {
        const piiScan = this.piiStripper.strip(message.content);
        for (const field of piiScan.redacted_fields) {
          redactedFields.add(field);
        }
        return {
          ...message,
          content: piiScan.sanitized_content
        };
      });
      if (redactedFields.size > 0) {
        this.telemetry.emitProtection({
          event_type: "pii_redacted",
          protection_category: "Outbound PII Leakage",
          status: "blocked",
          action: "redacted_provider_messages",
          reason: "PII was redacted before outbound runtime call",
          metadata: {
            redacted_fields: [...redactedFields],
            message_count: nextParams.messages.length
          }
        });
      }

      const beforeCompressCount = nextParams.messages.length;
      const shouldCompress = this.contextCompressor.shouldCompress(nextParams.messages);
      nextParams.messages = this.contextCompressor.compress(nextParams.messages);
      if (shouldCompress) {
        this.telemetry.emitProtection({
          event_type: "context_compressed",
          protection_category: "Context Window Pollution",
          status: "compressed",
          action: "compressed_message_history",
          reason: "Message count exceeded compression threshold",
          metadata: {
            original_message_count: beforeCompressCount,
            compressed_message_count: nextParams.messages.length
          }
        });
      }
      this.checkRepeatedPrompt(nextParams.messages);
    }

    const healingContext = this.buildHealingContext(nextParams);
    let response: unknown;
    try {
      response = await originalCreate(nextParams);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        throw error;
      }

      const classification = classifyFailure(error);
      if (classification.kind === "authentication") throw error;
      const localPatch = this.inferLocalPayloadPatch(nextParams, error);
      if (localPatch) {
        this.config.on_heal?.(localPatch);
        const repaired = await originalCreate(this.applyPatch(nextParams, localPatch));
        this.trackResponseTokens(repaired);
        return repaired;
      }
      if (classification.retryable) {
        const maxRetries = this.config.max_retries ?? 2;
        let lastError = error;
        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
          await delay(classification.retryAfterMs ?? 500);
          try {
            return await originalCreate(nextParams);
          } catch (retryError) {
            lastError = retryError;
            if (!classifyFailure(retryError).retryable) throw retryError;
          }
        }
        throw lastError;
      }

      return this.runHealPipeline(
        originalCreate,
        nextParams,
        classification.kind,
        error instanceof Error ? error.message : String(error),
        healingContext.failed_tool_call,
        undefined,
        {
          ...healingContext,
          error_response_body: this.extractErrorResponseBody(error)
        }
      );
    }

    const validation = this.responseValidator.validate(response);
    if (!validation.valid) {
      return this.runHealPipeline(
        originalCreate,
        nextParams,
        "silent_200_failure",
        validation.reason ?? "invalid_response",
        undefined,
        response,
        healingContext
      );
    }

    this.recordSuccessfulCall(healingContext);
    this.trackResponseTokens(response);
    return response;
  }

  private checkRepeatedPrompt(messages: temprdMessage[]): void {
    const hash = hashMessages(messages);
    const count = (this.promptHashes.get(hash) ?? 0) + 1;
    this.promptHashes.set(hash, count);

    if (count >= this.threshold) {
      this.config.on_circuit_break?.("repeated_prompt");
      this.telemetry.emitProtection({
        event_type: "repeated_prompt_detected",
        protection_category: "Infinite Loops & Token Bleeding",
        status: "blocked",
        action: "opened_circuit_breaker",
        reason: "Repeated prompt hash detected",
        prompt_hash: hash,
        failure_count: count,
        metadata: {
          threshold: this.threshold
        }
      });
      throw new CircuitBreakerOpenError("repeated_prompt", count, "Repeated prompt hash detected");
    }
  }

  private async runHealPipeline(
    originalCreate: CreateFunction,
    params: CreateParams,
    error_type: string,
    error_message: string,
    failed_tool_call?: unknown,
    failed_response?: unknown,
    context: HealingContext = {}
  ): Promise<unknown> {
    const state = this.circuitBreaker.recordFailure(error_type, error_message);
    if (state === "OPEN") {
      const breakerState = this.circuitBreaker.getState(error_type);
      this.config.on_circuit_break?.(error_type);
      this.telemetry.emitProtection({
        event_type: "circuit_breaker_opened",
        protection_category: "Compounding Error Cascade",
        status: "blocked",
        action: "blocked_retry_cascade",
        reason: "Circuit breaker opened after repeated failures",
        failure_count: breakerState.failure_count,
        metadata: {
          error_type
        }
      });
      this.telemetry.emitLog({
        level: "warn",
        event_name: "heal_blocked_by_circuit_breaker",
        message: "Heal attempt blocked by circuit breaker",
        status: "blocked",
        error_type,
        error_message
      });
      throw new CircuitBreakerOpenError(
        error_type,
        breakerState.failure_count,
        breakerState.last_error
      );
    }

    const patch = await this.healPipeline.heal(
      error_type,
      error_message,
      params.messages ?? [],
      this.sessionId,
      failed_tool_call,
      failed_response,
      context
    );

    if (patch.status === "healed") {
      this.circuitBreaker.recordSuccess(error_type);
      this.telemetry.emitLog({
        level: "info",
        event_name: "heal_attempt_complete",
        message: "Heal completed and retry will be attempted",
        status: "success",
        error_type,
        error_message,
        heal_status: patch.status,
        metadata: {
          strategy: patch.patch?.strategy,
          confidence: patch.patch?.confidence
        }
      });
      const patchedParams = this.applyPatch(params, patch);
      const response = await originalCreate(patchedParams);
      this.trackResponseTokens(response);
      return response;
    }

    this.telemetry.emitLog({
      level: "warn",
      event_name: "heal_attempt_complete",
      message: "Heal did not produce an accepted patch",
      status: "failed",
      error_type,
      error_message,
      heal_status: patch.status,
      metadata: {
        reason: patch.reason
      }
    });
    throw new Error(`temprd: Heal failed for ${error_type}`);
  }

  private applyPatch(params: CreateParams, patch: HealPatch): CreateParams {
    if (patch.patch?.type === "message") {
      return { ...params, messages: patch.patch.healed as temprdMessage[] };
    }

    if (patch.patch?.type === "payload" && typeof patch.patch.healed === "object") {
      return { ...params, ...(patch.patch.healed as Record<string, unknown>) };
    }

    if (patch.patch?.type === "tool_call" && typeof patch.patch.healed === "object") {
      const healed = patch.patch.healed as Record<string, unknown>;
      if (this.isRecord(healed.tool_arguments)) {
        return { ...params, tool_arguments: healed.tool_arguments };
      }

      return { ...params, tool_arguments: healed };
    }

    return params;
  }

  private inferLocalPayloadPatch(params: CreateParams, error: unknown): HealPatch | null {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(
      /expected\s+(?:field\s+)?["']?([A-Za-z0-9_.$-]+)["']?\s+but\s+received\s+["']?([A-Za-z0-9_.$-]+)["']?/i
    );
    if (!match) return null;
    const [, expected, received] = match;
    const toolArguments = this.isRecord(params.tool_arguments)
      ? params.tool_arguments
      : params;
    if (!(received in toolArguments) || expected in toolArguments) return null;
    const healedArguments = { ...toolArguments, [expected]: toolArguments[received] };
    delete healedArguments[received];
    const healed = this.isRecord(params.tool_arguments)
      ? { ...params, tool_arguments: healedArguments }
      : healedArguments;
    return {
      status: "healed",
      patch: {
        type: "payload",
        original: params,
        healed,
        confidence: 0.99,
        strategy: "observed_field_rename"
      }
    };
  }

  private trackResponseTokens(response: unknown): void {
    if (typeof response !== "object" || response === null) {
      return;
    }

    const usage = (response as { usage?: { total_tokens?: unknown } }).usage;
    if (typeof usage?.total_tokens === "number") {
      const previousUsed = this.tokenTracker.getUsed();
      this.tokenTracker.add(usage.total_tokens);
      const budget = this.tokenTracker.getBudget();
      const currentUsed = this.tokenTracker.getUsed();
      if (
        Number.isFinite(budget) &&
        previousUsed < budget * 0.8 &&
        currentUsed >= budget * 0.8 &&
        currentUsed < budget
      ) {
        this.telemetry.emitProtection({
          event_type: "token_budget_warning",
          protection_category: "Token Budget Explosion",
          status: "warned",
          action: "warned_developer_callback",
          reason: "Token usage crossed 80% of configured budget",
          tokens_used: currentUsed,
          token_budget: budget
        });
      }
    }
  }

  private buildHealingContext(params: CreateParams): HealingContext {
    const metadata = this.extractToolMetadata(params);
    const successfulExamples = this.successfulCalls.get(metadata.tool_name) ?? [];

    return {
      tool_name: metadata.tool_name,
      tool_schema: metadata.tool_schema,
      expected_fields: this.extractExpectedFields(metadata.tool_schema),
      tool_description: metadata.tool_description,
      previous_successful_call: successfulExamples[successfulExamples.length - 1] ?? null,
      successful_call_examples: successfulExamples,
      failed_tool_call: {
        tool_name: metadata.tool_name,
        arguments: params
      }
    };
  }

  private extractToolMetadata(params: CreateParams): {
    tool_name: string;
    tool_schema: Record<string, unknown> | null;
    tool_description: string | null;
  } {
    const tools = Array.isArray(params.tools) ? params.tools : [];
    const selectedToolName = this.extractSelectedToolName(params.tool_choice);
    const matchingTool = tools.find((tool) => {
      if (!this.isRecord(tool)) {
        return false;
      }
      const fn = tool.function;
      return this.isRecord(fn) && fn.name === selectedToolName;
    });
    const tool = (matchingTool ?? tools[0]) as unknown;

    if (this.isRecord(tool) && this.isRecord(tool.function)) {
      return {
        tool_name: typeof tool.function.name === "string" ? tool.function.name : CHAT_COMPLETIONS_TOOL_NAME,
        tool_schema: this.isRecord(tool.function.parameters) ? tool.function.parameters : tool,
        tool_description:
          typeof tool.function.description === "string" ? tool.function.description : null
      };
    }

    return {
      tool_name: CHAT_COMPLETIONS_TOOL_NAME,
      tool_schema: this.inferSchemaFromArguments(params),
      tool_description: "OpenAI chat completions create request"
    };
  }

  private extractSelectedToolName(toolChoice: unknown): string | null {
    if (!this.isRecord(toolChoice)) {
      return null;
    }

    const fn = toolChoice.function;
    if (this.isRecord(fn) && typeof fn.name === "string") {
      return fn.name;
    }

    return null;
  }

  private inferSchemaFromArguments(args: Record<string, unknown>): Record<string, unknown> {
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.keys(args).map((key) => [key, { type: typeof args[key] }])
      )
    };
  }

  private extractExpectedFields(schema: Record<string, unknown> | null): string[] | null {
    if (!schema) {
      return null;
    }

    if (this.isRecord(schema.properties)) {
      return Object.keys(schema.properties);
    }

    return null;
  }

  private recordSuccessfulCall(context: HealingContext): void {
    if (!context.tool_name) {
      return;
    }

    const failedToolCall = context.failed_tool_call;
    const args = this.isRecord(failedToolCall) ? failedToolCall.arguments : undefined;
    const nextCall = {
      tool_name: context.tool_name,
      arguments: args
    };
    const calls = [...(this.successfulCalls.get(context.tool_name) ?? []), nextCall].slice(
      -MAX_SUCCESSFUL_CALLS_PER_TOOL
    );
    this.successfulCalls.set(context.tool_name, calls);
  }

  private extractErrorResponseBody(error: unknown): Record<string, unknown> | null {
    if (!this.isRecord(error)) {
      return null;
    }

    const response = error.response;
    if (!this.isRecord(response)) {
      return null;
    }

    return this.isRecord(response.data) ? response.data : { data: response.data };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  async requestSensitiveOperation(tool_name: string, args: unknown): Promise<boolean> {
    if (!this.sensitivityGate.isSensitive(tool_name)) {
      return true;
    }

    this.telemetry.emitProtection({
      event_type: "sensitive_operation_requested",
      protection_category: "Sensitive Operation Governance",
      status: "detected",
      action: "requested_approval",
      reason: "Sensitive operation matched configured list",
      metadata: {
        tool_name
      }
    });
    const approved = await this.sensitivityGate.requestApproval(tool_name, args);
    this.telemetry.emitProtection({
      event_type: approved ? "sensitive_operation_approved" : "sensitive_operation_rejected",
      protection_category: "Sensitive Operation Governance",
      status: approved ? "allowed" : "blocked",
      action: approved ? "allowed_tool_call" : "blocked_tool_call",
      reason: approved ? "Developer approval callback allowed operation" : "Developer approval callback rejected operation",
      metadata: {
        tool_name
      }
    });
    return approved;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
