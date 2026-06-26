<p align="center">
  <picture>
    <source srcset="temprd-sdk/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset="temprd-sdk/assets/logo-light.svg" media="(prefers-color-scheme: light)">
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

## Installation

```bash
npm install @temprd/sdk
```

## Quick Start

```ts
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

- [x] Automatic tool-call healing
- [x] Tool schema drift recovery
- [x] Payload repair
- [x] Structured output recovery
- [x] Runtime protection
- [x] Prompt injection protection
- [x] PII redaction
- [x] Circuit breakers
- [x] Token budgeting
- [x] Sensitive operation governance
- [x] Runtime telemetry

## How Temprd Works

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
```

Provider API keys stay inside the customer runtime. Temprd Cloud validates the
repair before the SDK retries the failed operation.

## Core APIs

### `Temprd.wrap_client(client, config)`

Wraps an AI provider client and enables runtime protection, model capture,
token tracking, circuit breakers, telemetry, and SDK-wide configuration.

### `Temprd.wrapTool(name, tool, options?)`

Wraps a tool function so Temprd can detect failures, request a validated
repair, apply the patch, and retry when recovery is possible.

See the documentation for the full API reference and configuration options.

## Runtime Protection

Runtime protection runs locally in the SDK and does not require additional LLM
calls. Temprd can detect or enforce:

- Prompt injection detection
- PII redaction
- Context compression
- Token tracking
- Circuit breakers
- Sensitive operation governance

## AI-Powered Healing

Temprd can repair common production failures such as:

- Tool schema drift
- Payload mismatches
- Response shape drift
- Structured output issues
- Third-party integration changes

Healing uses the customer's configured LLM provider. Temprd validates the
candidate repair before the SDK retries the failed call.

## Benchmarks

Temprd is evaluated with recovery and runtime protection benchmarks:

- Recovery Benchmarks: 100 synthetic production-inspired failures
- Production Incident Benchmark: real-world API and integration drift cases
- Runtime Protection Benchmarks: prompt injection, PII, circuit breakers,
  token budgeting, context compression, and sensitive operation governance

See the documentation for complete benchmark methodology and reports.

## Documentation

- Documentation: https://temprd.app/docs
- Dashboard: https://temprd.app
- Benchmarks: https://temprd.app/docs/benchmarks
- Examples: https://temprd.app/docs/examples
- API Reference: https://temprd.app/docs/api-reference
- GitHub Issues: https://github.com/temprd/temprd-sdk/issues

## License

MIT. See [LICENSE](./LICENSE).
