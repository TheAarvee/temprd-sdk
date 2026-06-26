export type ToolArguments = Record<string, unknown>;

export type ToolResult = {
  ok: true;
  tool: string;
  data: Record<string, unknown>;
};

export type ApprovalCallback = (toolName: string, args: unknown) => Promise<boolean>;

export function getUser(args: ToolArguments): ToolResult {
  if ("user_id" in args) {
    throw new Error("Expected field id but received user_id");
  }

  if (typeof args.id !== "number") {
    throw new Error("Missing required field id");
  }

  return {
    ok: true,
    tool: "getUser",
    data: {
      id: args.id,
      name: "John"
    }
  };
}

export function unstableTool(): never {
  throw new Error("unstableTool failed");
}

export async function deleteCustomer(
  args: ToolArguments,
  approve: ApprovalCallback
): Promise<ToolResult> {
  const approved = await approve("delete_customer", args);
  if (!approved) {
    throw new Error("Sensitive operation blocked");
  }

  return {
    ok: true,
    tool: "deleteCustomer",
    data: {
      deleted: true,
      customer_id: args.customer_id
    }
  };
}

export type FakeCompletionParams = {
  messages?: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
  operation?: "getUser" | "unstableTool" | "tokenUsage" | "echo";
  tool_arguments?: ToolArguments;
  usage_tokens?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  [key: string]: unknown;
};

export class FakeOpenAIClient {
  calls = 0;
  lastParams: FakeCompletionParams | null = null;
  readonly receivedParams: FakeCompletionParams[] = [];

  chat = {
    completions: {
      create: async (params: FakeCompletionParams): Promise<unknown> => {
        this.calls += 1;
        this.lastParams = params;
        this.receivedParams.push(params);

        if (params.operation === "getUser") {
          return getUser(params.tool_arguments ?? {});
        }

        if (params.operation === "unstableTool") {
          unstableTool();
        }

        if (params.operation === "tokenUsage") {
          return {
            id: "token-usage",
            usage: {
              total_tokens: params.usage_tokens ?? 0
            }
          };
        }

        return {
          id: "ok",
          messages: params.messages,
          usage: {
            total_tokens: params.usage_tokens ?? 1
          }
        };
      }
    }
  };
}

export function getUserToolDefinition(): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: "getUser",
      description: "Fetch a user by id.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number"
          }
        },
        required: ["id"]
      }
    }
  };
}
