import axios from "axios";
import { CloudClient, DEFAULT_CLOUD_URL } from "../src/healers/cloud-client";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("CloudClient", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("surfaces quota exceeded details from /job", async () => {
    mockedAxios.post.mockRejectedValue({
      response: {
        status: 402,
        data: {
          error: "quota_exceeded",
          plan: "free",
          limit: 50,
          used: 50,
          remaining: 0
        }
      }
    });

    const client = new CloudClient({ api_key: "tk", cloud_api_url: "https://cloud.test/v1/heal" });

    await expect(
      client.createJob({
        sdk_version: "0.1.0",
        error_type: "tool_error",
        error_message: "bad",
        message_history: [],
        session_id: "session"
      })
    ).rejects.toThrow(
      "quota_exceeded: free plan heal limit reached. Used 50/50 heals. Upgrade or subscribe to continue healing."
    );
  });

  it("uses api.temprd.app as the default cloud endpoint", async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        job_id: "hj_1",
        job_version: "schema_repair_v3",
        model_messages: [],
        output_schema: {},
        signature: "sig"
      }
    });
    const client = new CloudClient({ api_key: "tk" });

    await client.createJob({
      sdk_version: "0.1.0",
      error_type: "tool_error",
      error_message: "bad",
      message_history: [],
      session_id: "session"
    });

    expect(DEFAULT_CLOUD_URL).toBe("https://api.temprd.app");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.temprd.app/v1/heal/job",
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("normalizes custom base cloud URLs", async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: "no_fix", reason: "ok" } });
    const client = new CloudClient({ api_key: "tk", cloud_api_url: "http://localhost:8080" });

    await client.heal({
      sdk_version: "0.1.0",
      error_type: "tool_error",
      error_message: "bad",
      message_history: [],
      session_id: "session"
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "http://localhost:8080/v1/heal",
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("keeps custom /v1/heal URLs working", async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        job_id: "hj_1",
        job_version: "schema_repair_v3",
        model_messages: [],
        output_schema: {},
        signature: "sig"
      }
    });
    const client = new CloudClient({ api_key: "tk", cloud_api_url: "https://staging.test/v1/heal" });

    await client.createJob({
      sdk_version: "0.1.0",
      error_type: "tool_error",
      error_message: "bad",
      message_history: [],
      session_id: "session"
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://staging.test/v1/heal/job",
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("returns quota exceeded details from /validate", async () => {
    mockedAxios.post.mockRejectedValue({
      response: {
        status: 402,
        data: {
          error: "quota_exceeded",
          plan: "pro",
          limit: 1000,
          used: 1000,
          remaining: 0
        }
      }
    });

    const client = new CloudClient({ api_key: "tk", cloud_api_url: "https://cloud.test/v1/heal" });

    await expect(client.validateJob("hj_1", {})).resolves.toEqual({
      status: "no_fix",
      reason:
        "quota_exceeded: pro plan heal limit reached. Used 1000/1000 heals. Upgrade or subscribe to continue healing."
    });
  });
});
