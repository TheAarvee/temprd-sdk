import { HealPipeline } from "../src/healers/heal-pipeline";
import {
  clearRuntimeConfig,
  setRuntimeProviderClient,
  setRuntimeProviderModel
} from "../src/core/runtime-config";
import type { HealPatch, HealRequest } from "../src/types";

describe("HealPipeline", () => {
  afterEach(() => {
    clearRuntimeConfig();
  });

  it("strips PII before cloud call", async () => {
    setRuntimeProviderClient({
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: "{}" } }] }) } }
    });
    setRuntimeProviderModel("gpt-4.1-mini");
    const createJob = jest.fn().mockResolvedValue({
      job_id: "hj_123",
      job_version: "tool_repair_v1",
      model_messages: [],
      output_schema: {},
      signature: "sig"
    });
    const pipeline = new HealPipeline(
      { api_key: "tk" },
      {
        heal: jest.fn(),
        createJob,
        validateJob: jest.fn().mockResolvedValue({ status: "no_fix" })
      } as never
    );

    await pipeline.heal(
      "tool_error",
      "bad",
      [{ role: "user", content: "email test@example.com" }],
      "session"
    );

    expect(createJob.mock.calls[0][0].message_history[0].content).toBe("email [REDACTED:EMAIL]");
  });

  it("adds context-aware healing fields to cloud request", async () => {
    setRuntimeProviderClient({
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: "{}" } }] }) } }
    });
    setRuntimeProviderModel("gpt-4.1-mini");
    const createJob = jest.fn().mockResolvedValue({
      job_id: "hj_123",
      job_version: "tool_repair_v1",
      model_messages: [],
      output_schema: {},
      signature: "sig"
    });
    const pipeline = new HealPipeline(
      { api_key: "tk" },
      {
        heal: jest.fn(),
        createJob,
        validateJob: jest.fn().mockResolvedValue({ status: "no_fix" })
      } as never
    );

    await pipeline.heal("tool_error", "bad", [], "session", undefined, undefined, {
      tool_name: "get_user",
      tool_schema: { properties: { id: {}, email: {} } },
      tool_description: "Get a user",
      previous_successful_call: { tool_name: "get_user", arguments: { id: 123 } },
      successful_call_examples: [{ tool_name: "get_user", arguments: { id: 123 } }],
      error_response_body: { error: "Expected field id" }
    });

    expect(createJob.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        sdk_version: "0.1.1",
        tool_name: "get_user",
        expected_fields: ["id", "email"],
        previous_successful_call: { tool_name: "get_user", arguments: { id: 123 } },
        successful_call_examples: [{ tool_name: "get_user", arguments: { id: 123 } }],
        error_response_body: { error: "Expected field id" }
      })
    );
  });

  it("bounds healing history to reduce provider input tokens", async () => {
    setRuntimeProviderClient({
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: "{}" } }] }) } }
    });
    setRuntimeProviderModel("gpt-4.1-mini");
    const createJob = jest.fn().mockResolvedValue({
      job_id: "hj_123",
      job_version: "tool_repair_v1",
      model_messages: [],
      output_schema: {},
      signature: "sig"
    });
    const pipeline = new HealPipeline(
      { api_key: "tk", max_healing_messages: 2, max_healing_content_chars: 20 },
      {
        createJob,
        validateJob: jest.fn().mockResolvedValue({ status: "no_fix" })
      } as never
    );
    const messages = Array.from({ length: 8 }, (_, index) => ({
      role: "user" as const,
      content: `${index}-${"x".repeat(100)}`
    }));

    await pipeline.heal("payload", "bad", messages, "session");

    const history = createJob.mock.calls[0][0].message_history;
    expect(history).toHaveLength(2);
    expect(history[0].content).toHaveLength(20);
    expect(history[0].content.startsWith("6-")).toBe(true);
  });

  it("fires on_heal callback on healed patch", async () => {
    const patch: HealPatch = {
      status: "healed",
      patch: {
        type: "message",
        original: [],
        healed: [],
        confidence: 0.9,
        strategy: "retry"
      }
    };
    const on_heal = jest.fn();
    setRuntimeProviderClient({
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(patch) } }] }) } }
    });
    setRuntimeProviderModel("gpt-4.1-mini");
    const pipeline = new HealPipeline(
      { api_key: "tk", on_heal },
      {
        heal: jest.fn(),
        createJob: jest.fn().mockResolvedValue({
          job_id: "hj_123",
          job_version: "tool_repair_v1",
          model_messages: [],
          output_schema: {},
          signature: "sig"
        }),
        validateJob: jest.fn().mockResolvedValue(patch)
      } as never
    );

    await pipeline.heal("tool_error", "bad", [], "session");

    expect(on_heal).toHaveBeenCalledWith(patch);
  });

  it("does not fire callback for no_fix", async () => {
    const on_heal = jest.fn();
    const pipeline = new HealPipeline(
      { api_key: "tk", on_heal },
      { heal: jest.fn().mockResolvedValue({ status: "no_fix" }) } as never
    );

    await pipeline.heal("tool_error", "bad", [], "session");

    expect(on_heal).not.toHaveBeenCalled();
  });

  it("runs customer-provider healing through job and validate endpoints", async () => {
    const candidate = {
      status: "healed",
      patch: {
        type: "tool_call",
        original: { user_id: 123 },
        healed: { id: 123 },
        confidence: 0.95,
        strategy: "parameter_renaming"
      }
    };
    const providerCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(candidate) } }]
    });
    setRuntimeProviderClient({
      chat: {
        completions: {
          create: providerCreate
        }
      }
    });
    setRuntimeProviderModel("gpt-4.1-mini");

    const finalPatch: HealPatch = {
      status: "healed",
      patch: {
        type: "tool_call",
        original: { user_id: 123 },
        healed: { id: 123 },
        confidence: 0.95,
        strategy: "parameter_renaming"
      }
    };
    const cloudClient = {
      heal: jest.fn(),
      createJob: jest.fn().mockResolvedValue({
        job_id: "hj_123",
        job_version: "tool_repair_v1",
        model_messages: [{ role: "user", content: "repair this call" }],
        output_schema: {},
        signature: "sig"
      }),
      validateJob: jest.fn().mockResolvedValue(finalPatch)
    };
    const on_heal = jest.fn();
    const pipeline = new HealPipeline(
      { api_key: "tk", on_heal },
      cloudClient as never
    );

    const result = await pipeline.heal("tool_error", "bad", [], "session");

    expect(result).toEqual(finalPatch);
    expect(cloudClient.createJob).toHaveBeenCalledWith(expect.objectContaining({
      error_type: "tool_error",
      error_message: "bad"
    }));
    expect(providerCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "repair this call" }]
    }));
    expect(cloudClient.validateJob).toHaveBeenCalledWith("hj_123", candidate, {
      model_provider: "openai_compatible",
      model_name: "gpt-4.1-mini"
    });
    expect(cloudClient.heal).not.toHaveBeenCalled();
    expect(on_heal).toHaveBeenCalledWith(finalPatch);
  });
});
