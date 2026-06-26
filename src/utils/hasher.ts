import { createHash } from "crypto";
import type { temprdMessage } from "../types";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashMessages(messages: temprdMessage[]): string {
  return sha256(messages.map((message) => `${message.role}:${message.content}`).join("|"));
}

export function hashToolCall(tool_name: string, args: unknown): string {
  return sha256(`${tool_name}:${JSON.stringify(args)}`);
}
