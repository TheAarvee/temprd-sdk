import type { InjectionScanResult, temprdMessage } from "../types";

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?instructions/i,
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+your\s+(previous\s+)?instructions/i,
  /disregard\s+(all\s+)?(previous\s+)?instructions/i,
  /you\s+are\s+now\s+/i,
  /new\s+persona/i,
  /forget\s+your\s+instructions/i,
  /system\s*prompt\s*:/i,
  /\[\[SYSTEM\]\]/i,
  /<!--\s*instructions/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+restrictions/i,
  /pretend\s+you\s+are/i,
  /your\s+new\s+instructions\s+are/i,
  /override\s+(previous\s+)?instructions/i
];

const ENCODED_CHARACTER_PATTERNS: RegExp[] = [/[\u200B-\u200D\uFEFF]/g, /\u202E/g];
const BLOCKED = "[temprd: Injection attempt blocked]";

export class InjectionGuard {
  scan(messages: temprdMessage[]): InjectionScanResult {
    const detections: string[] = [];
    const sanitized_messages = messages.map((message) => {
      if (message.role === "system") {
        return { ...message };
      }

      let content = message.content;
      for (const pattern of ENCODED_CHARACTER_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(content)) {
          detections.push(pattern.toString());
          pattern.lastIndex = 0;
          content = content.replace(pattern, "");
        }
      }

      for (const pattern of INJECTION_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(content)) {
          detections.push(pattern.toString());
          pattern.lastIndex = 0;
          content = content.replace(pattern, BLOCKED);
        }
      }

      return { ...message, content };
    });

    return {
      clean: detections.length === 0,
      detections,
      sanitized_messages
    };
  }
}
