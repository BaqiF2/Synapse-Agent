/**
 * Help Generator (公共帮助文本生成器)
 *
 * 功能：生成统一格式的命令帮助文本（-h 简要帮助 和 --help 详细帮助）。
 * 统一 MCP wrapper-generator 和 Skill wrapper-generator 中的帮助生成逻辑。
 *
 * 核心导出：
 * - generateBriefHelp: 生成简要帮助文本（-h）
 * - generateDetailedHelp: 生成详细帮助文本（--help）
 * - HelpParam: 帮助文本中的参数描述
 */

/** 帮助文本中的参数描述 */
export interface HelpParam {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: unknown[];
}

/** 帮助生成选项 */
export interface HelpOptions {
  /** 完整命令名称，如 mcp:server:tool 或 skill:name:tool */
  commandName: string;
  /** 命令描述 */
  description?: string;
  /** 参数列表 */
  params: HelpParam[];
  /** 使用示例（仅用于 detailedHelp） */
  examples?: string[];
}

/**
 * 生成简要帮助文本（-h）
 *
 * 格式：Usage 行 + 描述 + 提示使用 --help
 */
export function generateBriefHelp(options: HelpOptions): string {
  const { commandName, description, params } = options;
  const requiredParams = params.filter((p) => p.required);
  const hasOptional = params.some((p) => !p.required);

  let usage = commandName;
  for (const p of requiredParams) {
    usage += ` <${p.name}>`;
  }
  if (hasOptional) {
    usage += ' [options]';
  }

  let help = `Usage: ${usage}\n`;
  if (description) {
    help += `${description}\n`;
  }
  help += `Use --help for detailed information.`;
  return help;
}

/**
 * 生成详细帮助文本（--help）
 *
 * 包含：标题、描述、用法、参数、选项、示例、特殊选项
 */
export function generateDetailedHelp(options: HelpOptions): string {
  const { commandName, description, params, examples = [] } = options;
  const requiredParams = params.filter((p) => p.required);
  const optionalParams = params.filter((p) => !p.required);

  let help = `${commandName}\n`;
  help += '='.repeat(commandName.length) + '\n\n';

  if (description) {
    help += `DESCRIPTION\n  ${description}\n\n`;
  }

  // Usage
  let usage = commandName;
  for (const p of requiredParams) {
    usage += ` <${p.name}>`;
  }
  if (optionalParams.length > 0) {
    usage += ' [options]';
  }
  help += `USAGE\n  ${usage}\n\n`;

  // Arguments（必选参数）
  if (requiredParams.length > 0) {
    help += 'ARGUMENTS\n';
    for (const p of requiredParams) {
      help += `  <${p.name}>  (${p.type}) ${p.description || ''}\n`;
      if (p.enumValues) {
        help += `             Allowed values: ${p.enumValues.join(', ')}\n`;
      }
    }
    help += '\n';
  }

  // Options（可选参数）
  if (optionalParams.length > 0) {
    help += 'OPTIONS\n';
    for (const p of optionalParams) {
      const defaultStr = p.defaultValue !== undefined ? ` (default: ${JSON.stringify(p.defaultValue)})` : '';
      help += `  --${p.name}=<value>  (${p.type}) ${p.description || ''}${defaultStr}\n`;
      if (p.enumValues) {
        help += `                      Allowed values: ${p.enumValues.join(', ')}\n`;
      }
    }
    help += '\n';
  }

  // Examples
  if (examples.length > 0) {
    help += 'EXAMPLES\n';
    for (const ex of examples) {
      help += `  ${ex}\n`;
    }
    help += '\n';
  }

  help += 'SPECIAL OPTIONS\n';
  help += '  -h         Show brief help\n';
  help += '  --help     Show this detailed help\n';

  return help;
}
