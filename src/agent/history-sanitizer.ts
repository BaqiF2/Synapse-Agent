import type { Message } from '../providers/message.ts';

function isObjectJsonString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function hasMalformedToolArguments(message: Message): boolean {
  if (message.role !== 'assistant') {
    return false;
  }

  const toolCalls = message.toolCalls ?? [];
  if (toolCalls.length === 0) {
    return false;
  }

  return toolCalls.some((toolCall) => !isObjectJsonString(toolCall.arguments));
}

export function sanitizeToolProtocolHistory(messages: readonly Message[]): { sanitized: Message[]; changed: boolean } {
  const sanitized: Message[] = [];
  let changed = false;
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];
    if (!message) {
      break;
    }

    if (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0) {
      if (hasMalformedToolArguments(message)) {
        changed = true;
        index += 1;
        while (index < messages.length && messages[index]?.role === 'tool') {
          changed = true;
          index += 1;
        }
        continue;
      }

      const expectedToolCallIds = new Set((message.toolCalls ?? []).map((call) => call.id));
      const matchedToolCallIds = new Set<string>();
      const toolMessages: Message[] = [];

      let cursor = index + 1;
      let invalidSequence = false;
      while (cursor < messages.length) {
        const next = messages[cursor];
        if (!next || next.role !== 'tool') {
          break;
        }

        const toolCallId = next.toolCallId;
        if (!toolCallId || !expectedToolCallIds.has(toolCallId) || matchedToolCallIds.has(toolCallId)) {
          invalidSequence = true;
          break;
        }

        matchedToolCallIds.add(toolCallId);
        toolMessages.push(next);
        cursor += 1;

        if (matchedToolCallIds.size === expectedToolCallIds.size) {
          break;
        }
      }

      if (!invalidSequence && matchedToolCallIds.size === expectedToolCallIds.size) {
        sanitized.push(message, ...toolMessages);
        index += 1 + toolMessages.length;
        continue;
      }

      changed = true;
      index += 1;
      while (index < messages.length && messages[index]?.role === 'tool') {
        changed = true;
        index += 1;
      }
      continue;
    }

    if (message.role === 'tool') {
      changed = true;
      index += 1;
      continue;
    }

    sanitized.push(message);
    index += 1;
  }

  return { sanitized, changed };
}
