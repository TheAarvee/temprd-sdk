import axios from "axios";
import { DEFAULT_CLOUD_URL } from "../healers/cloud-client";
import type { RuntimeProtectionEvent, SdkLogEvent, temprdConfig } from "../types";

const TELEMETRY_TIMEOUT_MS = 10000;
const SDK_VERSION = "0.1.0";
const MAX_METADATA_DEPTH = 3;
const MAX_STRING_LENGTH = 300;
const MAX_ARRAY_LENGTH = 20;
const BLOCKED_METADATA_KEYS = new Set([
  "args",
  "arguments",
  "content",
  "messages",
  "message_history",
  "prompt",
  "raw",
  "request",
  "response",
  "schema",
  "tool_schema",
  "user_data",
  "payload",
  "body",
  "api_key",
  "apikey",
  "authorization",
  "password",
  "secret",
  "token"
]);

export class RuntimeTelemetry {
  private static readonly pending = new Set<Promise<void>>();
  private readonly apiKey: string;
  private readonly cloudUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: temprdConfig,
    private readonly sessionId: string
  ) {
    this.apiKey = config.api_key;
    this.cloudUrl = config.cloud_api_url ?? DEFAULT_CLOUD_URL;
    this.timeoutMs = config.cloud_timeout_ms ?? TELEMETRY_TIMEOUT_MS;
  }

  emitProtection(event: Omit<RuntimeProtectionEvent, "session_id" | "sdk_version">): void {
    const payload = {
      session_id: this.sessionId,
      sdk_version: SDK_VERSION,
      ...event,
      metadata: sanitizeMetadata(event.metadata ?? {})
    };
    this.post("events", payload);
    this.emitLog({
      level: event.status === "error" ? "error" : event.status === "allowed" ? "info" : "warn",
      event_name: event.event_type,
      message: event.reason ?? `Runtime protection event: ${event.event_type}`,
      status: event.status,
      metadata: {
        protection_category: event.protection_category,
        action: event.action,
        tokens_used: event.tokens_used,
        token_budget: event.token_budget,
        failure_count: event.failure_count
      }
    });
  }

  emitLog(event: Omit<SdkLogEvent, "session_id" | "sdk_version">): void {
    this.post("logs", {
      session_id: this.sessionId,
      sdk_version: SDK_VERSION,
      ...event,
      metadata: sanitizeMetadata(event.metadata ?? {})
    });
  }

  private post(kind: "events" | "logs", payload: RuntimeProtectionEvent | SdkLogEvent): void {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
      return;
    }

    const request = axios
      .post(this.runtimeEndpoint(kind), payload, {
        headers: {
          "X-Heal-API-Key": this.apiKey,
          "Content-Type": "application/json"
        },
        timeout: this.timeoutMs
      })
      .then(() => undefined)
      .catch((error) => {
        if (this.config.debug) {
          console.warn(
            `[temprd:runtime-telemetry] failed to send ${kind}: ${telemetryErrorMessage(error)}`
          );
        }
        // Runtime telemetry must never block or fail customer execution.
      });
    RuntimeTelemetry.pending.add(request);
    request.finally(() => RuntimeTelemetry.pending.delete(request));
  }

  private runtimeEndpoint(kind: "events" | "logs"): string {
    const trimmed = this.cloudUrl.replace(/\/+$/, "");
    if (trimmed.endsWith("/v1/heal")) {
      return `${trimmed.slice(0, -"/heal".length)}/runtime/${kind}`;
    }
    if (trimmed.endsWith("/v1")) {
      return `${trimmed}/runtime/${kind}`;
    }
    return `${trimmed}/v1/runtime/${kind}`;
  }

  static async flush(timeoutMs = TELEMETRY_TIMEOUT_MS): Promise<void> {
    const pending = [...RuntimeTelemetry.pending];
    if (pending.length === 0) {
      return;
    }

    await Promise.race([
      Promise.allSettled(pending).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  }
}

function telemetryErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { status?: unknown; data?: unknown } }).response;
    return `status=${String(response?.status)} data=${JSON.stringify(response?.data)}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function sanitizeMetadata(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeObject(value, 0);
}

function sanitizeObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  if (depth >= MAX_METADATA_DEPTH) {
    return { truncated: true };
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (BLOCKED_METADATA_KEYS.has(key.toLowerCase())) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = sanitizeValue(nested, depth + 1);
  }
  return output;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth));
  }

  if (typeof value === "object" && value !== null) {
    return sanitizeObject(value as Record<string, unknown>, depth);
  }

  return String(value);
}
