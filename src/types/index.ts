export interface temprdMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export type CircuitState = "CLOSED" | "OPEN";

export interface HealPatch {
  status: "healed" | "failed" | "no_fix";
  patch?: {
    type: "tool_call" | "payload" | "message";
    original: unknown;
    healed: unknown;
    confidence: number;
    strategy: string;
  };
  reason?: string;
}

export interface HealRequest {
  sdk_version: string;
  healing_mode?: "production" | "benchmark_strict";
  error_type: string;
  error_message: string;
  tool_name?: string | null;
  tool_schema?: Record<string, unknown> | null;
  /**
   * @deprecated Use tool_schema for inference. Cloud validation may still use
   * this field as a strict acceptance guard.
   */
  expected_fields?: string[] | null;
  tool_description?: string | null;
  previous_successful_call?: Record<string, unknown> | null;
  successful_call_examples?: Record<string, unknown>[] | null;
  error_response_body?: Record<string, unknown> | null;
  failed_tool_call?: unknown;
  failed_response?: unknown;
  message_history: temprdMessage[];
  session_id: string;
}

export interface HealingJob {
  job_id: string;
  job_version: string;
  model_messages: Array<{ role: string; content: string }>;
  output_schema: Record<string, unknown>;
  signature: string;
}

export interface HealValidateResponse {
  status: "healed" | "failed" | "no_fix";
  final_patch: HealPatch;
  accepted: boolean;
}

export interface HealValidateMetadata {
  model_provider?: string | null;
  model_name?: string | null;
}

export interface RuntimeProtectionEvent {
  session_id?: string | null;
  sdk_version?: string | null;
  event_type: string;
  protection_category: string;
  status: "detected" | "blocked" | "allowed" | "warned" | "exceeded" | "compressed" | "error";
  action?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  tokens_used?: number | null;
  token_budget?: number | null;
  prompt_hash?: string | null;
  failure_count?: number | null;
  latency_ms?: number | null;
}

export interface SdkLogEvent {
  session_id?: string | null;
  sdk_version?: string | null;
  level: "debug" | "info" | "warn" | "error";
  event_name: string;
  message?: string | null;
  status?: string | null;
  error_type?: string | null;
  error_message?: string | null;
  heal_status?: string | null;
  metadata?: Record<string, unknown>;
}

export type HealingContext = Partial<
  Pick<
    HealRequest,
    | "healing_mode"
    | "tool_name"
    | "tool_schema"
    | "expected_fields"
    | "tool_description"
    | "previous_successful_call"
    | "successful_call_examples"
    | "error_response_body"
    | "failed_tool_call"
    | "failed_response"
  >
>;

export interface CircuitBreakerState {
  state: CircuitState;
  failure_count: number;
  last_error: string | null;
  tripped_at: number | null;
}

export interface SessionState {
  session_id: string;
  total_tokens_used: number;
  prompt_hashes: Map<string, number>;
  circuit_breakers: Map<string, CircuitBreakerState>;
  started_at: number;
}

export interface temprdConfig {
  api_key: string;
  /**
   * Optional advanced override. Defaults to https://api.temprd.app.
   * Use this for self-hosted, staging, or local Cloud deployments.
   */
  cloud_api_url?: string;
  cloud_timeout_ms?: number;
  token_budget?: number;
  circuit_breaker_threshold?: number;
  sensitive_operations?: string[];
  on_heal?: (patch: HealPatch) => void;
  on_circuit_break?: (tool: string) => void;
  on_token_warning?: (used: number, limit: number) => void;
  on_sensitive_operation?: (
    tool_name: string,
    args: unknown
  ) => Promise<boolean>;
  debug?: boolean;
}

export type TemprdConfig = temprdConfig;
export type TemprdMessage = temprdMessage;

export interface ToolWrapperOptions extends Partial<temprdConfig> {
  /**
   * Compatibility form for passing SDK config. You can also pass api_key and
   * advanced overrides directly on this options object.
   */
  config?: temprdConfig;
  sensitive?: boolean;
  validate_response?: boolean;
  tool_schema?: Record<string, unknown>;
  expected_fields?: string[];
  tool_description?: string;
  on_error?: (error: unknown) => void;
}

export type WrappedTool<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

export interface InjectionScanResult {
  clean: boolean;
  detections: string[];
  sanitized_messages: temprdMessage[];
}

export interface PIIScanResult {
  clean: boolean;
  redacted_fields: string[];
  sanitized_content: string;
}
