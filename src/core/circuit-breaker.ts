import type { CircuitBreakerState, CircuitState } from "../types";

export class CircuitBreakerOpenError extends Error {
  constructor(tool_name: string, failure_count: number, last_error: string | null) {
    super(
      `Circuit breaker OPEN for "${tool_name}" after ${failure_count} failures. Last error: ${last_error}`
    );
    this.name = "CircuitBreakerOpenError";
  }
}

export class CircuitBreaker {
  private readonly states = new Map<string, CircuitBreakerState>();

  constructor(private readonly threshold: number = 3) {}

  recordFailure(tool_name: string, error: string): CircuitState {
    const state = this.getState(tool_name);
    const failure_count = state.failure_count + 1;
    const nextState: CircuitBreakerState = {
      state: failure_count >= this.threshold ? "OPEN" : "CLOSED",
      failure_count,
      last_error: error,
      tripped_at: failure_count >= this.threshold ? Date.now() : null
    };

    this.states.set(tool_name, nextState);
    return nextState.state;
  }

  recordSuccess(tool_name: string): void {
    this.states.set(tool_name, {
      state: "CLOSED",
      failure_count: 0,
      last_error: null,
      tripped_at: null
    });
  }

  isOpen(tool_name: string): boolean {
    return this.getState(tool_name).state === "OPEN";
  }

  getState(tool_name: string): CircuitBreakerState {
    return (
      this.states.get(tool_name) ?? {
        state: "CLOSED",
        failure_count: 0,
        last_error: null,
        tripped_at: null
      }
    );
  }
}
