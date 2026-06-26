import axios, { AxiosError } from "axios";
import type {
  HealingJob,
  HealPatch,
  HealRequest,
  HealValidateMetadata,
  HealValidateResponse,
  temprdConfig
} from "../types";

export const DEFAULT_CLOUD_URL = "https://api.temprd.app";
export const HEAL_TIMEOUT_MS = 5000;

export class CloudClient {
  private readonly apiKey: string;
  private readonly cloudUrl: string;
  private readonly timeoutMs: number;

  constructor(config: temprdConfig) {
    this.apiKey = config.api_key;
    this.cloudUrl = config.cloud_api_url ?? DEFAULT_CLOUD_URL;
    this.timeoutMs = config.cloud_timeout_ms ?? HEAL_TIMEOUT_MS;
  }

  async heal(request: HealRequest): Promise<HealPatch> {
    try {
      const response = await axios.post<HealPatch>(this.healEndpoint(), request, {
        headers: this.headers(),
        timeout: this.timeoutMs
      });

      return response.data;
    } catch (error) {
      return {
        status: "no_fix",
        reason: `Cloud API unreachable: ${this.errorMessage(error)}`
      };
    }
  }

  async createJob(request: HealRequest): Promise<HealingJob> {
    try {
      const response = await axios.post<HealingJob>(this.endpoint("job"), request, {
        headers: this.headers(),
        timeout: this.timeoutMs
      });
      return response.data;
    } catch (error) {
      throw new Error(this.errorMessage(error));
    }
  }

  async validateJob(
    jobId: string,
    candidateOutput: Record<string, unknown>,
    metadata: HealValidateMetadata = {}
  ): Promise<HealPatch> {
    try {
      const response = await axios.post<HealValidateResponse>(
        this.endpoint("validate"),
        {
          job_id: jobId,
          candidate_output: candidateOutput,
          model_provider: metadata.model_provider,
          model_name: metadata.model_name
        },
        {
          headers: this.headers(),
          timeout: this.timeoutMs
        }
      );
      return response.data.final_patch;
    } catch (error) {
      return {
        status: "no_fix",
        reason: this.errorMessage(error)
      };
    }
  }

  private headers(): Record<string, string> {
    return {
      "X-Heal-API-Key": this.apiKey,
      "Content-Type": "application/json"
    };
  }

  private healEndpoint(): string {
    const trimmed = this.cloudUrl.replace(/\/+$/, "");
    if (trimmed.endsWith("/v1/heal")) {
      return trimmed;
    }
    if (trimmed.endsWith("/v1")) {
      return `${trimmed}/heal`;
    }
    return `${trimmed}/v1/heal`;
  }

  private endpoint(kind: "job" | "validate"): string {
    const trimmed = this.cloudUrl.replace(/\/+$/, "");
    if (trimmed.endsWith("/v1/heal")) {
      return `${trimmed}/${kind}`;
    }
    if (trimmed.endsWith("/v1")) {
      return `${trimmed}/heal/${kind}`;
    }
    return `${trimmed}/v1/heal/${kind}`;
  }

  private errorMessage(error: unknown): string {
    const quotaMessage = this.quotaErrorMessage(error);
    if (quotaMessage) {
      return quotaMessage;
    }

    if (error instanceof AxiosError) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private quotaErrorMessage(error: unknown): string | null {
    if (!this.isRecord(error) || !this.isRecord(error.response)) {
      return null;
    }

    if (error.response.status !== 402) {
      return null;
    }

    const data = error.response.data;
    if (!this.isRecord(data) || data.error !== "quota_exceeded") {
      return "quota_exceeded";
    }

    const plan = typeof data.plan === "string" ? data.plan : "current";
    const used = typeof data.used === "number" ? data.used : null;
    const limit = typeof data.limit === "number" ? data.limit : null;
    const usage = used !== null && limit !== null ? ` Used ${used}/${limit} heals.` : "";
    return `quota_exceeded: ${plan} plan heal limit reached.${usage} Upgrade or subscribe to continue healing.`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
