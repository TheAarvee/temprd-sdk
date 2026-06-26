import { PIIStripper } from "../src/guards/pii-stripper";

describe("PIIStripper", () => {
  it("redacts credit cards", () => {
    const result = new PIIStripper().strip("card 4111 1111 1111 1111");

    expect(result.sanitized_content).toContain("[REDACTED:CARD]");
    expect(result.redacted_fields).toContain("credit_card");
  });

  it("redacts SSNs", () => {
    const result = new PIIStripper().strip("ssn 123-45-6789");

    expect(result.sanitized_content).toContain("[REDACTED:SSN]");
    expect(result.redacted_fields).toContain("ssn");
  });

  it("redacts emails", () => {
    const result = new PIIStripper().strip("email test@example.com");

    expect(result.sanitized_content).toContain("[REDACTED:EMAIL]");
    expect(result.redacted_fields).toContain("email");
  });

  it("redacts bearer tokens", () => {
    const result = new PIIStripper().strip("Authorization: Bearer abc.def-123");

    expect(result.sanitized_content).toContain("Bearer [REDACTED]");
    expect(result.redacted_fields).toContain("bearer_token");
  });

  it("passes clean content through unchanged", () => {
    const result = new PIIStripper().strip("clean content");

    expect(result.clean).toBe(true);
    expect(result.sanitized_content).toBe("clean content");
  });
});
