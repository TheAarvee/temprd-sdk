export function mapMessageText(
  content: unknown,
  transform: (text: string) => string
): unknown {
  if (typeof content === "string") return transform(content);
  if (content == null) return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return transform(part);
      if (!isRecord(part)) return part;
      if (typeof part.text === "string") return { ...part, text: transform(part.text) };
      if (typeof part.content === "string") {
        return { ...part, content: transform(part.content) };
      }
      return part;
    });
  }
  if (isRecord(content) && typeof content.text === "string") {
    return { ...content, text: transform(content.text) };
  }
  return content;
}

export function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content.map(messageContentToText).filter(Boolean).join("\n");
  }
  if (isRecord(content)) {
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
