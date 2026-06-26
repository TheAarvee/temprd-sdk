import { randomUUID } from "crypto";
import {
  getRuntimeConfig,
  setRuntimeConfig,
  setRuntimeProviderClient
} from "./core/runtime-config";
import { temprdProxy } from "./core/proxy";
import { ResponseValidator } from "./guards/response-validator";
import { SensitivityGate } from "./governance/sensitivity-gate";
import { HealPipeline } from "./healers/heal-pipeline";
import { RuntimeTelemetry } from "./telemetry/runtime-telemetry";
import type {
  HealPatch,
  HealingContext,
  TemprdConfig,
  ToolWrapperOptions,
  WrappedTool,
  temprdConfig
} from "./types";

export class Temprd {
  static wrap_client<T>(client: T, config: TemprdConfig): T {
    setRuntimeConfig(config);
    setRuntimeProviderClient(client);
    const proxy = new temprdProxy(config);
    return proxy.wrap(client) as T;
  }

  static wrapTool<TArgs extends unknown[], TResult>(
    tool_name: string,
    tool: (...args: TArgs) => TResult | Promise<TResult>,
    options: ToolWrapperOptions = {}
  ): WrappedTool<TArgs, TResult> {
    const normalizedOptions = this.normalizeToolOptions(options);
    const responseValidator = new ResponseValidator();
    const config = normalizedOptions.config;
    const sensitivityGate = config ? new SensitivityGate(config) : null;
    const healPipeline = config ? new HealPipeline(config) : null;
    const sessionId = randomUUID();
    const telemetry = config ? new RuntimeTelemetry(config, sessionId) : null;
    const validateResponse = normalizedOptions.validate_response ?? true;

    return async (...args: TArgs): Promise<TResult> => {
      if (normalizedOptions.sensitive) {
        telemetry?.emitProtection({
          event_type: "sensitive_operation_requested",
          protection_category: "Sensitive Operation Governance",
          status: "detected",
          action: "requested_approval",
          reason: "Tool wrapper marked operation as sensitive",
          metadata: {
            tool_name
          }
        });
        const approved = sensitivityGate
          ? await sensitivityGate.requestApproval(tool_name, args)
          : false;

        telemetry?.emitProtection({
          event_type: approved ? "sensitive_operation_approved" : "sensitive_operation_rejected",
          protection_category: "Sensitive Operation Governance",
          status: approved ? "allowed" : "blocked",
          action: approved ? "allowed_tool_call" : "blocked_tool_call",
          reason: approved ? "Developer approval callback allowed operation" : "Developer approval callback rejected operation",
          metadata: {
            tool_name
          }
        });

        if (!approved) {
          throw new Error(`temprd: Sensitive operation rejected for ${tool_name}`);
        }
      }

      let result: TResult;
      try {
        result = await tool(...args);
      } catch (error) {
        return await this.healToolFailure(
          tool_name,
          tool,
          args,
          error,
          healPipeline,
          sessionId,
          normalizedOptions
        );
      }

      if (validateResponse) {
        const validation = responseValidator.validate(result);
        if (!validation.valid) {
          return await this.healToolFailure(
            tool_name,
            tool,
            args,
            new Error(`temprd: Invalid tool response for ${tool_name}: ${validation.reason}`),
            healPipeline,
            sessionId,
            normalizedOptions,
            result
          );
        }
      }

      return result;
    };
  }

  private static async healToolFailure<TArgs extends unknown[], TResult>(
    tool_name: string,
    tool: (...args: TArgs) => TResult | Promise<TResult>,
    args: TArgs,
    error: unknown,
    healPipeline: HealPipeline | null,
    sessionId: string,
    options: ToolWrapperOptions,
    failedResponse?: unknown
  ): Promise<TResult> {
    if (!healPipeline) {
      options.on_error?.(error);
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const context = this.buildToolHealingContext(tool_name, args, options, errorMessage);
    const patch = await healPipeline.heal(
      failedResponse === undefined ? "tool_error" : "silent_200_failure",
      errorMessage,
      [
        {
          role: "tool",
          name: tool_name,
          content: JSON.stringify({
            tool_name,
            arguments: args,
            error: errorMessage,
            failed_response: failedResponse
          })
        }
      ],
      sessionId,
      context.failed_tool_call,
      failedResponse,
      context
    );

    if (patch.status !== "healed") {
      const healError = new Error(
        `temprd: Heal failed for ${tool_name}: ${patch.reason ?? patch.status}`
      );
      options.on_error?.(healError);
      throw healError;
    }

    const patchedArgs = this.applyToolPatch(args, patch);
    return await tool(...patchedArgs);
  }

  private static buildToolHealingContext<TArgs extends unknown[]>(
    tool_name: string,
    args: TArgs,
    options: ToolWrapperOptions,
    errorMessage?: string
  ): HealingContext {
    const fieldMismatch = this.extractFieldMismatch(errorMessage);
    const expectedFields =
      options.expected_fields ??
      (fieldMismatch ? [fieldMismatch.expected] : this.extractExpectedFields(options.tool_schema));

    return {
      tool_name,
      tool_schema: options.tool_schema ?? null,
      expected_fields: expectedFields,
      tool_description: options.tool_description ?? null,
      failed_tool_call: {
        tool_name,
        arguments: args.length === 1 ? args[0] : args
      },
      error_response_body: fieldMismatch
        ? {
            expected_field: fieldMismatch.expected,
            received_field: fieldMismatch.received
          }
        : undefined
    };
  }

  private static extractFieldMismatch(
    errorMessage?: string
  ): { expected: string; received: string } | null {
    if (!errorMessage) {
      return null;
    }

    const match = errorMessage.match(
      /expected\s+(?:field\s+)?["']?([A-Za-z0-9_.$-]+)["']?\s+but\s+received\s+["']?([A-Za-z0-9_.$-]+)["']?/i
    );

    if (!match) {
      return null;
    }

    return {
      expected: match[1],
      received: match[2]
    };
  }

  private static applyToolPatch<TArgs extends unknown[]>(args: TArgs, patch: HealPatch): TArgs {
    const healed = patch.patch?.healed;

    if (Array.isArray(healed)) {
      return healed as TArgs;
    }

    if (this.isRecord(healed)) {
      const toolArguments = healed.tool_arguments;
      if (Array.isArray(toolArguments)) {
        return toolArguments as TArgs;
      }

      if (this.isRecord(toolArguments)) {
        return [toolArguments] as TArgs;
      }

      if ("arguments" in healed) {
        const nestedArguments = healed.arguments;
        if (Array.isArray(nestedArguments)) {
          return nestedArguments as TArgs;
        }

        if (this.isRecord(nestedArguments)) {
          return [nestedArguments] as TArgs;
        }
      }

      if (patch.patch?.type === "tool_call" || patch.patch?.type === "payload") {
        return [healed] as TArgs;
      }
    }

    return args;
  }

  private static extractExpectedFields(schema?: Record<string, unknown>): string[] | null {
    if (!schema || !this.isRecord(schema.properties)) {
      return null;
    }

    return Object.keys(schema.properties);
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private static normalizeToolOptions(options: ToolWrapperOptions): ToolWrapperOptions {
    const runtimeConfig = getRuntimeConfig();
    const directConfig = this.extractDirectConfig(options);

    if (options.config) {
      return {
        ...options,
        config: runtimeConfig ? { ...runtimeConfig, ...options.config } : options.config
      };
    }

    if (directConfig) {
      if (!directConfig.api_key && runtimeConfig) {
        return {
          ...options,
          config: { ...runtimeConfig, ...directConfig }
        };
      }

      if (directConfig.api_key) {
        return {
          ...options,
          config: directConfig as temprdConfig
        };
      }
    }

    if (runtimeConfig) {
      return {
        ...options,
        config: runtimeConfig
      };
    }

    return options;
  }

  private static extractDirectConfig(options: ToolWrapperOptions): Partial<temprdConfig> | null {
    const directConfig: Partial<temprdConfig> = {};
    const configKeys: Array<keyof temprdConfig> = [
      "api_key",
      "cloud_api_url",
      "token_budget",
      "circuit_breaker_threshold",
      "sensitive_operations",
      "on_heal",
      "on_circuit_break",
      "on_token_warning",
      "on_sensitive_operation",
      "debug"
    ];

    for (const key of configKeys) {
      if (options[key] !== undefined) {
        directConfig[key] = options[key] as never;
      }
    }

    return Object.keys(directConfig).length > 0 ? directConfig : null;
  }
}

/**
 * @deprecated Use `Temprd` instead.
 */
export class temprd {
  static wrap_client<T>(client: T, config: temprdConfig): T {
    return Temprd.wrap_client(client, config);
  }

  static wrapTool<TArgs extends unknown[], TResult>(
    tool_name: string,
    tool: (...args: TArgs) => TResult | Promise<TResult>,
    options: ToolWrapperOptions = {}
  ): WrappedTool<TArgs, TResult> {
    return Temprd.wrapTool(tool_name, tool, options);
  }
}
