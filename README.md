<p align="center">
  <picture>
    <source srcset="assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset="assets/logo-light.svg" media="(prefers-color-scheme: light)">
    <img src="assets/logo-light.svg" alt="Temprd" width="420" />
  </picture>
</p>

<div align="center">

**Runtime reliability infrastructure for AI agents.**

[![npm Version](https://www.shieldcn.dev/npm/@temprd/sdk.svg?variant=secondary&size=sm&color=c50000)](https://www.npmjs.com/package/@temprd/sdk)
[![TypeScript](https://www.shieldcn.dev/badge/Language-TypeScript-3178C6.svg?logo=typescript&variant=branded&size=sm&color=166eff)]([https://nodejs.org/](https://www.typescriptlang.org/))
[![badge](https://shieldcn.dev/badge/Node.js-abcde3.svg?logo=nodedotjs&color=10bf2f&valueColor=115809&labelTextColor=115809)](https://nodejs.org/)
[![License](https://www.shieldcn.dev/github/license/TheAarvee/temprd-sdk.svg?variant=ghost&size=sm&color=000000&labelColor=505051&valueColor=ffffff)](https://github.com/TheAarvee/temprd-sdk?tab=MIT-1-ov-file)

</div>

##


Temprd wraps AI clients and tools to make agents more reliable in production. It can repair recoverable tool failures, protect agent execution at runtime, and retry validated fixes with minimal integration.

Self-Healing uses the developer's configured LLM provider, while Temprd validates the final repair before it is applied.

**With Temprd vs Without Temprd**

<img width="14232" height="9336" alt="Doc with without" src="https://github.com/user-attachments/assets/36af3b23-87bc-4f4e-a885-f05e58a825c9" />

---

## Make Agents Reliable

### Install

```bash
npm install @temprd/sdk
```

### Quickstart

```typescript
import "dotenv/config";
import OpenAI from "openai";
import { Temprd } from "@temprd/sdk";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const client = Temprd.wrap_client(openai, {
  api_key: process.env.TEMPRD_API_KEY!,
  token_budget: 50_000,
  circuit_breaker_threshold: 3,
  sensitive_operations: ["delete_user", "charge_payment"]
});

async function getUser(args: { id: number }) {
  return {
    id: args.id,
    name: "Ada Lovelace"
  };
}

const getUserTool = Temprd.wrapTool("get_user", getUser, {
  tool_schema: {
    type: "object",
    properties: {
      id: { type: "number" }
    },
    required: ["id"]
  },
  tool_description: "Fetch a user by numeric id."
});

await client.chat.completions.create({
  model: "gpt-4.1-mini",
  messages: [{ role: "user", content: "Load user 123" }]
});

const user = await getUserTool({ id: 123 });
console.log(user);
```

## Features

| Capability | Temprd | LangChain | CrewAI |
|------------|:-------:|:---------:|:------:|
| Automatic tool-call healing | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | - | - |
| Tool schema drift recovery | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | - | - |
| Payload repair | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | - | - |
| Structured output recovery | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | ![badge](https://shieldcn.dev/badge/~.svg?size=xs&theme=zinc) | ![badge](https://shieldcn.dev/badge/~.svg?size=xs&theme=zinc) |
| Prompt injection protection | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | - | - |
| PII redaction | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | - | - |
| Context compression | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | ![badge](https://shieldcn.dev/badge/~.svg?size=xs&theme=zinc) | ![badge](https://shieldcn.dev/badge/~.svg?size=xs&theme=zinc) |
| Circuit breakers | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | - | - |
| Token budgeting | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | ![badge](https://shieldcn.dev/badge/~.svg?size=xs&theme=zinc) | ![badge](https://shieldcn.dev/badge/~.svg?size=xs&theme=zinc) |
| Sensitive operation governance | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | - | - |
| Runtime telemetry | ![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) | ![badge](https://shieldcn.dev/badge/~.svg?size=xs&theme=zinc) | ![badge](https://shieldcn.dev/badge/~.svg?size=xs&theme=zinc) |

![badge](https://shieldcn.dev/badge/✓.svg?size=xs&theme=green) Supported   ![badge](https://shieldcn.dev/badge/~.svg?size=xs&theme=zinc) Partial     - Not supported



## How Temprd works

```text
Agent
  |
  v
Temprd SDK
  |
  v
Runtime Protection
  |
  v
Tool Execution
  |
  v
Failure
  |
  v
Customer LLM
  |
  v
Temprd Validation
  |
  v
Retry
  |
  v
Success
```

Provider API keys are never sent to Temprd Cloud. The SDK executes healing jobs
with the customer's provider client, then Temprd validates the candidate repair
before the SDK retries.



## Core APIs

<table>
<tr>
<td width="50%" valign="top">

### `Temprd.wrap_client()`

Wraps an AI provider client and stores SDK-wide configuration.

Use it to enable runtime protection, model capture, token tracking, circuit
breakers, telemetry, and healing configuration.

</td>
<td width="50%" valign="top">

### `Temprd.wrapTool()`

Wraps a tool function so Temprd can catch failures, request a validated repair,
apply the patch, and retry when recovery is possible.

</td>
</tr>
</table>



## Runtime protection

Runtime protection runs locally in the SDK and does not require extra model
calls.

| Protection | What Temprd does |
|---|---|
| Prompt injection | Detects direct and indirect instruction override attempts. |
| PII redaction | Redacts sensitive data before outbound model or healing calls. |
| Context compression | Compresses long histories while preserving recent turns. |
| Token tracking | Tracks usage against developer-defined budgets. |
| Circuit breakers | Stops repeated failures and retry cascades. |
| Sensitive operations | Requires developer approval for configured high-risk tools. |

---

## AI-powered Self-Healing

Temprd repairs common production failures that break agent workflows by folowing:  

- Analyze
- Recover
- Validate
- Retry

| Failure class | Example |
|---|---|
| Tool schema drift | `user_id` becomes `id` |
| Payload mismatch | Nested or wrapped arguments need restructuring |
| Response shape drift | API response fields move or change shape |
| Structured output issues | Model output no longer matches the expected schema |
| Third-party integration changes | External APIs deprecate methods or fields |

Every repair is validated before retry. If Temprd cannot produce an accepted
patch, the original failure is surfaced instead of applying an unsafe fix.

---

## Benchmarks

Temprd is evaluated with recovery and runtime protection benchmark suites.

| Suite | Coverage |
|---|---|
| Recovery Benchmarks | 100 synthetic production-inspired failures |
| Production Incident Benchmark | Real-world API and integration drift cases |
| Runtime Protection Benchmarks | Prompt injection, PII, context, token, circuit breaker, and governance cases |

---

## License

MIT. See [LICENSE](./LICENSE).

<p align="center">
  <strong>Build agents that recover instead of stopping.</strong>
</p>
