import type { InjectionScanResult, temprdMessage } from "../types";
import { mapMessageText } from "../utils/message-content";

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

      const content = mapMessageText(message.content, (input) => {
        let text = input;
        for (const pattern of ENCODED_CHARACTER_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) {
            detections.push(pattern.toString());
            pattern.lastIndex = 0;
            text = text.replace(pattern, "");
          }
        }
        for (const pattern of INJECTION_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) {
            detections.push(pattern.toString());
            pattern.lastIndex = 0;
            text = text.replace(pattern, BLOCKED);
          }
        }
        return text;
      });

      return { ...message, content };
    });

    return {
      clean: detections.length === 0,
      detections,
      sanitized_messages
    };
  }
}
