export type FailureKind =
  | "rate_limit"
  | "authentication"
  | "transient"
  | "schema_drift"
  | "payload"
  | "unknown";

export type FailureClassification = {
  kind: FailureKind;
  retryable: boolean;
  healable: boolean;
  retryAfterMs?: number;
};

export function classifyFailure(error: unknown): FailureClassification {
  const status = readStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (status === 429 || /rate.?limit|too many requests/.test(normalized)) {
    return { kind: "rate_limit", retryable: true, healable: false, retryAfterMs: retryAfter(error, message) };
  }
  if (status === 401 || status === 403 || /unauthori[sz]ed|invalid api key|forbidden/.test(normalized)) {
    return { kind: "authentication", retryable: false, healable: false };
  }
  if (
    (status !== null && status >= 500) ||
    /timeout|timed out|econnreset|econnrefused|socket hang up|temporarily unavailable/.test(normalized)
  ) {
    return { kind: "transient", retryable: true, healable: false, retryAfterMs: 500 };
  }
  if (/expected (?:field )?["']?[\w.$-]+["']? but received|schema|missing field|response shape/.test(normalized)) {
    return { kind: "schema_drift", retryable: false, healable: true };
  }
  if (/invalid payload|invalid argument|bad request|malformed/.test(normalized)) {
    return { kind: "payload", retryable: false, healable: true };
  }
  return { kind: "unknown", retryable: false, healable: true };
}

function readStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const value = error as { status?: unknown; response?: { status?: unknown } };
  const status = value.status ?? value.response?.status;
  return typeof status === "number" ? status : null;
}

function retryAfter(error: unknown, message: string): number {
  if (typeof error === "object" && error !== null) {
    const headers = (error as { response?: { headers?: Record<string, unknown> } }).response?.headers;
    const value = headers?.["retry-after"];
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value) * 1000;
  }
  const seconds = message.match(/(?:try again in|retry after)\s*([\d.]+)\s*s/i)?.[1];
  return seconds ? Math.ceil(Number(seconds) * 1000) : 1000;
}
