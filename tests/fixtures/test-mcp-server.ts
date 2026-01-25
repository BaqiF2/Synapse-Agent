#!/usr/bin/env bun
/**
 * Simple MCP Test Server
 *
 * A minimal MCP server for testing the McpClient connection.
 * Provides a single "echo" tool that returns its input.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'test-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'echo',
        description: 'Echoes the input message back',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to echo',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'add',
        description: 'Adds two numbers together',
        inputSchema: {
          type: 'object',
          properties: {
            a: {
              type: 'number',
              description: 'First number',
            },
            b: {
              type: 'number',
              description: 'Second number',
            },
          },
          required: ['a', 'b'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'echo') {
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${(args as { message: string }).message}`,
        },
      ],
    };
  }

  if (name === 'add') {
    const { a, b } = args as { a: number; b: number };
    return {
      content: [
        {
          type: 'text',
          text: `Result: ${a + b}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
