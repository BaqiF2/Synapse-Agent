/**
 * Sandbox Permission Handler
 *
 * 处理沙箱权限请求的构建、检测和用户授权解析。
 * 从 AgentRunner 中提取，使主循环保持简洁。
 *
 * 核心导出：
 * - SandboxPermissionHandler: 沙箱权限处理器
 * - SandboxPermissionRequest: 权限请求结构
 * - SandboxPermissionOption: 权限选项类型
 */

import * as path from 'node:path';
import type { ToolCall, ToolResult as MessageToolResult } from '../providers/message.ts';
import type { Toolset } from '../tools/toolset.ts';

export type SandboxPermissionOption = 'allow_once' | 'allow_session' | 'allow_permanent' | 'deny';

export interface SandboxPermissionRequest {
  type: 'sandbox_access';
  resource: string;
  reason: string;
  command: string;
  options: SandboxPermissionOption[];
}

/** Bash 工具的沙箱感知接口（内部协议） */
interface SandboxAwareBashTool {
  call(args: unknown): Promise<{ output: string; message: string; extras?: Record<string, unknown> }>;
  executeUnsandboxed(command: string, cwd?: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    blocked: boolean;
  }>;
  allowSession(resourcePath: string, cwd?: string): Promise<void>;
  allowPermanent(resourcePath: string, cwd?: string): Promise<void>;
}

/**
 * SandboxPermissionHandler - 处理沙箱权限请求
 *
 * 职责：
 * 1. 从工具执行结果中检测 sandbox_blocked 事件
 * 2. 构建 SandboxPermissionRequest
 * 3. 处理用户授权（allow_once, allow_session, allow_permanent, deny）
 */
export class SandboxPermissionHandler {
  private pending: SandboxPermissionRequest | null = null;

  getPending(): SandboxPermissionRequest | null {
    return this.pending;
  }

  setPending(request: SandboxPermissionRequest | null): void {
    this.pending = request;
  }

  /**
   * 从工具执行结果中检测沙箱阻止事件，构建权限请求
   */
  buildFromToolResults(
    toolCalls: ToolCall[],
    toolResults: MessageToolResult[]
  ): SandboxPermissionRequest | null {
    for (const tr of toolResults) {
      const extras = tr.returnValue.extras as Record<string, unknown> | undefined;
      if (extras?.type !== 'sandbox_blocked') {
        continue;
      }

      const resource = typeof extras.resource === 'string' ? extras.resource : 'unknown-resource';
      const reason = typeof tr.returnValue.message === 'string' && tr.returnValue.message.length > 0
        ? tr.returnValue.message
        : 'Sandbox blocked command execution';
      const command = this.extractCommandFromToolCall(toolCalls, tr.toolCallId);

      return {
        type: 'sandbox_access',
        resource,
        reason,
        command,
        options: ['allow_once', 'allow_session', 'allow_permanent', 'deny'],
      };
    }

    return null;
  }

  /**
   * 解析用户授权并执行命令
   */
  async resolve(
    option: SandboxPermissionOption,
    toolset: Toolset
  ): Promise<string> {
    const pending = this.pending;
    if (!pending) {
      throw new Error('No pending sandbox permission request');
    }

    const bashTool = toolset.getTool?.('Bash') as unknown as SandboxAwareBashTool | undefined;
    if (!bashTool) {
      throw new Error('Bash tool is unavailable for sandbox permission handling');
    }

    const cwd = process.cwd();
    const resourceForWhitelist = this.toWhitelistPath(pending.resource);
    this.pending = null;

    if (option === 'deny') {
      return `User denied access to ${pending.resource}`;
    }

    if (option === 'allow_once') {
      const result = await bashTool.executeUnsandboxed(pending.command, cwd);
      return this.formatExecuteResult(result.stdout, result.stderr, result.exitCode);
    }

    if (option === 'allow_session') {
      await bashTool.allowSession(resourceForWhitelist, cwd);
      return this.retryBlockedCommand(bashTool, pending.command);
    }

    await bashTool.allowPermanent(resourceForWhitelist, cwd);
    return this.retryBlockedCommand(bashTool, pending.command);
  }

  private extractCommandFromToolCall(toolCalls: ToolCall[], toolCallId: string): string {
    const call = toolCalls.find((item) => item.id === toolCallId);
    if (!call || call.name !== 'Bash') {
      return '';
    }

    try {
      const parsed = JSON.parse(call.arguments) as { command?: unknown };
      return typeof parsed.command === 'string' ? parsed.command : '';
    } catch {
      return '';
    }
  }

  private toWhitelistPath(resource: string): string {
    if (!resource || resource === '/' || resource.endsWith('/')) {
      return resource;
    }
    return path.dirname(resource);
  }

  private async retryBlockedCommand(
    bashTool: SandboxAwareBashTool,
    command: string
  ): Promise<string> {
    const result = await bashTool.call({ command });
    const output = [result.output, result.message].filter((item) => item && item.length > 0).join('\n\n');
    return output || '(Command executed successfully with no output)';
  }

  private formatExecuteResult(stdout: string, stderr: string, exitCode: number): string {
    let output = '';
    if (stdout) {
      output += stdout;
    }
    if (stderr) {
      if (output) {
        output += '\n\n';
      }
      output += `[stderr]\n${stderr}`;
    }
    if (!output) {
      output = `(Command exited with code ${exitCode})`;
    }
    return output;
  }
}
