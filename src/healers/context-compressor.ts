import type { temprdMessage } from "../types";

export const MAX_MESSAGES_BEFORE_COMPRESS = 20;
export const MESSAGES_TO_KEEP_RECENT = 6;

export class ContextCompressor {
  shouldCompress(messages: temprdMessage[]): boolean {
    return messages.length > MAX_MESSAGES_BEFORE_COMPRESS;
  }

  compress(messages: temprdMessage[]): temprdMessage[] {
    if (!this.shouldCompress(messages)) {
      return messages;
    }

    const systemMessages = messages.filter((message) => message.role === "system");
    const nonSystemMessages = messages.filter((message) => message.role !== "system");
    const recentMessages = nonSystemMessages.slice(-MESSAGES_TO_KEEP_RECENT);
    const olderMessages = nonSystemMessages.slice(0, -MESSAGES_TO_KEEP_RECENT);
    const summary = olderMessages
      .filter((message) => message.role === "tool" || message.role === "assistant")
      .map((message) => `${message.role.toUpperCase()}: ${message.content.slice(0, 200)}`)
      .join("\n");

    return [
      ...systemMessages,
      { role: "user", content: `[temprd CONTEXT SUMMARY]\n${summary}` },
      ...recentMessages
    ];
  }
}
