# Temprd Production Readiness Suite

This example simulates how a developer uses Temprd in production through:

```ts
const client = temprd.wrap_client(rawClient, config);
```

It validates healing, retry, circuit breaker behavior, token tracking, token warnings, PII stripping, prompt injection protection, sensitive operation approval, cloud connectivity, and compatibility wrappers for LangChain-style and CrewAI-style tools.

## Run

```bash
npm run production-test
```

The suite starts an in-process recording proxy, forwards heal requests to the configured Temprd Heal cloud endpoint, runs the scenarios, and writes:

```text
examples/production-readiness/production_report.json
```

All checks must pass for the run to exit successfully.
