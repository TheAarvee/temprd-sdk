import { CircuitBreaker, CircuitBreakerOpenError } from "../src/core/circuit-breaker";

describe("CircuitBreaker", () => {
  it("transitions from CLOSED to OPEN at threshold", () => {
    const breaker = new CircuitBreaker(3);

    expect(breaker.recordFailure("fetch_user", "one")).toBe("CLOSED");
    expect(breaker.recordFailure("fetch_user", "two")).toBe("CLOSED");
    expect(breaker.recordFailure("fetch_user", "three")).toBe("OPEN");
    expect(breaker.isOpen("fetch_user")).toBe(true);
  });

  it("resets on recordSuccess", () => {
    const breaker = new CircuitBreaker(2);

    breaker.recordFailure("fetch_user", "one");
    breaker.recordSuccess("fetch_user");

    expect(breaker.getState("fetch_user")).toEqual({
      state: "CLOSED",
      failure_count: 0,
      last_error: null,
      tripped_at: null
    });
  });

  it("formats CircuitBreakerOpenError message", () => {
    const error = new CircuitBreakerOpenError("fetch_user", 3, "bad field");

    expect(error.name).toBe("CircuitBreakerOpenError");
    expect(error.message).toBe(
      'Circuit breaker OPEN for "fetch_user" after 3 failures. Last error: bad field'
    );
  });

  it("tracks each tool independently", () => {
    const breaker = new CircuitBreaker(2);

    breaker.recordFailure("fetch_user", "one");

    expect(breaker.getState("fetch_user").failure_count).toBe(1);
    expect(breaker.getState("send_email").failure_count).toBe(0);
  });
});
