import { randomUUID } from 'node:crypto';

interface MockServerOptions {
  replyText: string;
}

interface SseEvent {
  type: string;
  [key: string]: unknown;
}

export interface MockServerHandle {
  baseUrl: string;
  stop: () => Promise<void>;
}

function buildMessageEvents(replyText: string): SseEvent[] {
  const messageId = `msg_${randomUUID()}`;
  return [
    {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-sonnet-4-5',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: replyText },
    },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    {
      type: 'message_stop',
    },
  ];
}

function formatSseEvent(event: SseEvent): string {
  const payload = JSON.stringify(event);
  return `event: ${event.type}\ndata: ${payload}\n\n`;
}

export function startMockAnthropicServer(options: MockServerOptions): MockServerHandle {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method !== 'POST' || url.pathname !== '/v1/messages') {
        return new Response('Not found', { status: 404 });
      }

      const events = buildMessageEvents(options.replyText);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const event of events) {
            controller.enqueue(encoder.encode(formatSseEvent(event)));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
      });
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    stop: async () => {
      server.stop();
    },
  };
}
