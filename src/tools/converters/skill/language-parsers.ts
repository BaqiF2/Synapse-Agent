/**
 * 各语言 Docstring 解析器
 *
 * 提供 Python、Shell、TypeScript/JavaScript 三种语言的 docstring 解析能力。
 * 从 docstring-parser.ts 提取，实现解析入口与语言特定逻辑的职责分离。
 *
 * 核心导出:
 * - parsePythonDocstring: 解析 Python 三引号 docstring
 * - parseShellDocstring: 解析 Shell 注释块 docstring
 * - parseJSDocstring: 解析 JSDoc 风格注释
 * - parseParamType: 解析参数类型字符串
 * - RawDocstring: 原始解析结果接口
 */

/** 原始解析结果 */
export interface RawDocstring {
  description: string;
  params: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    default?: string;
  }>;
  returns?: string;
  examples: string[];
}

type ParsedParam = RawDocstring['params'][number];

function emptyDocstring(): RawDocstring {
  return { description: '', params: [], examples: [] };
}

/** 解析参数类型字符串，提取类型、是否必需、默认值 */
export function parseParamType(typeStr: string): { type: string; required: boolean; defaultValue?: string } {
  let type = typeStr.trim();
  let required = true;
  let defaultValue: string | undefined;

  const defaultMatch = type.match(/,?\s*default:?\s*["']?([^"')]+)["']?/i);
  if (defaultMatch) {
    const rawDefault = defaultMatch[1];
    if (rawDefault) defaultValue = rawDefault.trim();
    type = type.replace(defaultMatch[0], '').trim();
    required = false;
  }

  if (type.includes('optional') || type.includes('?')) {
    required = false;
    type = type.replace(/\s*,?\s*optional\s*/i, '').replace(/\?/g, '').trim();
  }

  return { type, required, defaultValue };
}

// --- 共用的 section 检测 ---

/** 检测当前行是否为 section 标题，返回对应 section 名或 null */
function detectSection(trimmed: string): string | null {
  if (/^(Parameters?|Args?|Arguments?):?\s*$/i.test(trimmed)) return 'params';
  if (/^(Returns?|Return value):?\s*$/i.test(trimmed)) return 'returns';
  if (/^(Examples?|Usage):?\s*$/i.test(trimmed)) return 'examples';
  if (/^(Description):?\s*$/i.test(trimmed)) return 'description';
  return null;
}

/** 尝试匹配参数行，返回解析后的参数对象或 null */
function tryMatchParam(
  trimmed: string,
  pattern: RegExp,
): ParsedParam | null {
  const m = trimmed.match(pattern);
  if (!m) return null;
  const name = m[1] ?? '';
  if (!name) return null;
  const { type, required, defaultValue } = parseParamType(m[2] ?? 'string');
  return { name: name.replace(/^-+/, ''), type, description: m[3] ?? '', required, default: defaultValue };
}

/** 基于行列表的通用 section 解析 — Python/Shell 共用 */
function parseSections(
  lines: string[],
  paramPattern: RegExp,
  descriptionFilter?: (trimmed: string, descriptionLines: string[]) => void,
): RawDocstring {
  const result = emptyDocstring();
  let currentSection = 'description';
  const descLines: string[] = [];
  let currentParam: ParsedParam | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const section = detectSection(trimmed);
    if (section) { currentSection = section; continue; }

    switch (currentSection) {
      case 'description':
        if (descriptionFilter) {
          descriptionFilter(trimmed, descLines);
        } else if (trimmed) {
          descLines.push(trimmed);
        }
        break;
      case 'params': {
        const param = tryMatchParam(trimmed, paramPattern);
        if (param) {
          if (currentParam) result.params.push(currentParam);
          currentParam = param;
        } else if (currentParam && trimmed) {
          currentParam.description += ' ' + trimmed;
        }
        break;
      }
      case 'returns':
        if (trimmed) result.returns = (result.returns || '') + trimmed + ' ';
        break;
      case 'examples':
        if (trimmed) result.examples.push(trimmed);
        break;
    }
  }

  if (currentParam) result.params.push(currentParam);
  result.description = descLines.join(' ').trim();
  result.returns = result.returns?.trim();
  return result;
}

// --- Python 解析 ---

const PYTHON_PARAM_RE = /^[-]*([\w-]+)\s*\(([^)]+)\):\s*(.*)$/;

/** 解析 Python 三引号 docstring */
export function parsePythonDocstring(content: string): RawDocstring {
  const docstringMatch = content.match(/^[^'"]*?(['"]){3}([\s\S]*?)\1{3}/m);
  if (!docstringMatch?.[2]) return emptyDocstring();
  return parseSections(docstringMatch[2].split('\n'), PYTHON_PARAM_RE);
}

// --- Shell 解析 ---

const SHELL_PARAM_RE = /^[$]*(\d+|[\w-]+)(?:=\w+)?\s*\(([^)]+)\):\s*(.*)$/;

/** 解析 Shell 注释块 docstring */
export function parseShellDocstring(content: string): RawDocstring {
  const lines = content.split('\n');
  const commentLines: string[] = [];
  let foundShebang = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#!')) { foundShebang = true; continue; }
    if (trimmed.startsWith('#')) {
      commentLines.push(trimmed.replace(/^#\s?/, ''));
    } else if (trimmed && foundShebang) {
      break;
    }
  }

  return parseSections(commentLines, SHELL_PARAM_RE, (trimmed, descLines) => {
    // Shell 特有: "script-name - description" 格式
    if (trimmed && !trimmed.match(/^[\w-]+ - /)) {
      descLines.push(trimmed);
    } else if (trimmed.match(/^[\w-]+ - /)) {
      const summary = trimmed.match(/^[\w-]+ - (.+)$/)?.[1];
      if (summary) descLines.push(summary);
    }
  });
}

// --- JSDoc 解析 ---

/** 解析 JSDoc 风格注释（TypeScript/JavaScript） */
export function parseJSDocstring(content: string): RawDocstring {
  const jsdocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
  if (!jsdocMatch?.[1]) return emptyDocstring();

  const result = emptyDocstring();
  const lines = jsdocMatch[1].split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim());
  let currentSection = 'description';
  const descLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('@param')) {
      const m = line.match(/@param\s+(?:\{([^}]+)\}\s+)?(\w+)\s*-?\s*(.*)$/);
      if (m && m[2]) {
        const { type, required, defaultValue } = parseParamType(m[1] ?? 'string');
        result.params.push({ name: m[2], type, description: m[3] ?? '', required, default: defaultValue });
      }
      continue;
    }
    if (line.startsWith('@returns') || line.startsWith('@return')) {
      const rm = line.match(/@returns?\s+(?:\{([^}]+)\}\s+)?(.*)$/);
      if (rm) { const r = rm[2] || rm[1]; if (r) result.returns = r; }
      continue;
    }
    if (line.startsWith('@example')) { currentSection = 'examples'; continue; }
    if (line.startsWith('@')) { currentSection = 'other'; continue; }

    if (currentSection === 'description' && line && !line.startsWith('*')) descLines.push(line);
    else if (currentSection === 'examples' && line) result.examples.push(line);
  }

  result.description = descLines.join(' ').trim();
  return result;
}
