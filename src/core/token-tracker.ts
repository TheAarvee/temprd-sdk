import type { temprdConfig } from "../types";

export class TokenTracker {
  private readonly budget: number;
  private total_used = 0;
  private warned = false;

  constructor(private readonly config: temprdConfig) {
    this.budget = config.token_budget ?? Infinity;
  }

  add(tokens: number): void {
    this.total_used += tokens;

    if (
      Number.isFinite(this.budget) &&
      !this.warned &&
      this.total_used >= this.budget * 0.8
    ) {
      this.warned = true;
      this.config.on_token_warning?.(this.total_used, this.budget);
    }
  }

  isExceeded(): boolean {
    return this.total_used >= this.budget;
  }

  getUsed(): number {
    return this.total_used;
  }

  getBudget(): number {
    return this.budget;
  }
}
