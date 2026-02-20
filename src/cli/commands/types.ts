/**
 * REPL 命令系统的共享类型定义
 *
 * 功能：定义命令模块间共享的接口和类型，避免循环依赖。
 *
 * 核心导出：
 * - ReplState: REPL 运行状态接口
 * - SigintHandlerOptions: SIGINT 信号处理选项
 * - SpecialCommandOptions: 特殊命令处理选项
 * - ResumeSessionHandler: 恢复会话的回调函数类型
 */

import type * as readline from 'node:readline';
import type { AgentRunner } from '../../core/agent-runner.ts';

export interface ReplState {
  isProcessing: boolean;
}

export interface SigintHandlerOptions {
  state: ReplState;
  promptUser: () => void;
  interruptCurrentTurn: () => void;
  clearCurrentInput?: () => void;
}

export type ResumeSessionHandler = (sessionId: string) => void | Promise<void>;

export interface SpecialCommandOptions {
  skipExit?: boolean;
  onResumeSession?: ResumeSessionHandler;
  getCurrentSessionId?: () => string | null;
}

/** handleSpecialCommand 所需的上下文参数 */
export interface CommandContext {
  command: string;
  rl: readline.Interface;
  agentRunner?: AgentRunner | null;
  options?: SpecialCommandOptions;
}
