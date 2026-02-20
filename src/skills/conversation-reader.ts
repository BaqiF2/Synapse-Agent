/**
 * Conversation Reader (re-export shim)
 * 实际实现已迁移到 generator/conversation-reader.ts
 */
export {
  ConversationReader,
  type ConversationTurn,
  type ConversationSummary,
  type ToolCall,
  type ToolResult,
} from './generator/conversation-reader.ts';

export { ConversationReader as default } from './generator/conversation-reader.ts';
