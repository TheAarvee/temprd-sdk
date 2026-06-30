import { Temprd, temprd } from "../src";
import { clearRuntimeConfig, getRuntimeProviderModel } from "../src/core/runtime-config";
import { HealPipeline } from "../src/healers/heal-pipeline";

describe("public API", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearRuntimeConfig();
  });

  it("exports Temprd.wrap_client", async () => {
    const response = { id: "ok" };
    const create = jest.fn().mockResolvedValue(response);
    const client = Temprd.wrap_client(
      {
        chat: {
          completions: {
            create
          }
        }
      },
      { api_key: "tk" }
    );

    await expect(
      client.chat.completions.create({ messages: [{ role: "user", content: "hello" }] })
    ).resolves.toBe(response);
  });

  it("captures model from wrapped chat completions calls", async () => {
    const create = jest.fn().mockResolvedValue({ id: "ok" });
    const client = Temprd.wrap_client(
      {
        chat: {
          completions: {
            create
          }
        }
      },
      { api_key: "tk" }
    );

    await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "hello" }]
    });

    expect(getRuntimeProviderModel()).toBe("gpt-4.1-mini");
  });

  it("keeps lowercase temprd as a compatibility alias", async () => {
    const response = { id: "ok" };
    const create = jest.fn().mockResolvedValue(response);
    const client = temprd.wrap_client(
      {
        chat: {
          completions: {
            create
          }
        }
      },
      { api_key: "tk" }
    );

    await expect(
      client.chat.completions.create({ messages: [{ role: "user", content: "hello" }] })
    ).resolves.toBe(response);
  });

  it("exports Temprd.wrapTool", async () => {
    const tool = Temprd.wrapTool("sum", (a: number, b: number) => ({ total: a + b }));

    await expect(tool(2, 3)).resolves.toEqual({ total: 5 });
  });

  it("requires approval for sensitive wrapped tools", async () => {
    const approval = jest.fn().mockResolvedValue(true);
    const tool = Temprd.wrapTool("delete_record", (id: string) => ({ id }), {
      sensitive: true,
      config: {
        api_key: "tk",
        on_sensitive_operation: approval
      }
    });

    await expect(tool("user_123")).resolves.toEqual({ id: "user_123" });
    expect(approval).toHaveBeenCalledWith("delete_record", ["user_123"]);
  });

  it("repairs an observed field rename locally without model inference", async () => {
    const heal = jest.spyOn(HealPipeline.prototype, "heal").mockResolvedValue({
      status: "healed",
      patch: {
        type: "tool_call",
        original: { user_id: 123 },
        healed: { id: 123 },
        confidence: 0.99,
        strategy: "rename user_id to id"
      }
    });
    const getUser = jest.fn((args: { id?: number; user_id?: number }) => {
      if ("user_id" in args) {
        throw new Error("Expected field id but received user_id");
      }

      return { id: args.id, name: "John" };
    });
    const wrapped = Temprd.wrapTool("get_user", getUser, {
      config: { api_key: "tk" }
    });

    await expect(wrapped({ user_id: 123 })).resolves.toEqual({ id: 123, name: "John" });

    expect(getUser).toHaveBeenCalledTimes(2);
    expect(getUser).toHaveBeenNthCalledWith(1, { user_id: 123 });
    expect(getUser).toHaveBeenNthCalledWith(2, { id: 123 });
    expect(heal).not.toHaveBeenCalled();
  });

  it("reuses wrap_client config for wrapped tool healing", async () => {
    const heal = jest.spyOn(HealPipeline.prototype, "heal").mockResolvedValue({
      status: "healed",
      patch: {
        type: "tool_call",
        original: { user_id: 123 },
        healed: { id: 123 },
        confidence: 0.99,
        strategy: "rename user_id to id"
      }
    });
    const client = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({ id: "ok" })
        }
      }
    };
    const getUser = jest.fn((args: { id?: number; user_id?: number }) => {
      if ("user_id" in args) {
        throw new Error("Expected field id but received user_id");
      }

      return { id: args.id, name: "John" };
    });

    Temprd.wrap_client(client, {
      api_key: "tk-global",
      cloud_api_url: "https://example.test/heal"
    });
    const wrapped = Temprd.wrapTool("get_user", getUser);

    await expect(wrapped({ user_id: 123 })).resolves.toEqual({ id: 123, name: "John" });
    expect(heal).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenNthCalledWith(2, { id: 123 });
  });

  it("wraps a LangChain-style model through its nested provider client", async () => {
    const create = jest.fn().mockResolvedValue({ id: "ok" });
    const model = {
      client: { chat: { completions: { create } } },
      async invoke(params: unknown) {
        return this.client.chat.completions.create(params as never);
      }
    };
    const wrapped = Temprd.wrap_client(model, { api_key: "tk" });

    await wrapped.invoke({
      model: "groq-model",
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }]
    });

    expect(create).toHaveBeenCalled();
    expect(create.mock.calls[0][0].messages[0].content).toEqual([
      { type: "text", text: "hello" }
    ]);
  });

  it("keeps propagating wrapped tool errors when no healing config is provided", async () => {
    const wrapped = Temprd.wrapTool("get_user", (_args: { user_id: number }) => {
      throw new Error("Expected field id but received user_id");
    });

    await expect(wrapped({ user_id: 123 })).rejects.toThrow(
      "Expected field id but received user_id"
    );
  });
});
