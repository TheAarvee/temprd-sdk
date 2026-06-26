import type { HealingJob } from "../types";

export interface HealingInferenceDebug {
  enabled?: boolean;
  log?: (event: string, data: Record<string, unknown>) => void;
}

type OpenAICompatibleClient = {
  chat: {
    completions: {
      create: (params: unknown) => Promise<unknown>;
    };
  };
};

type AnthropicCompatibleClient = {
  messages: {
    create: (params: unknown) => Promise<unknown>;
  };
};

export async function executeHealingJob(
  providerClient: unknown,
  model: string,
  job: HealingJob,
  debug: HealingInferenceDebug = {}
): Promise<Record<string, unknown>> {
  if (isOpenAICompatible(providerClient)) {
    const response = await providerClient.chat.completions.create({
      model,
      messages: job.model_messages,
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });
    debugLog(debug, "raw_model_response", { response });
    const content = extractOpenAIContent(response);
    debugLog(debug, "raw_model_content", { content });
    const candidate = parseJsonContent(content);
    debugLog(debug, "parsed_candidate", { candidate });
    return candidate;
  }

  if (isAnthropicCompatible(providerClient)) {
    const system = job.model_messages.find((message) => message.role === "system")?.content;
    const messages = job.model_messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content
      }));
    const response = await providerClient.messages.create({
      model,
      system,
      messages,
      max_tokens: 1000,
      temperature: 0.1
    });
    debugLog(debug, "raw_model_response", { response });
    const content = extractAnthropicContent(response);
    debugLog(debug, "raw_model_content", { content });
    const candidate = parseJsonContent(content);
    debugLog(debug, "parsed_candidate", { candidate });
    return candidate;
  }

  throw new Error("temprd: Unsupported provider client for healing inference");
}

function debugLog(
  debug: HealingInferenceDebug,
  event: string,
  data: Record<string, unknown>
): void {
  if (debug.enabled) {
    debug.log?.(event, data);
  }
}

export function detectProviderName(providerClient: unknown): string {
  const baseUrl = (providerClient as { baseURL?: unknown; baseUrl?: unknown }).baseURL ??
    (providerClient as { baseURL?: unknown; baseUrl?: unknown }).baseUrl;

  if (typeof baseUrl === "string") {
    const normalized = baseUrl.toLowerCase();
    if (normalized.includes("groq.com")) {
      return "groq";
    }
    if (normalized.includes("openrouter.ai")) {
      return "openrouter";
    }
    if (normalized.includes("anthropic.com")) {
      return "anthropic";
    }
    if (normalized.includes("openai.com")) {
      return "openai";
    }
  }

  if (isAnthropicCompatible(providerClient)) {
    return "anthropic";
  }

  if (isOpenAICompatible(providerClient)) {
    return "openai_compatible";
  }

  return "unknown";
}

function isOpenAICompatible(value: unknown): value is OpenAICompatibleClient {
  const client = value as OpenAICompatibleClient;
  return typeof client?.chat?.completions?.create === "function";
}

function isAnthropicCompatible(value: unknown): value is AnthropicCompatibleClient {
  const client = value as AnthropicCompatibleClient;
  return typeof client?.messages?.create === "function";
}

function extractOpenAIContent(response: unknown): string {
  const choices = (response as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("temprd: Provider returned no healing content");
  }
  return content;
}

function extractAnthropicContent(response: unknown): string {
  const content = (response as { content?: Array<{ type?: string; text?: unknown }> }).content;
  const text = content?.find((part) => part.type === "text" && typeof part.text === "string")?.text;
  if (typeof text !== "string") {
    throw new Error("temprd: Provider returned no healing content");
  }
  return text;
}

function parseJsonContent(content: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("temprd: Provider healing output was not an object");
  }
  return parsed as Record<string, unknown>;
}
