/**
 * Conversation Reader
 *
 * Reads and parses conversation history files for skill enhancement analysis.
 *
 * @module conversation-reader
 *
 * Core Exports:
 * - ConversationReader: Class for reading conversation history
 * - ConversationTurn: Parsed conversation turn type
 * - ConversationSummary: Summary statistics type
 */

import * as fs from 'node:fs';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('conversation-reader');

/**
 * Estimated characters per token (rough approximation)
 */
const CHARS_PER_TOKEN = parseInt(process.env.SYNAPSE_CHARS_PER_TOKEN || '4', 10);

/**
 * Tool call information
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result information
 */
export interface ToolResult {
  toolUseId: string;
  content: string;
}

/**
 * Parsed conversation turn
 */
export interface ConversationTurn {
  id: string;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  rawContent?: unknown;
}

/**
 * Conversation summary statistics
 */
export interface ConversationSummary {
  totalTurns: number;
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  uniqueTools: string[];
  estimatedTokens: number;
}

/**
 * ConversationReader - Reads and parses conversation history
 *
 * Usage:
 * ```typescript
 * const reader = new ConversationReader();
 * const turns = reader.read('/path/to/session.jsonl');
 * const summary = reader.summarize(turns);
 * ```
 */
export class ConversationReader {
  /**
   * Read all turns from a conversation file
   *
   * @param filePath - Path to JSONL conversation file
   * @returns Array of conversation turns
   */
  read(filePath: string): ConversationTurn[] {
    if (!fs.existsSync(filePath)) {
      logger.warn('Conversation file not found', { path: filePath });
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => this.parseLine(line)).filter((t): t is ConversationTurn => t !== null);
  }

  /**
   * Read turns with token limit (reads from end)
   *
   * @param filePath - Path to JSONL conversation file
   * @param maxTokens - Maximum tokens to include
   * @returns Array of conversation turns (truncated)
   */
  readTruncated(filePath: string, maxTokens: number): ConversationTurn[] {
    const allTurns = this.read(filePath);
    const maxChars = maxTokens * CHARS_PER_TOKEN;

    let totalChars = 0;
    const result: ConversationTurn[] = [];

    // Read from end
    for (let i = allTurns.length - 1; i >= 0; i--) {
      const turn = allTurns[i];
      if (!turn) continue;

      const turnChars = JSON.stringify(turn.rawContent || turn.content).length;

      if (totalChars + turnChars > maxChars && result.length > 0) {
        break;
      }

      result.unshift(turn);
      totalChars += turnChars;
    }

    return result;
  }

  /**
   * Parse a single JSONL line into a conversation turn
   */
  private parseLine(line: string): ConversationTurn | null {
    try {
      const data = JSON.parse(line) as {
        id?: string;
        timestamp?: string;
        role?: string;
        content?: unknown;
      };

      if (!data.role || (data.role !== 'user' && data.role !== 'assistant')) {
        return null;
      }

      const turn: ConversationTurn = {
        id: data.id || `turn-${Date.now()}`,
        timestamp: data.timestamp || new Date().toISOString(),
        role: data.role,
        content: '',
        rawContent: data.content,
      };

      // Parse content
      if (typeof data.content === 'string') {
        turn.content = data.content;
      } else if (Array.isArray(data.content)) {
        turn.toolCalls = [];
        turn.toolResults = [];
        const textParts: string[] = [];

        for (const block of data.content) {
          if (typeof block !== 'object' || block === null) continue;

          const typedBlock = block as { type?: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: string };

          if (typedBlock.type === 'text' && typedBlock.text) {
            textParts.push(typedBlock.text);
          } else if (typedBlock.type === 'tool_use' && typedBlock.id && typedBlock.name) {
            turn.toolCalls.push({
              id: typedBlock.id,
              name: typedBlock.name,
              input: typedBlock.input || {},
            });
          } else if (typedBlock.type === 'tool_result' && typedBlock.tool_use_id) {
            turn.toolResults.push({
              toolUseId: typedBlock.tool_use_id,
              content: typeof typedBlock.content === 'string' ? typedBlock.content : JSON.stringify(typedBlock.content),
            });
          }
        }

        turn.content = textParts.join('\n');
      }

      return turn;
    } catch (error) {
      logger.warn('Failed to parse conversation line', { error });
      return null;
    }
  }

  /**
   * Extract tool call sequence from turns
   *
   * @param turns - Array of conversation turns
   * @returns Array of tool names in order
   */
  extractToolSequence(turns: ConversationTurn[]): string[] {
    return turns.flatMap((turn) => turn.toolCalls?.map((call) => call.name) ?? []);
  }

  /**
   * Generate summary statistics for conversation
   *
   * @param turns - Array of conversation turns
   * @returns Summary statistics
   */
  summarize(turns: ConversationTurn[]): ConversationSummary {
    const userTurns = turns.filter((t) => t.role === 'user').length;
    const toolSet = new Set<string>();
    let toolCalls = 0;
    let estimatedTokens = 0;

    for (const turn of turns) {
      if (turn.toolCalls) {
        toolCalls += turn.toolCalls.length;
        turn.toolCalls.forEach((call) => toolSet.add(call.name));
      }

      estimatedTokens += Math.ceil(
        JSON.stringify(turn.rawContent || turn.content).length / CHARS_PER_TOKEN
      );
    }

    return {
      totalTurns: turns.length,
      userTurns,
      assistantTurns: turns.length - userTurns,
      toolCalls,
      uniqueTools: Array.from(toolSet),
      estimatedTokens,
    };
  }
}

// Default export
export default ConversationReader;
