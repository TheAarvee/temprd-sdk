import type { PIIScanResult } from "../types";

const PII_PATTERNS: Array<{ field: string; pattern: RegExp; replacement: string }> = [
  { field: "credit_card", pattern: /\b(?:\d[ -]?){13,16}\b/g, replacement: "[REDACTED:CARD]" },
  { field: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED:SSN]" },
  {
    field: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED:EMAIL]"
  },
  {
    field: "phone",
    pattern: /(?<!\w)\+?\d[\d\s().-]{8,}\d(?!\w)/g,
    replacement: "[REDACTED:PHONE]"
  },
  {
    field: "password_field",
    pattern: /"password"\s*:\s*"[^"]*"/gi,
    replacement: '"password":"[REDACTED]"'
  },
  {
    field: "api_key_field",
    pattern: /"(api_key|apikey|secret|token)"\s*:\s*"[^"]*"/gi,
    replacement: '"$1":"[REDACTED]"'
  },
  {
    field: "bearer_token",
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    replacement: "Bearer [REDACTED]"
  }
];

export class PIIStripper {
  strip(content: string): PIIScanResult {
    const redacted_fields: string[] = [];
    let sanitized_content = content;

    for (const { field, pattern, replacement } of PII_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized_content)) {
        redacted_fields.push(field);
      }
      pattern.lastIndex = 0;
      sanitized_content = sanitized_content.replace(pattern, replacement);
      pattern.lastIndex = 0;
    }

    return {
      clean: redacted_fields.length === 0,
      redacted_fields,
      sanitized_content
    };
  }
}
