# CLI E2E Test Design

## Overview

CLI-based end-to-end testing framework for Synapse-Agent.

## Architecture

```
┌─────────────────────────────────────────┐
│  CliTestRunner ──spawn──▶ CLI Process   │
│       │                                 │
│       │ stdin/stdout                    │
│       └─────────────────────────────────┘
│
│  Scenarios:
│  • Basic Chat
│  • File Operations
│  • Shell Commands
│  • Session Persistence
└─────────────────────────────────────────┘
```

## Running Tests

```bash
# All scenarios
bun run test:cli:e2e

# Specific scenario
bun run tests/e2e/cli/index.ts --scenario="File Operations"

# List scenarios
bun run tests/e2e/cli/index.ts --list
```

## Environment

Set `ANTHROPIC_API_KEY` in environment or .env file.
