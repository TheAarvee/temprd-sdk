<p align="center">
  <picture>
    <source srcset="assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset="assets/logo-light.svg" media="(prefers-color-scheme: light)">
    <img src="assets/logo-light.svg" alt="Temprd" width="420" />
  </picture>
</p>

# Temprd SDK

Runtime reliability infrastructure for AI agents.

[![npm version](https://img.shields.io/npm/v/@temprd/sdk.svg)](https://www.npmjs.com/package/@temprd/sdk)
[![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178C6.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org/)

## What is Temprd?

Temprd wraps AI clients and tools to make agents more reliable in production.
It can repair recoverable tool failures, protect agent execution at runtime,
and retry validated fixes with minimal integration. Healing uses the
developer's configured LLM provider, while Temprd validates the final repair
before it is applied.

<img width="14232" height="9336" alt="Doc with without" src="https://github.com/user-attachments/assets/36af3b23-87bc-4f4e-a885-f05e58a825c9" />

## Installation

```bash
npm install @temprd/sdk
```

---

## Quickstart

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

| Capability | Status |
|---|---|
| Automatic tool-call healing | Supported |
| Tool schema drift recovery | Supported |
| Payload repair | Supported |
| Structured output recovery | Supported |
| Prompt injection protection | Supported |
| PII redaction | Supported |
| Context compression | Supported |
| Circuit breakers | Supported |
| Token budgeting | Supported |
| Sensitive operation governance | Supported |
| Runtime telemetry | Supported |

---

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

---

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

---

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

## AI-powered healing

Temprd repairs common production failures that break agent workflows:

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
