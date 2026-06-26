<p align="center">
  <picture>
    <source srcset="assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset="assets/logo-light.svg" media="(prefers-color-scheme: light)">
    <img src="assets/logo-light.svg" alt="Temprd" width="420" />
  </picture>
</p>

<p align="center">
  <strong>Runtime reliability infrastructure for AI agents.</strong>
</p>

<p align="center">
  <a href="https://temprd.app/docs">Docs</a> &middot;
  <a href="https://temprd.app/docs/quickstart">Quickstart</a> &middot;
  <a href="https://temprd.app">Dashboard</a> &middot;
  <a href="https://temprd.app/docs/benchmarks">Benchmarks</a> &middot;
  <a href="https://github.com/temprd/temprd-sdk/issues">Issues</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@temprd/sdk"><img src="https://img.shields.io/npm/v/@temprd/sdk?style=flat-square&color=blue" alt="npm" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="license" /></a>
  <img src="https://img.shields.io/badge/types-TypeScript-3178C6?style=flat-square" alt="typescript" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square" alt="node" />
</p>

---

Temprd is an SDK for making AI agents survive production failures.

It wraps AI clients and tools, detects runtime risks, repairs recoverable tool
failures, validates fixes, and retries safely. Healing uses the developer's
configured LLM provider, so provider credentials stay inside the customer
runtime.

| | |
|---|---|
| **Healing** | Repairs recoverable tool-call, payload, schema, response-shape, and structured-output failures. |
| **Runtime protection** | Detects prompt injection, redacts PII, compresses context, tracks tokens, and trips circuit breakers. |
| **Customer-provider inference** | Temprd automatically detects your configured AI provider and uses it to generate candidate repairs, which are validated before being retried. |
| **Minimal integration** | Wrap a provider client once, then wrap tools that should recover automatically. |

---

## Install

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

---

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

Full API reference: https://temprd.app/docs/api-reference

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

Complete methodology and reports: https://temprd.app/docs/benchmarks

---

## Links

- Documentation: https://temprd.app/docs
- Quickstart: https://temprd.app/docs/quickstart
- Dashboard: https://temprd.app
- Benchmarks: https://temprd.app/docs/benchmarks
- Examples: https://temprd.app/docs/examples
- API Reference: https://temprd.app/docs/api-reference
- GitHub Issues: https://github.com/temprd/temprd-sdk/issues

---

## License

MIT. See [LICENSE](./LICENSE).

<p align="center">
  <strong>Build agents that recover instead of stopping.</strong>
</p>
