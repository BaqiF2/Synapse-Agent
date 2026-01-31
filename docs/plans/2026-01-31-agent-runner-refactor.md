# Agent Runner Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor agent-runner.ts to a three-layer architecture (generate + step + AgentRunner) with independent Message types, referencing kosong project patterns.

**Architecture:** Extract `generate()` for single LLM calls with stream merging, `step()` for one generation + tool execution cycle, and simplify `AgentRunner` to loop over `step()`. Replace `ContextManager` with `Message[]` array and delete `LlmClient` (replaced by `AnthropicClient`).

**Tech Stack:** TypeScript, Bun, Anthropic SDK

---

## Task 1: Create Message Types

**Files:**
- Create: `src/agent/message.ts`
- Test: `tests/unit/agent/message.test.ts`

**Step 1: Write the failing test for Message types**

```typescript
// tests/unit/agent/message.test.ts
/**
 * Message Types Tests
 *
 * Tests for Message type definitions and helper functions.
 */

import { describe, expect, it } from 'bun:test';
import {
  type Message,
  type TextPart,
  type ToolCall,
  createTextMessage,
  extractText,
} from '../../../src/agent/message.ts';

describe('Message', () => {
  describe('createTextMessage', () => {
    it('should create a user text message', () => {
      const message = createTextMessage('user', 'Hello');

      expect(message.role).toBe('user');
      expect(message.content).toHaveLength(1);
      expect(message.content[0]).toEqual({ type: 'text', text: 'Hello' });
    });

    it('should create an assistant text message', () => {
      const message = createTextMessage('assistant', 'Hi there');

      expect(message.role).toBe('assistant');
      expect(message.content).toHaveLength(1);
      expect((message.content[0] as TextPart).text).toBe('Hi there');
    });
  });

  describe('extractText', () => {
    it('should extract text from a single text part', () => {
      const message: Message = {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
      };

      expect(extractText(message)).toBe('Hello world');
    });

    it('should concatenate multiple text parts', () => {
      const message: Message = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      };

      expect(extractText(message)).toBe('Hello world');
    });

    it('should skip non-text parts', () => {
      const message: Message = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'think', think: 'thinking...' },
          { type: 'text', text: ' world' },
        ],
      };

      expect(extractText(message)).toBe('Hello world');
    });

    it('should return empty string for no text parts', () => {
      const message: Message = {
        role: 'assistant',
        content: [],
      };

      expect(extractText(message)).toBe('');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/message.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/agent/message.ts
/**
 * Message Types
 *
 * Independent message type definitions for the agent system,
 * decoupled from Anthropic SDK types.
 *
 * Core Exports:
 * - Role: Message sender role type
 * - ContentPart: Union type for message content parts
 * - TextPart: Text content part
 * - ThinkPart: Thinking content part
 * - ToolCall: Tool call request
 * - Message: Complete message structure
 * - createTextMessage: Helper to create text messages
 * - extractText: Helper to extract text from message
 */

/**
 * Message sender role
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Text content part
 */
export interface TextPart {
  type: 'text';
  text: string;
}

/**
 * Thinking content part
 */
export interface ThinkPart {
  type: 'think';
  think: string;
  encrypted?: string;
}

/**
 * Image URL content part
 */
export interface ImageUrlPart {
  type: 'image_url';
  imageUrl: { url: string; id?: string };
}

/**
 * Union type for all content parts
 */
export type ContentPart = TextPart | ThinkPart | ImageUrlPart;

/**
 * Tool call request from assistant
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Complete message structure
 */
export interface Message {
  role: Role;
  content: ContentPart[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/**
 * Create a simple text message
 */
export function createTextMessage(role: Role, text: string): Message {
  return {
    role,
    content: [{ type: 'text', text }],
  };
}

/**
 * Extract all text from a message
 */
export function extractText(message: Message, separator: string = ''): string {
  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join(separator);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/message.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/message.ts tests/unit/agent/message.test.ts
git commit -m "feat(agent): add Message types and helper functions"
```

---

## Task 2: Add Message Conversion Functions

**Files:**
- Modify: `src/agent/message.ts`
- Test: `tests/unit/agent/message.test.ts`

**Step 1: Write the failing test for toAnthropicMessage**

Add to `tests/unit/agent/message.test.ts`:

```typescript
import {
  // ... existing imports
  toAnthropicMessage,
  toolResultToMessage,
} from '../../../src/agent/message.ts';
import type Anthropic from '@anthropic-ai/sdk';

describe('toAnthropicMessage', () => {
  it('should convert user text message', () => {
    const message: Message = createTextMessage('user', 'Hello');
    const result = toAnthropicMessage(message);

    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello');
  });

  it('should convert assistant message with tool calls', () => {
    const message: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Let me help' }],
      toolCalls: [{ id: 'call1', name: 'Bash', arguments: '{"command":"ls"}' }],
    };
    const result = toAnthropicMessage(message);

    expect(result.role).toBe('assistant');
    expect(Array.isArray(result.content)).toBe(true);
    const content = result.content as Anthropic.ContentBlockParam[];
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'text', text: 'Let me help' });
    expect(content[1]).toMatchObject({
      type: 'tool_use',
      id: 'call1',
      name: 'Bash',
    });
  });

  it('should convert tool result message', () => {
    const message: Message = {
      role: 'tool',
      content: [{ type: 'text', text: 'file1.txt\nfile2.txt' }],
      toolCallId: 'call1',
    };
    const result = toAnthropicMessage(message);

    expect(result.role).toBe('user');
    expect(Array.isArray(result.content)).toBe(true);
    const content = result.content as Anthropic.ToolResultBlockParam[];
    expect(content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'call1',
      content: 'file1.txt\nfile2.txt',
    });
  });
});

describe('toolResultToMessage', () => {
  it('should convert tool result to message', () => {
    const result = { toolCallId: 'call1', output: 'success', isError: false };
    const message = toolResultToMessage(result);

    expect(message.role).toBe('tool');
    expect(message.toolCallId).toBe('call1');
    expect(message.content).toHaveLength(1);
    expect((message.content[0] as TextPart).text).toBe('success');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/message.test.ts`
Expected: FAIL with "toAnthropicMessage is not exported"

**Step 3: Write implementation**

Add to `src/agent/message.ts`:

```typescript
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool execution result
 */
export interface ToolResult {
  toolCallId: string;
  output: string;
  isError: boolean;
}

/**
 * Convert Message to Anthropic.MessageParam
 */
export function toAnthropicMessage(message: Message): Anthropic.MessageParam {
  // Tool result message → user message with tool_result block
  if (message.role === 'tool' && message.toolCallId) {
    const text = extractText(message);
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: text,
        },
      ],
    };
  }

  // Assistant message with tool calls
  if (message.role === 'assistant' && message.toolCalls?.length) {
    const content: Anthropic.ContentBlockParam[] = [];

    // Add text parts
    const text = extractText(message);
    if (text) {
      content.push({ type: 'text', text });
    }

    // Add tool use blocks
    for (const call of message.toolCalls) {
      content.push({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: JSON.parse(call.arguments),
      });
    }

    return { role: 'assistant', content };
  }

  // Simple text message
  const text = extractText(message);
  if (message.role === 'user' || message.role === 'assistant') {
    return { role: message.role, content: text };
  }

  // System message (convert to user for Anthropic)
  return { role: 'user', content: `<system>${text}</system>` };
}

/**
 * Convert ToolResult to Message
 */
export function toolResultToMessage(result: ToolResult): Message {
  return {
    role: 'tool',
    content: [{ type: 'text', text: result.output }],
    toolCallId: result.toolCallId,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/message.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/message.ts tests/unit/agent/message.test.ts
git commit -m "feat(agent): add Message conversion functions"
```

---

## Task 3: Add Stream Merging Functions

**Files:**
- Modify: `src/agent/message.ts`
- Test: `tests/unit/agent/message.test.ts`

**Step 1: Write the failing test for mergePart and appendToMessage**

Add to `tests/unit/agent/message.test.ts`:

```typescript
import {
  // ... existing imports
  type MergeablePart,
  mergePart,
  appendToMessage,
} from '../../../src/agent/message.ts';

describe('mergePart', () => {
  it('should merge two text parts', () => {
    const target: MergeablePart = { type: 'text', text: 'Hello' };
    const source: MergeablePart = { type: 'text', text: ' world' };

    const merged = mergePart(target, source);

    expect(merged).toBe(true);
    expect((target as TextPart).text).toBe('Hello world');
  });

  it('should not merge different types', () => {
    const target: MergeablePart = { type: 'text', text: 'Hello' };
    const source: MergeablePart = { type: 'think', think: 'thinking' };

    const merged = mergePart(target, source);

    expect(merged).toBe(false);
    expect((target as TextPart).text).toBe('Hello');
  });

  it('should merge tool_call_delta into tool_call', () => {
    const target: MergeablePart = {
      type: 'tool_call',
      id: 'call1',
      name: 'Bash',
      input: {},
      _argumentsJson: '{"com',
    };
    const source: MergeablePart = { type: 'tool_call_delta', argumentsDelta: 'mand":"ls"}' };

    const merged = mergePart(target, source);

    expect(merged).toBe(true);
    expect((target as any)._argumentsJson).toBe('{"command":"ls"}');
  });
});

describe('appendToMessage', () => {
  it('should append text part to message content', () => {
    const message: Message = { role: 'assistant', content: [] };
    const part: MergeablePart = { type: 'text', text: 'Hello' };

    appendToMessage(message, part);

    expect(message.content).toHaveLength(1);
    expect(message.content[0]).toEqual({ type: 'text', text: 'Hello' });
  });

  it('should append tool call to message', () => {
    const message: Message = { role: 'assistant', content: [] };
    const part: MergeablePart = {
      type: 'tool_call',
      id: 'call1',
      name: 'Bash',
      input: { command: 'ls' },
      _argumentsJson: '{"command":"ls"}',
    };

    appendToMessage(message, part);

    expect(message.toolCalls).toHaveLength(1);
    expect(message.toolCalls![0]).toEqual({
      id: 'call1',
      name: 'Bash',
      arguments: '{"command":"ls"}',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/message.test.ts`
Expected: FAIL with "mergePart is not exported"

**Step 3: Write implementation**

Add to `src/agent/message.ts`:

```typescript
import type { StreamedMessagePart, ToolCallPart, ToolCallDeltaPart } from './anthropic-types.ts';

/**
 * Extended tool call part for merging (includes accumulated JSON)
 */
export interface MergeableToolCallPart extends ToolCallPart {
  _argumentsJson: string;
}

/**
 * Union type for parts that can be merged
 */
export type MergeablePart =
  | TextPart
  | ThinkPart
  | MergeableToolCallPart
  | ToolCallDeltaPart;

/**
 * Check if a part is a tool call
 */
export function isToolCallPart(part: MergeablePart): part is MergeableToolCallPart {
  return part.type === 'tool_call';
}

/**
 * Merge source part into target part in place.
 * Returns true if merge was successful, false otherwise.
 */
export function mergePart(target: MergeablePart, source: MergeablePart): boolean {
  // Text + Text
  if (target.type === 'text' && source.type === 'text') {
    target.text += source.text;
    return true;
  }

  // Think + Think
  if (target.type === 'think' && source.type === 'think') {
    if (target.encrypted) return false;
    target.think += source.think;
    if (source.encrypted) target.encrypted = source.encrypted;
    return true;
  }

  // ToolCall + ToolCallDelta
  if (target.type === 'tool_call' && source.type === 'tool_call_delta') {
    (target as MergeableToolCallPart)._argumentsJson += source.argumentsDelta;
    return true;
  }

  return false;
}

/**
 * Convert StreamedMessagePart to MergeablePart
 */
export function toMergeablePart(part: StreamedMessagePart): MergeablePart {
  if (part.type === 'tool_call') {
    return {
      ...part,
      _argumentsJson: JSON.stringify(part.input),
    } as MergeableToolCallPart;
  }
  return part as MergeablePart;
}

/**
 * Append a completed part to a message
 */
export function appendToMessage(message: Message, part: MergeablePart): void {
  if (part.type === 'text') {
    message.content.push({ type: 'text', text: part.text });
    return;
  }

  if (part.type === 'think') {
    message.content.push({ type: 'think', think: part.think, encrypted: part.encrypted });
    return;
  }

  if (part.type === 'tool_call') {
    if (!message.toolCalls) message.toolCalls = [];
    const toolCallPart = part as MergeableToolCallPart;
    message.toolCalls.push({
      id: toolCallPart.id,
      name: toolCallPart.name,
      arguments: toolCallPart._argumentsJson,
    });
    return;
  }

  // Ignore orphaned tool_call_delta
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/message.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/message.ts tests/unit/agent/message.test.ts
git commit -m "feat(agent): add stream merging functions"
```

---

## Task 4: Create generate() Function

**Files:**
- Create: `src/agent/generate.ts`
- Test: `tests/unit/agent/generate.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/agent/generate.test.ts
/**
 * Generate Function Tests
 *
 * Tests for the generate() function that handles single LLM calls.
 */

import { describe, expect, it, mock } from 'bun:test';
import { generate, type GenerateResult } from '../../../src/agent/generate.ts';
import { createTextMessage, type Message } from '../../../src/agent/message.ts';
import type { AnthropicClient } from '../../../src/agent/anthropic-client.ts';
import type { StreamedMessagePart, TokenUsage } from '../../../src/agent/anthropic-types.ts';

function createMockClient(parts: StreamedMessagePart[]): AnthropicClient {
  return {
    generate: mock(() =>
      Promise.resolve({
        id: 'msg_test',
        usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      })
    ),
  } as unknown as AnthropicClient;
}

describe('generate', () => {
  it('should generate a simple text response', async () => {
    const client = createMockClient([{ type: 'text', text: 'Hello world' }]);
    const history: Message[] = [createTextMessage('user', 'Hi')];

    const result = await generate(client, 'System prompt', [], history);

    expect(result.id).toBe('msg_test');
    expect(result.message.role).toBe('assistant');
    expect(result.message.content).toHaveLength(1);
    expect(result.message.content[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('should merge streaming text parts', async () => {
    const client = createMockClient([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ]);
    const history: Message[] = [createTextMessage('user', 'Hi')];

    const result = await generate(client, 'System prompt', [], history);

    expect(result.message.content).toHaveLength(1);
    expect(result.message.content[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('should handle tool calls', async () => {
    const client = createMockClient([
      { type: 'text', text: 'Let me check' },
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);
    const history: Message[] = [createTextMessage('user', 'List files')];

    const result = await generate(client, 'System prompt', [], history);

    expect(result.message.content).toHaveLength(1);
    expect(result.message.toolCalls).toHaveLength(1);
    expect(result.message.toolCalls![0].name).toBe('Bash');
  });

  it('should call onMessagePart callback', async () => {
    const parts: StreamedMessagePart[] = [];
    const client = createMockClient([{ type: 'text', text: 'Hello' }]);
    const history: Message[] = [createTextMessage('user', 'Hi')];

    await generate(client, 'System prompt', [], history, {
      onMessagePart: (part) => parts.push(part),
    });

    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: 'text', text: 'Hello' });
  });

  it('should call onToolCall callback for complete tool calls', async () => {
    const toolCalls: any[] = [];
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);
    const history: Message[] = [createTextMessage('user', 'List files')];

    await generate(client, 'System prompt', [], history, {
      onToolCall: (tc) => toolCalls.push(tc),
    });

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe('call1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/generate.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write implementation**

```typescript
// src/agent/generate.ts
/**
 * Generate Function
 *
 * Single LLM call with streaming support and message merging.
 * Reference: kosong/_generate.py
 *
 * Core Exports:
 * - generate: Async function for single LLM generation
 * - GenerateResult: Result type containing message and usage
 * - OnMessagePart: Callback type for raw message parts
 * - OnToolCall: Callback type for complete tool calls
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { AnthropicClient } from './anthropic-client.ts';
import type { StreamedMessagePart, TokenUsage } from './anthropic-types.ts';
import { APIEmptyResponseError } from './anthropic-types.ts';
import {
  type Message,
  type ToolCall,
  type MergeablePart,
  toAnthropicMessage,
  toMergeablePart,
  mergePart,
  appendToMessage,
  isToolCallPart,
} from './message.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('generate');

/**
 * Callback for raw streamed message parts
 */
export type OnMessagePart = (part: StreamedMessagePart) => void | Promise<void>;

/**
 * Callback for complete tool calls
 */
export type OnToolCall = (toolCall: ToolCall) => void | Promise<void>;

/**
 * Generate options
 */
export interface GenerateOptions {
  onMessagePart?: OnMessagePart;
  onToolCall?: OnToolCall;
}

/**
 * Generate result
 */
export interface GenerateResult {
  id: string | null;
  message: Message;
  usage: TokenUsage | null;
}

/**
 * Generate one message based on the given context.
 * Parts of the message will be streamed to callbacks if provided.
 *
 * @param client - The Anthropic client to use
 * @param systemPrompt - System prompt for generation
 * @param tools - Available tools for the model
 * @param history - Message history
 * @param options - Optional callbacks
 * @returns Generated message with usage info
 */
export async function generate(
  client: AnthropicClient,
  systemPrompt: string,
  tools: Anthropic.Tool[],
  history: readonly Message[],
  options?: GenerateOptions
): Promise<GenerateResult> {
  const { onMessagePart, onToolCall } = options ?? {};

  // Convert history to Anthropic format
  const anthropicMessages = history.map(toAnthropicMessage);
  logger.trace('Generating with history', { messageCount: history.length });

  // Call LLM
  const stream = await client.generate(systemPrompt, anthropicMessages, tools);

  // Initialize message
  const message: Message = { role: 'assistant', content: [] };
  let pendingPart: MergeablePart | null = null;

  // Process stream
  for await (const part of stream) {
    logger.trace('Received part', { type: part.type });

    // Raw callback
    if (onMessagePart) {
      await onMessagePart(part);
    }

    const mergeablePart = toMergeablePart(part);

    // First part
    if (pendingPart === null) {
      pendingPart = mergeablePart;
      continue;
    }

    // Try to merge
    if (!mergePart(pendingPart, mergeablePart)) {
      // Cannot merge, flush pending part
      appendToMessage(message, pendingPart);

      // Trigger onToolCall for complete tool calls
      if (isToolCallPart(pendingPart) && onToolCall) {
        await onToolCall({
          id: pendingPart.id,
          name: pendingPart.name,
          arguments: pendingPart._argumentsJson,
        });
      }

      pendingPart = mergeablePart;
    }
  }

  // Flush last pending part
  if (pendingPart !== null) {
    appendToMessage(message, pendingPart);

    if (isToolCallPart(pendingPart) && onToolCall) {
      await onToolCall({
        id: pendingPart.id,
        name: pendingPart.name,
        arguments: pendingPart._argumentsJson,
      });
    }
  }

  // Check for empty response
  if (!message.content.length && !message.toolCalls?.length) {
    throw new APIEmptyResponseError('API returned an empty response');
  }

  return {
    id: stream.id,
    message,
    usage: stream.usage,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/generate.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/generate.ts tests/unit/agent/generate.test.ts
git commit -m "feat(agent): add generate() function with stream merging"
```

---

## Task 5: Create Toolset Interface

**Files:**
- Create: `src/agent/toolset.ts`
- Test: `tests/unit/agent/toolset.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/agent/toolset.test.ts
/**
 * Toolset Tests
 *
 * Tests for the Toolset interface and SimpleToolset implementation.
 */

import { describe, expect, it, mock } from 'bun:test';
import { SimpleToolset, type Toolset, type ToolResult } from '../../../src/agent/toolset.ts';
import type { ToolCall } from '../../../src/agent/message.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';

describe('SimpleToolset', () => {
  it('should expose tools array', () => {
    const handler = mock(() => Promise.resolve({ toolCallId: '', output: '', isError: false }));
    const toolset = new SimpleToolset([BashToolSchema], handler);

    expect(toolset.tools).toEqual([BashToolSchema]);
  });

  it('should handle tool call', async () => {
    const handler = mock(() =>
      Promise.resolve({ toolCallId: 'call1', output: 'success', isError: false })
    );
    const toolset = new SimpleToolset([BashToolSchema], handler);

    const toolCall: ToolCall = { id: 'call1', name: 'Bash', arguments: '{"command":"ls"}' };
    const result = await toolset.handle(toolCall);

    expect(result.toolCallId).toBe('call1');
    expect(result.output).toBe('success');
    expect(handler).toHaveBeenCalledWith(toolCall);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/toolset.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write implementation**

```typescript
// src/agent/toolset.ts
/**
 * Toolset Interface
 *
 * Defines the interface for tool execution in the agent system.
 *
 * Core Exports:
 * - Toolset: Interface for tool collections
 * - ToolResult: Tool execution result type
 * - SimpleToolset: Basic toolset implementation
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { ToolCall, ToolResult } from './message.ts';

export type { ToolResult };

/**
 * Tool handler function type
 */
export type ToolHandler = (toolCall: ToolCall) => Promise<ToolResult>;

/**
 * Toolset interface for managing and executing tools
 */
export interface Toolset {
  /** Tool definitions for LLM */
  readonly tools: Anthropic.Tool[];

  /** Handle a tool call, returns result promise */
  handle(toolCall: ToolCall): Promise<ToolResult>;
}

/**
 * Simple toolset implementation with a single handler
 */
export class SimpleToolset implements Toolset {
  readonly tools: Anthropic.Tool[];
  private handler: ToolHandler;

  constructor(tools: Anthropic.Tool[], handler: ToolHandler) {
    this.tools = tools;
    this.handler = handler;
  }

  async handle(toolCall: ToolCall): Promise<ToolResult> {
    return this.handler(toolCall);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/toolset.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/toolset.ts tests/unit/agent/toolset.test.ts
git commit -m "feat(agent): add Toolset interface and SimpleToolset"
```

---

## Task 6: Create step() Function

**Files:**
- Create: `src/agent/step.ts`
- Test: `tests/unit/agent/step.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/agent/step.test.ts
/**
 * Step Function Tests
 *
 * Tests for the step() function that handles one generation + tool execution cycle.
 */

import { describe, expect, it, mock } from 'bun:test';
import { step, type StepResult } from '../../../src/agent/step.ts';
import { createTextMessage, type Message, type ToolCall } from '../../../src/agent/message.ts';
import { SimpleToolset } from '../../../src/agent/toolset.ts';
import type { AnthropicClient } from '../../../src/agent/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/agent/anthropic-types.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';

function createMockClient(parts: StreamedMessagePart[]): AnthropicClient {
  return {
    generate: mock(() =>
      Promise.resolve({
        id: 'msg_test',
        usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      })
    ),
  } as unknown as AnthropicClient;
}

describe('step', () => {
  it('should return message without tool calls', async () => {
    const client = createMockClient([{ type: 'text', text: 'Hello' }]);
    const toolset = new SimpleToolset([BashToolSchema], () =>
      Promise.resolve({ toolCallId: '', output: '', isError: false })
    );
    const history: Message[] = [createTextMessage('user', 'Hi')];

    const result = await step(client, 'System', toolset, history);

    expect(result.message.role).toBe('assistant');
    expect(result.toolCalls).toHaveLength(0);

    const toolResults = await result.toolResults();
    expect(toolResults).toHaveLength(0);
  });

  it('should execute tools and return results', async () => {
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);
    const toolHandler = mock(() =>
      Promise.resolve({ toolCallId: 'call1', output: 'file1.txt', isError: false })
    );
    const toolset = new SimpleToolset([BashToolSchema], toolHandler);
    const history: Message[] = [createTextMessage('user', 'List files')];

    const result = await step(client, 'System', toolset, history);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].id).toBe('call1');

    const toolResults = await result.toolResults();
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].output).toBe('file1.txt');
    expect(toolHandler).toHaveBeenCalled();
  });

  it('should start tool execution during streaming', async () => {
    let toolStartedDuringStream = false;
    const client = createMockClient([
      { type: 'text', text: 'Running' },
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);

    const toolHandler = mock(() => {
      toolStartedDuringStream = true;
      return Promise.resolve({ toolCallId: 'call1', output: 'done', isError: false });
    });
    const toolset = new SimpleToolset([BashToolSchema], toolHandler);
    const history: Message[] = [createTextMessage('user', 'Run')];

    const result = await step(client, 'System', toolset, history);

    // Tool should have started by the time step() returns
    expect(result.toolCalls).toHaveLength(1);
    await result.toolResults();
    expect(toolStartedDuringStream).toBe(true);
  });

  it('should call onToolResult callback', async () => {
    const results: any[] = [];
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);
    const toolset = new SimpleToolset([BashToolSchema], () =>
      Promise.resolve({ toolCallId: 'call1', output: 'done', isError: false })
    );
    const history: Message[] = [createTextMessage('user', 'Run')];

    const result = await step(client, 'System', toolset, history, {
      onToolResult: (r) => results.push(r),
    });

    await result.toolResults();
    expect(results).toHaveLength(1);
    expect(results[0].output).toBe('done');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/step.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write implementation**

```typescript
// src/agent/step.ts
/**
 * Step Function
 *
 * One agent "step": generate response + execute tools.
 * Reference: kosong/__init__.py step()
 *
 * Core Exports:
 * - step: Async function for one agent step
 * - StepResult: Result type with message and tool results
 * - StepOptions: Options for step execution
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { AnthropicClient } from './anthropic-client.ts';
import type { StreamedMessagePart, TokenUsage } from './anthropic-types.ts';
import { generate, type OnMessagePart } from './generate.ts';
import type { Message, ToolCall, ToolResult } from './message.ts';
import type { Toolset } from './toolset.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('step');

/**
 * Callback for tool execution results
 */
export type OnToolResult = (result: ToolResult) => void;

/**
 * Step options
 */
export interface StepOptions {
  onMessagePart?: OnMessagePart;
  onToolResult?: OnToolResult;
}

/**
 * Step result
 */
export interface StepResult {
  id: string | null;
  message: Message;
  usage: TokenUsage | null;
  toolCalls: ToolCall[];

  /** Get all tool execution results (waits for completion) */
  toolResults(): Promise<ToolResult[]>;
}

/**
 * Run one agent step: generate + execute tools.
 *
 * @param client - Anthropic client
 * @param systemPrompt - System prompt
 * @param toolset - Toolset for tool execution
 * @param history - Message history (not modified)
 * @param options - Optional callbacks
 * @returns Step result with message and tool results accessor
 */
export async function step(
  client: AnthropicClient,
  systemPrompt: string,
  toolset: Toolset,
  history: readonly Message[],
  options?: StepOptions
): Promise<StepResult> {
  const { onMessagePart, onToolResult } = options ?? {};

  const toolCalls: ToolCall[] = [];
  const toolResultPromises: Map<string, Promise<ToolResult>> = new Map();

  // Tool call callback - start execution immediately
  const handleToolCall = async (toolCall: ToolCall) => {
    logger.trace('Tool call received', { id: toolCall.id, name: toolCall.name });
    toolCalls.push(toolCall);

    const promise = toolset.handle(toolCall);
    toolResultPromises.set(toolCall.id, promise);

    // Optional callback when result is ready
    if (onToolResult) {
      promise.then(onToolResult).catch(() => {
        // Ignore - error will be captured in toolResults()
      });
    }
  };

  // Generate response
  const result = await generate(client, systemPrompt, toolset.tools, history, {
    onMessagePart,
    onToolCall: handleToolCall,
  });

  return {
    id: result.id,
    message: result.message,
    usage: result.usage,
    toolCalls,

    async toolResults(): Promise<ToolResult[]> {
      const results: ToolResult[] = [];
      for (const toolCall of toolCalls) {
        const promise = toolResultPromises.get(toolCall.id);
        if (promise) {
          try {
            results.push(await promise);
          } catch (error) {
            // Convert error to ToolResult
            const message = error instanceof Error ? error.message : 'Unknown error';
            results.push({
              toolCallId: toolCall.id,
              output: `Tool execution failed: ${message}`,
              isError: true,
            });
          }
        }
      }
      return results;
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/step.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/step.ts tests/unit/agent/step.test.ts
git commit -m "feat(agent): add step() function for generation + tool execution"
```

---

## Task 7: Refactor AgentRunner

**Files:**
- Modify: `src/agent/agent-runner.ts`
- Modify: `tests/unit/agent/agent-runner.test.ts`

**Step 1: Update test file for new interface**

Replace `tests/unit/agent/agent-runner.test.ts`:

```typescript
/**
 * Agent Runner Tests
 *
 * Tests for the refactored Agent Loop implementation using step().
 */

import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  AgentRunner,
  type AgentRunnerOptions,
} from '../../../src/agent/agent-runner.ts';
import { SimpleToolset } from '../../../src/agent/toolset.ts';
import { createTextMessage, type Message, type ToolResult } from '../../../src/agent/message.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';
import type { AnthropicClient } from '../../../src/agent/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/agent/anthropic-types.ts';

function createMockClient(responses: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
    generate: mock(() => {
      const parts = responses[callIndex++] || [{ type: 'text', text: 'Default' }];
      return Promise.resolve({
        id: `msg_${callIndex}`,
        usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      });
    }),
  } as unknown as AnthropicClient;
}

describe('AgentRunner', () => {
  describe('run', () => {
    it('should process user message and return response (no tools)', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
      const toolset = new SimpleToolset([BashToolSchema], () =>
        Promise.resolve({ toolCallId: '', output: '', isError: false })
      );

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      const response = await runner.run('Hi');

      expect(response).toBe('Hello!');
    });

    it('should execute tools and continue loop', async () => {
      const client = createMockClient([
        [
          { type: 'text', text: 'Running' },
          { type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'ls' } },
        ],
        [{ type: 'text', text: 'Done!' }],
      ]);

      const toolHandler = mock(() =>
        Promise.resolve({ toolCallId: 'c1', output: 'file.txt', isError: false })
      );
      const toolset = new SimpleToolset([BashToolSchema], toolHandler);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      const response = await runner.run('List files');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalled();
    });

    it('should call onMessagePart callback', async () => {
      const parts: StreamedMessagePart[] = [];
      const client = createMockClient([[{ type: 'text', text: 'Hi' }]]);
      const toolset = new SimpleToolset([BashToolSchema], () =>
        Promise.resolve({ toolCallId: '', output: '', isError: false })
      );

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        onMessagePart: (p) => parts.push(p),
      });

      await runner.run('Hello');

      expect(parts.length).toBeGreaterThan(0);
    });

    it('should stop after consecutive tool failures', async () => {
      const client = createMockClient([
        [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'fail' } }],
        [{ type: 'tool_call', id: 'c2', name: 'Bash', input: { command: 'fail' } }],
        [{ type: 'tool_call', id: 'c3', name: 'Bash', input: { command: 'fail' } }],
      ]);

      const toolset = new SimpleToolset([BashToolSchema], (tc) =>
        Promise.resolve({ toolCallId: tc.id, output: 'error', isError: true })
      );

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        maxConsecutiveToolFailures: 3,
      });

      const response = await runner.run('Fail');

      expect(response).toContain('失败');
    });

    it('should maintain history across calls', async () => {
      const client = createMockClient([
        [{ type: 'text', text: 'First' }],
        [{ type: 'text', text: 'Second' }],
      ]);
      const toolset = new SimpleToolset([BashToolSchema], () =>
        Promise.resolve({ toolCallId: '', output: '', isError: false })
      );

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      await runner.run('One');
      const response = await runner.run('Two');

      expect(response).toBe('Second');
      expect(runner.getHistory()).toHaveLength(4); // 2 user + 2 assistant
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/agent-runner.test.ts`
Expected: FAIL with interface mismatch errors

**Step 3: Rewrite agent-runner.ts**

```typescript
// src/agent/agent-runner.ts
/**
 * Agent Runner
 *
 * Reusable Agent Loop implementation that calls step() repeatedly.
 *
 * @module agent-runner
 *
 * Core Exports:
 * - AgentRunner: Main Agent Loop class
 * - AgentRunnerOptions: Configuration options
 */

import type { AnthropicClient } from './anthropic-client.ts';
import type { StreamedMessagePart, TokenUsage } from './anthropic-types.ts';
import { step, type OnToolResult } from './step.ts';
import type { OnMessagePart } from './generate.ts';
import {
  type Message,
  type ToolResult,
  createTextMessage,
  extractText,
  toolResultToMessage,
} from './message.ts';
import type { Toolset } from './toolset.ts';
import { createLogger } from '../utils/logger.ts';
import { AUTO_ENHANCE_PROMPT } from './system-prompt.ts';

const logger = createLogger('agent-runner');

const DEFAULT_MAX_ITERATIONS = parseInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS || '50', 10);
const parsedMaxFailures = parseInt(process.env.SYNAPSE_MAX_CONSECUTIVE_TOOL_FAILURES || '3', 10);
const DEFAULT_MAX_CONSECUTIVE_TOOL_FAILURES =
  Number.isFinite(parsedMaxFailures) ? Math.max(1, parsedMaxFailures) : 3;

/**
 * Options for AgentRunner
 */
export interface AgentRunnerOptions {
  /** Anthropic client */
  client: AnthropicClient;
  /** System prompt */
  systemPrompt: string;
  /** Toolset for tool execution */
  toolset: Toolset;
  /** Maximum iterations for Agent Loop */
  maxIterations?: number;
  /** Maximum consecutive tool failures before stopping */
  maxConsecutiveToolFailures?: number;

  /** Callback for streamed message parts */
  onMessagePart?: OnMessagePart;
  /** Callback for tool results */
  onToolResult?: OnToolResult;

  /** Check if auto-enhance is enabled */
  isAutoEnhanceEnabled?: () => boolean;
  /** Custom auto-enhance prompt */
  autoEnhancePrompt?: string;
}

/**
 * AgentRunner - Reusable Agent Loop implementation
 */
export class AgentRunner {
  private client: AnthropicClient;
  private systemPrompt: string;
  private toolset: Toolset;
  private maxIterations: number;
  private maxConsecutiveToolFailures: number;
  private onMessagePart?: OnMessagePart;
  private onToolResult?: OnToolResult;
  private isAutoEnhanceEnabled?: () => boolean;
  private autoEnhancePrompt?: string;

  private history: Message[] = [];
  private autoEnhanceTriggered: boolean = false;
  private consecutiveToolFailures: number = 0;

  constructor(options: AgentRunnerOptions) {
    this.client = options.client;
    this.systemPrompt = options.systemPrompt;
    this.toolset = options.toolset;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxConsecutiveToolFailures =
      options.maxConsecutiveToolFailures ?? DEFAULT_MAX_CONSECUTIVE_TOOL_FAILURES;
    this.onMessagePart = options.onMessagePart;
    this.onToolResult = options.onToolResult;
    this.isAutoEnhanceEnabled = options.isAutoEnhanceEnabled;
    this.autoEnhancePrompt = options.autoEnhancePrompt;
  }

  /**
   * Get the message history
   */
  getHistory(): readonly Message[] {
    return this.history;
  }

  /**
   * Clear the message history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Run the Agent Loop for a user message
   */
  async run(userMessage: string): Promise<string> {
    // Reset per-run state
    this.autoEnhanceTriggered = false;
    this.consecutiveToolFailures = 0;

    // Add user message to history
    this.history.push(createTextMessage('user', userMessage));

    let iteration = 0;
    let finalResponse = '';

    while (iteration < this.maxIterations) {
      iteration++;
      logger.info(`Step ${iteration}/${this.maxIterations}`);

      // Run one step
      const result = await step(this.client, this.systemPrompt, this.toolset, this.history, {
        onMessagePart: this.onMessagePart,
        onToolResult: this.onToolResult,
      });

      // Get tool results
      const toolResults = await result.toolResults();

      // Add assistant message to history
      this.history.push(result.message);

      // Add tool result messages to history
      for (const tr of toolResults) {
        this.history.push(toolResultToMessage(tr));
      }

      // Extract text response
      const text = extractText(result.message);
      if (text) finalResponse = text;

      // No tool calls → check auto-enhance or end
      if (!result.toolCalls.length) {
        if (this.triggerAutoEnhance()) {
          continue;
        }
        logger.info('Agent loop completed, no more tool calls');
        break;
      }

      // Check consecutive failures
      const hasFail = toolResults.some((r) => r.isError);
      if (hasFail) {
        this.consecutiveToolFailures++;
        logger.warn(
          `Tool failure (consecutive: ${this.consecutiveToolFailures}/${this.maxConsecutiveToolFailures})`
        );

        if (this.consecutiveToolFailures >= this.maxConsecutiveToolFailures) {
          const stopMessage = '工具执行连续失败，已停止。';
          this.history.push(createTextMessage('assistant', stopMessage));
          finalResponse = stopMessage;
          break;
        }
      } else {
        this.consecutiveToolFailures = 0;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.error(`Agent loop reached max iterations: ${this.maxIterations}`);
    }

    return finalResponse;
  }

  /**
   * Trigger auto-enhance if enabled and not already triggered
   */
  private triggerAutoEnhance(): boolean {
    if (this.autoEnhanceTriggered) return false;
    if (!this.isAutoEnhanceEnabled?.()) return false;

    this.autoEnhanceTriggered = true;
    const prompt = this.autoEnhancePrompt ?? AUTO_ENHANCE_PROMPT;
    this.history.push(createTextMessage('user', prompt));
    logger.info('Auto-enhance triggered');

    return true;
  }
}

export default AgentRunner;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/agent-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/agent-runner.ts tests/unit/agent/agent-runner.test.ts
git commit -m "refactor(agent): rewrite AgentRunner to use step()"
```

---

## Task 8: Update Dependent Code - repl.ts

**Files:**
- Modify: `src/cli/repl.ts`

**Step 1: Identify changes needed**

The repl.ts uses:
- `ContextManager` → remove, AgentRunner manages history internally
- `AgentRunner` with old interface → update to new interface
- Callbacks: `onText` → `onMessagePart`, handle text extraction

**Step 2: Update repl.ts imports and initialization**

Key changes:
1. Remove ContextManager import and usage
2. Create Toolset adapter from ToolExecutor
3. Update AgentRunner initialization
4. Update callback handling

```typescript
// Changes to src/cli/repl.ts

// Remove these imports:
// import { ContextManager, type ConversationMessage } from '../agent/context-manager.ts';

// Add these imports:
import { SimpleToolset } from '../agent/toolset.ts';
import type { StreamedMessagePart } from '../agent/anthropic-types.ts';
import type { ToolResult, ToolCall } from '../agent/message.ts';

// In startRepl(), replace ContextManager and AgentRunner initialization:

// Create toolset adapter from ToolExecutor
const toolHandler = async (toolCall: ToolCall): Promise<ToolResult> => {
  const result = await toolExecutor.executeTool({
    id: toolCall.id,
    name: toolCall.name,
    input: JSON.parse(toolCall.arguments),
  });
  return {
    toolCallId: result.toolUseId,
    output: result.output,
    isError: result.isError,
  };
};
const toolset = new SimpleToolset([BashToolSchema], toolHandler);

// Create AgentRunner with new interface
agentRunner = new AgentRunner({
  client: llmClient,
  systemPrompt,
  toolset,
  maxIterations: MAX_TOOL_ITERATIONS,
  isAutoEnhanceEnabled: () => settingsManager.isAutoEnhanceEnabled(),
  onMessagePart: (part: StreamedMessagePart) => {
    if (part.type === 'text' && part.text.trim()) {
      process.stdout.write(part.text);
    }
  },
  onToolResult: (result: ToolResult) => {
    if (terminalRenderer) {
      terminalRenderer.renderToolEnd({
        id: result.toolCallId,
        success: !result.isError,
        output: result.output,
      });
    }
  },
});
```

**Step 3: Update handleSpecialCommand for /clear**

```typescript
case '/clear':
  state.conversationHistory = [];
  state.turnNumber = 1;
  if (agentRunner) {
    agentRunner.clearHistory();
  }
  console.log(chalk.green('\nConversation history cleared.\n'));
  return true;
```

**Step 4: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/cli/repl.ts
git commit -m "refactor(cli): update repl.ts to use new AgentRunner interface"
```

---

## Task 9: Update index.ts Exports

**Files:**
- Modify: `src/agent/index.ts`

**Step 1: Update exports**

```typescript
// src/agent/index.ts
/**
 * Agent Module Index
 *
 * Core Exports:
 * - Message types and helpers
 * - generate() function
 * - step() function
 * - Toolset interface
 * - AgentRunner class
 * - AnthropicClient
 */

// Message types
export {
  type Role,
  type ContentPart,
  type TextPart,
  type ThinkPart,
  type ImageUrlPart,
  type ToolCall,
  type ToolResult,
  type Message,
  createTextMessage,
  extractText,
  toAnthropicMessage,
  toolResultToMessage,
} from './message.ts';

// Generate function
export { generate, type GenerateResult, type GenerateOptions, type OnMessagePart, type OnToolCall } from './generate.ts';

// Step function
export { step, type StepResult, type StepOptions, type OnToolResult } from './step.ts';

// Toolset
export { type Toolset, type ToolHandler, SimpleToolset } from './toolset.ts';

// Agent Runner
export { AgentRunner, type AgentRunnerOptions } from './agent-runner.ts';

// Anthropic Client
export { AnthropicClient, type GenerationKwargs } from './anthropic-client.ts';
export { AnthropicStreamedMessage } from './anthropic-streamed-message.ts';
export {
  type ThinkingEffort,
  type TokenUsage,
  type StreamedMessagePart,
  ChatProviderError,
  APIConnectionError,
  APITimeoutError,
  APIStatusError,
  APIEmptyResponseError,
  getTokenUsageInput,
  getTokenUsageTotal,
} from './anthropic-types.ts';

// Context Persistence (kept for session management)
export {
  ContextPersistence,
  type SessionInfo,
  type PersistentMessage,
  type SessionsIndex,
} from './context-persistence.ts';

// Tool Executor (kept for backward compatibility)
export { ToolExecutor, type ToolCallInput, type ToolExecutionResult } from './tool-executor.ts';

// System Prompt
export { buildSystemPrompt, type SystemPromptOptions } from './system-prompt.ts';

// Skill Sub-Agent exports
export { SkillSubAgent, type SkillSubAgentOptions } from '../skill-sub-agent/index.ts';
export { SkillMemoryStore } from '../skill-sub-agent/index.ts';
export {
  buildSkillSubAgentPrompt,
  buildSkillSubAgentToolSection,
  SKILL_SEARCH_INSTRUCTIONS,
  SKILL_ENHANCE_INSTRUCTIONS,
} from '../skill-sub-agent/index.ts';
export {
  type SkillMetadata,
  type SkillMatch,
  type SkillSearchResult,
  type SkillEnhanceResult,
  type SkillEvaluateResult,
  type SkillSubAgentCommand,
  type SkillSubAgentResponse,
  SkillMetadataSchema,
  SkillSearchResultSchema,
  SkillEnhanceResultSchema,
  SkillEvaluateResultSchema,
  SkillSubAgentCommandSchema,
} from '../skill-sub-agent/index.ts';

// Auto Enhance Trigger
export { AutoEnhanceTrigger, type AutoEnhanceTriggerOptions } from './auto-enhance-trigger.ts';
```

**Step 2: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/agent/index.ts
git commit -m "refactor(agent): update index.ts exports for new architecture"
```

---

## Task 10: Delete Obsolete Files

**Files:**
- Delete: `src/agent/llm-client.ts`
- Delete: `src/agent/context-manager.ts`
- Delete: `tests/unit/agent/context-manager.test.ts`

**Step 1: Update tool-executor.ts to remove context-manager import**

```typescript
// In src/agent/tool-executor.ts, remove:
// import type { ToolResultContent } from './context-manager.ts';

// Define ToolResultContent locally or import from message.ts if needed
```

**Step 2: Delete files**

```bash
rm src/agent/llm-client.ts
rm src/agent/context-manager.ts
rm tests/unit/agent/context-manager.test.ts
```

**Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(agent): delete obsolete llm-client.ts and context-manager.ts"
```

---

## Task 11: Final Verification

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Run type check**

Run: `bun run typecheck` (or `tsc --noEmit`)
Expected: No type errors

**Step 3: Run the REPL manually**

Run: `bun run start` (or your start command)
Expected: REPL starts and responds to messages

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(agent): address final issues from verification"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | message.ts, message.test.ts | Create Message types |
| 2 | message.ts, message.test.ts | Add conversion functions |
| 3 | message.ts, message.test.ts | Add stream merging |
| 4 | generate.ts, generate.test.ts | Create generate() |
| 5 | toolset.ts, toolset.test.ts | Create Toolset interface |
| 6 | step.ts, step.test.ts | Create step() |
| 7 | agent-runner.ts, agent-runner.test.ts | Refactor AgentRunner |
| 8 | repl.ts | Update REPL |
| 9 | index.ts | Update exports |
| 10 | delete files | Remove obsolete code |
| 11 | - | Final verification |
