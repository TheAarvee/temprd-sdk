import type { temprdConfig } from "../types";

export class SensitivityGate {
  private readonly sensitiveOperations: Set<string>;

  constructor(private readonly config: temprdConfig) {
    this.sensitiveOperations = new Set(config.sensitive_operations ?? []);
  }

  isSensitive(tool_name: string): boolean {
    return this.sensitiveOperations.has(tool_name);
  }

  async requestApproval(tool_name: string, args: unknown): Promise<boolean> {
    if (!this.config.on_sensitive_operation) {
      return false;
    }

    return this.config.on_sensitive_operation(tool_name, args);
  }
}
