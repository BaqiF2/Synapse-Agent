/**
 * 统一错误类型体系 — 定义 Synapse Agent 所有自定义错误类型。
 * 每种错误类型对应特定的故障场景，携带结构化的上下文信息。
 *
 * 核心导出:
 * - SynapseError: 基础错误类（含 code 和 recoverable 属性）
 * - AuthenticationError: API Key 无效
 * - TimeoutError: 操作超时
 * - RateLimitError: 速率限制
 * - ModelNotFoundError: 模型不存在
 * - ContextLengthError: 上下文超长
 * - StreamInterruptedError: 流中断
 * - FileNotFoundError: 文件不存在
 * - PermissionError: 权限不足
 * - ConfigurationError: 配置错误
 * - ToolExecutionError: 工具执行失败
 * - CommandNotFoundError: 命令未找到
 * - SkillValidationError: 技能校验失败
 * - isSynapseError: 类型守卫函数
 */

/** 基础错误类，所有 Synapse 错误的父类 */
export class SynapseError extends Error {
  public readonly code: string;
  /** 该错误是否可恢复（可恢复错误不应终止 Agent 循环） */
  public readonly recoverable: boolean;

  constructor(message: string, code: string, options?: ErrorOptions & { recoverable?: boolean }) {
    super(message, options);
    this.name = 'SynapseError';
    this.code = code;
    this.recoverable = options?.recoverable ?? false;
  }
}

/**
 * 类型守卫：检查是否为 SynapseError 实例
 */
export function isSynapseError(error: unknown): error is SynapseError {
  return error instanceof SynapseError;
}

/** API Key 无效或认证失败 */
export class AuthenticationError extends SynapseError {
  public readonly provider: string;

  constructor(provider: string, message?: string) {
    super(
      message ?? `Authentication failed for provider: ${provider}`,
      'AUTHENTICATION_ERROR',
    );
    this.name = 'AuthenticationError';
    this.provider = provider;
  }
}

/** 操作超时 */
export class TimeoutError extends SynapseError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number, message?: string) {
    super(
      message ?? `Operation timed out after ${timeoutMs}ms`,
      'TIMEOUT_ERROR',
    );
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** 速率限制触发 */
export class RateLimitError extends SynapseError {
  public readonly retryAfterMs: number | undefined;

  constructor(retryAfterMs?: number, message?: string) {
    super(
      message ?? `Rate limit exceeded${retryAfterMs ? `, retry after ${retryAfterMs}ms` : ''}`,
      'RATE_LIMIT_ERROR',
    );
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** 请求的模型不存在 */
export class ModelNotFoundError extends SynapseError {
  public readonly model: string;

  constructor(model: string, message?: string) {
    super(
      message ?? `Model not found: ${model}`,
      'MODEL_NOT_FOUND_ERROR',
    );
    this.name = 'ModelNotFoundError';
    this.model = model;
  }
}

/** 输入超过模型上下文窗口 */
export class ContextLengthError extends SynapseError {
  public readonly actualTokens: number;
  public readonly maxTokens: number;

  constructor(actualTokens: number, maxTokens: number, message?: string) {
    super(
      message ?? `Context length exceeded: ${actualTokens} tokens > ${maxTokens} max`,
      'CONTEXT_LENGTH_ERROR',
    );
    this.name = 'ContextLengthError';
    this.actualTokens = actualTokens;
    this.maxTokens = maxTokens;
  }
}

/** 流式传输过程中断 */
export class StreamInterruptedError extends SynapseError {
  public readonly partialContent: string | undefined;

  constructor(partialContent?: string, message?: string) {
    super(
      message ?? 'Stream interrupted during transmission',
      'STREAM_INTERRUPTED_ERROR',
    );
    this.name = 'StreamInterruptedError';
    this.partialContent = partialContent;
  }
}

/** 文件不存在 */
export class FileNotFoundError extends SynapseError {
  public readonly filePath: string;

  constructor(filePath: string, message?: string) {
    super(
      message ?? `File not found: ${filePath}`,
      'FILE_NOT_FOUND_ERROR',
    );
    this.name = 'FileNotFoundError';
    this.filePath = filePath;
  }
}

/** 权限不足 */
export class PermissionError extends SynapseError {
  public readonly resource: string;

  constructor(resource: string, message?: string) {
    super(
      message ?? `Permission denied: ${resource}`,
      'PERMISSION_ERROR',
    );
    this.name = 'PermissionError';
    this.resource = resource;
  }
}

/** 配置错误 */
export class ConfigurationError extends SynapseError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

/** 工具执行失败（Agent Shell / Extend Shell 命令执行期间的错误） */
export class ToolExecutionError extends SynapseError {
  public readonly command: string;

  constructor(command: string, message?: string) {
    super(
      message ?? `Tool execution failed: ${command}`,
      'TOOL_EXECUTION_ERROR',
      { recoverable: true },
    );
    this.name = 'ToolExecutionError';
    this.command = command;
  }
}

/** 命令未找到（路由器无法匹配任何处理器） */
export class CommandNotFoundError extends SynapseError {
  public readonly command: string;

  constructor(command: string, message?: string) {
    super(
      message ?? `Command not found: ${command}`,
      'COMMAND_NOT_FOUND_ERROR',
      { recoverable: true },
    );
    this.name = 'CommandNotFoundError';
    this.command = command;
  }
}

/** 技能校验失败（技能格式、结构或内容不合规） */
export class SkillValidationError extends SynapseError {
  public readonly skillName: string;

  constructor(skillName: string, message?: string) {
    super(
      message ?? `Skill validation failed: ${skillName}`,
      'SKILL_VALIDATION_ERROR',
      { recoverable: true },
    );
    this.name = 'SkillValidationError';
    this.skillName = skillName;
  }
}
