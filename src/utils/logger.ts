export class Logger {
  constructor(private readonly debug: boolean) {}

  info(module: string, message: string, data?: unknown): void {
    this.log("INFO", module, message, data);
  }

  warn(module: string, message: string, data?: unknown): void {
    this.log("WARN", module, message, data);
  }

  error(module: string, message: string, data?: unknown): void {
    this.log("ERROR", module, message, data);
  }

  private log(level: "INFO" | "WARN" | "ERROR", module: string, message: string, data?: unknown): void {
    if (!this.debug) {
      return;
    }

    const suffix = data === undefined ? "" : ` | ${JSON.stringify(data)}`;
    console.log(`[temprd:${module}] ${level}: ${message}${suffix}`);
  }
}
