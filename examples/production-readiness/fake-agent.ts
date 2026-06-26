import type { FakeCompletionParams, FakeOpenAIClient, ToolResult } from "./fake-tools";

export class FakeAgent {
  constructor(private readonly client: FakeOpenAIClient) {}

  async run(params: FakeCompletionParams): Promise<{ completed: boolean; result: ToolResult }> {
    const result = (await this.client.chat.completions.create({
      ...params,
      messages: [
        ...(params.messages ?? []),
        {
          role: "assistant",
          content: "Thinking: I need to call the user lookup tool."
        }
      ]
    })) as ToolResult;

    return {
      completed: result.ok,
      result
    };
  }
}
