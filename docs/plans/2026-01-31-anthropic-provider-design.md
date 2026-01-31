# Anthropic provider package refactor design

## Goal
- Move `src/agent/anthropic-client.ts`, `src/agent/anthropic-streamed-message.ts`,
  and `src/agent/anthropic-types.ts` into a dedicated provider package at
  `src/providers/anthropic/`.
- Introduce `src/providers/anthropic/index.ts` as the package entry point.
- Keep `src/agent/index.ts` re-exporting the Anthropic symbols to preserve the
  current external API.
- No behavior changes; only module organization and import paths.

## Scope
In scope:
- File moves to `src/providers/anthropic/`.
- Update all internal imports referencing the moved files.
- Add provider package index export.
- Update `src/agent/index.ts` to re-export from the provider package.

Out of scope:
- Any behavioral changes to client, streaming, or error handling.
- Changes to non-Anthropic providers or unrelated agent flows.

## Architecture
`src/providers/anthropic/` becomes the single module boundary for Anthropic SDK
integration.

Proposed structure:
- `src/providers/anthropic/anthropic-client.ts`
- `src/providers/anthropic/anthropic-streamed-message.ts`
- `src/providers/anthropic/anthropic-types.ts`
- `src/providers/anthropic/index.ts` (exports the above)

`src/agent/index.ts` will re-export all previously exported Anthropic symbols
from `src/providers/anthropic/index.ts`, preserving the public API.

## Data flow
No functional changes:
- `generate -> AnthropicClient.generate -> AnthropicStreamedMessage -> step`
remains unchanged.
- `anthropic-client.ts` continues to map SDK errors to `anthropic-types.ts`
error classes.
- `anthropic-streamed-message.ts` continues to produce the same
`StreamedMessagePart` payloads.

## Error handling
All error classes remain in `anthropic-types.ts` and are re-exported via the
provider index. Call sites keep the same error types and semantics.

## Implementation notes
- Update import paths in:
  - `src/agent/agent-runner.ts`
  - `src/agent/generate.ts`
  - `src/agent/message.ts`
  - `src/agent/step.ts`
  - `src/agent/tool-executor.ts`
  - `src/agent/index.ts`
- Keep `src/agent/context-*` files unchanged unless they import the moved
  modules (currently they do not).

## Testing
- Run `bun run typecheck` to validate path correctness.
- Optional: run `bun run test` if there are relevant unit tests.

## Risks
- Missed import path update may cause typecheck failures.
- Any external consumers importing deep paths under `src/agent/` would break,
  but internal usage remains supported via `src/agent/index.ts`.

