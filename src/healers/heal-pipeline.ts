import { PIIStripper } from "../guards/pii-stripper";
import { getRuntimeProviderClient, getRuntimeProviderModel } from "../core/runtime-config";
import { RuntimeTelemetry } from "../telemetry/runtime-telemetry";
import type { HealPatch, HealRequest, HealingContext, temprdConfig, temprdMessage } from "../types";
import { CloudClient } from "./cloud-client";
import { detectProviderName, executeHealingJob } from "./provider-inference";
import { messageContentToText } from "../utils/message-content";

const SDK_VERSION = "0.1.1";
const VALIDATION_CONFIDENCE_THRESHOLD = 0.8;

export class HealPipeline {
  private readonly cloudClient: CloudClient;
  private readonly piiStripper = new PIIStripper();

  constructor(private readonly config: temprdConfig, cloudClient?: CloudClient) {
    this.cloudClient = cloudClient ?? new CloudClient(config);
  }

  async heal(
    error_type: string,
    error_message: string,
    messages: temprdMessage[],
    session_id: string,
    failed_tool_call?: unknown,
    failed_response?: unknown,
    context: HealingContext = {}
  ): Promise<HealPatch> {
    const telemetry = new RuntimeTelemetry(this.config, session_id);
    const redactedFields = new Set<string>();
    const maxMessages = this.config.max_healing_messages ?? 4;
    const maxChars = this.config.max_healing_content_chars ?? 800;
    const message_history = messages.slice(-maxMessages).map((message) => {
      const scan = this.piiStripper.strip(
        messageContentToText(message.content).slice(0, maxChars)
      );
      for (const field of scan.redacted_fields) {
        redactedFields.add(field);
      }
      return {
        ...message,
        content: messageContentToText(scan.sanitized_content)
      };
    });

    if (redactedFields.size > 0) {
      telemetry.emitProtection({
        event_type: "pii_redacted",
        protection_category: "Outbound PII Leakage",
        status: "blocked",
        action: "redacted_message_history",
        reason: "PII was redacted before sending healing context",
        metadata: {
          redacted_fields: [...redactedFields],
          message_count: messages.length
        }
      });
    }

    const request: HealRequest = {
      sdk_version: SDK_VERSION,
      healing_mode: context.healing_mode ?? "production",
      error_type,
      error_message,
      ...context,
      expected_fields: context.expected_fields ?? extractExpectedFields(context.tool_schema),
      failed_tool_call: context.failed_tool_call ?? failed_tool_call,
      failed_response: context.failed_response ?? failed_response,
      message_history,
      session_id
    };

    const patch = await this.runCustomerProviderHealing(request);
    telemetry.emitLog({
      level: patch.status === "healed" ? "info" : "warn",
      event_name: "heal_attempt_complete",
      message: "Heal pipeline completed",
      status: patch.status,
      error_type,
      error_message,
      heal_status: patch.status,
      metadata: {
        strategy: patch.patch?.strategy,
        confidence: patch.patch?.confidence,
        reason: patch.reason
      }
    });
    if (patch.status === "healed") {
      this.config.on_heal?.(patch);
    }

    return patch;
  }

  private async runCustomerProviderHealing(request: HealRequest): Promise<HealPatch> {
    const providerClient = getRuntimeProviderClient();
    const providerModel = getRuntimeProviderModel();
    if (!providerClient) {
      return {
        status: "no_fix",
        reason: "Customer-provider healing unavailable: no wrapped provider client"
      };
    }

    if (!providerModel) {
      return {
        status: "no_fix",
        reason: "Customer-provider healing unavailable: no model captured from wrapped client"
      };
    }

    try {
      const job = await this.cloudClient.createJob(request);
      const modelProvider = detectProviderName(providerClient);
      this.debugLog("healing_job_received", {
        job_id: job.job_id,
        job_version: job.job_version,
        model_provider: modelProvider,
        model_name: providerModel,
        job
      });
      const candidateOutput = await executeHealingJob(
        providerClient,
        providerModel,
        job,
        {
          enabled: this.config.debug,
          log: (event, data) => this.debugLog(event, data)
        }
      );
      this.debugLog("candidate_validation_inputs", {
        candidate_output: candidateOutput,
        confidence_score: extractConfidence(candidateOutput),
        validation_threshold: VALIDATION_CONFIDENCE_THRESHOLD
      });
      return await this.cloudClient.validateJob(job.job_id, candidateOutput, {
        model_provider: modelProvider,
        model_name: providerModel
      });
    } catch (error) {
      return {
        status: "no_fix",
        reason: `Customer-provider healing failed: ${errorMessage(error)}`
      };
    }
  }

  private debugLog(event: string, data: Record<string, unknown>): void {
    if (this.config.debug) {
      console.log(`[temprd:heal-pipeline] ${event} ${JSON.stringify(data)}`);
    }
  }
}

function extractConfidence(candidateOutput: Record<string, unknown>): unknown {
  const patch = candidateOutput.patch;
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return null;
  }

  return (patch as Record<string, unknown>).confidence ?? null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function extractExpectedFields(tool_schema?: Record<string, unknown> | null): string[] | null {
  if (!tool_schema) {
    return null;
  }

  const directProperties = tool_schema.properties;
  if (isRecord(directProperties)) {
    return Object.keys(directProperties);
  }

  const functionParameters = tool_schema.function;
  if (isRecord(functionParameters) && isRecord(functionParameters.parameters)) {
    const properties = functionParameters.parameters.properties;
    if (isRecord(properties)) {
      return Object.keys(properties);
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
