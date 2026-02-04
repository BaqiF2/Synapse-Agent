# AskUserQuestion 工具设计文档

## 概述

AskUserQuestion 是一个交互式用户提问工具，作为 Layer 2 Agent Shell Command 实现。允许 Agent 在执行过程中向用户提问，收集用户偏好、澄清模糊指令、获取实现决策。

### 核心特性

- **选项式交互** - Agent 提供选项列表，用户选择编号或自定义输入
- **批量提问** - 支持 1-4 个问题一次性提问
- **结构化收集** - 答案收集到 answers 对象返回给 LLM
- **自动 Other** - 自动提供 "Other" 选项供用户自定义输入
- **多选支持** - 通过 multiSelect 支持非互斥选项

---

## 数据结构

### QuestionOption

```typescript
/** 单个选项 */
interface QuestionOption {
  /** 选项显示文本（1-5 词） */
  label: string;
  /** 选项说明 */
  description: string;
}
```

### Question

```typescript
/** 单个问题 */
interface Question {
  /** 完整问题文本 */
  question: string;
  /** 短标签（最多 12 字符） */
  header: string;
  /** 选项列表（2-4 个） */
  options: QuestionOption[];
  /** 是否多选 */
  multiSelect: boolean;
}
```

### 命令输入格式

```typescript
interface AskUserQuestionInput {
  /** 问题列表（1-4 个） */
  questions: Question[];
}
```

### 命令输出格式

```typescript
interface AskUserQuestionOutput {
  /** 用户答案收集对象，key 为 header，value 为选择内容 */
  answers: Record<string, string>;
}
```

### 示例调用

```bash
AskUserQuestion '{"questions":[
  {
    "question":"Which authentication method should we use?",
    "header":"Auth method",
    "options":[
      {"label":"OAuth 2.0","description":"Industry standard, supports social login"},
      {"label":"JWT","description":"Stateless tokens, good for APIs"}
    ],
    "multiSelect":false
  }
]}'
```

### 示例返回

```json
{"answers":{"Auth method":"OAuth 2.0"}}
```

---

## 组件架构

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                     BashRouter                          │
│  identifyCommandType("AskUserQuestion ...") → AGENT_SHELL│
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│            AskUserQuestionHandler                       │
│  - 解析 JSON 参数                                       │
│  - 验证数据格式（Zod Schema）                           │
│  - 调用 TerminalPrompter.askQuestions()                │
│  - 格式化返回结果                                       │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              TerminalPrompter                           │
│  - 渲染问题和选项到终端                                 │
│  - 等待用户输入（数字选择 / 自定义）                    │
│  - 收集并返回用户答案                                   │
└─────────────────────────────────────────────────────────┘
```

### 文件结构

```
src/tools/handlers/agent-bash/
├── ask/
│   ├── index.ts              # 模块导出
│   ├── ask-user-question.ts  # AskUserQuestionHandler
│   ├── ask-schema.ts         # Zod Schema
│   ├── terminal-prompter.ts  # 终端交互逻辑
│   └── ask-user-question.md  # 命令说明文档
```

---

## 核心组件实现

### AskUserQuestionHandler

```typescript
// ask/ask-user-question.ts
export class AskUserQuestionHandler implements AgentBashHandler {
  private prompter: TerminalPrompter;

  constructor(prompter: TerminalPrompter) {
    this.prompter = prompter;
  }

  async execute(args: string): Promise<CommandResult> {
    // 1. 解析 JSON 参数
    const jsonStr = extractJsonFromArgs(args);
    if (!jsonStr) {
      return {
        stdout: '',
        stderr: 'Usage: AskUserQuestion \'{"questions":[...]}\'',
        exitCode: 1
      };
    }

    // 2. 验证 Schema
    const parseResult = AskUserQuestionInputSchema.safeParse(JSON.parse(jsonStr));
    if (!parseResult.success) {
      return {
        stdout: '',
        stderr: formatZodError(parseResult.error),
        exitCode: 1
      };
    }

    // 3. 向用户提问并等待回答
    const { questions } = parseResult.data;
    const userAnswers = await this.prompter.askQuestions(questions);

    // 4. 构建 answers 对象
    const answers: Record<string, string> = {};
    for (const answer of userAnswers) {
      if (answer.customInput) {
        answers[answer.header] = `Other (custom: ${answer.customInput})`;
      } else {
        answers[answer.header] = answer.selected.join(', ');
      }
    }

    // 5. 返回 JSON 格式
    const result = JSON.stringify({ answers });
    return { stdout: result, stderr: '', exitCode: 0 };
  }
}
```

### TerminalPrompter

```typescript
// ask/terminal-prompter.ts
export class TerminalPrompter {
  private rl: readline.Interface;

  constructor(input: NodeJS.ReadableStream, output: NodeJS.WritableStream) {
    this.rl = readline.createInterface({ input, output });
  }

  async askQuestions(questions: Question[]): Promise<UserAnswer[]> {
    const answers: UserAnswer[] = [];

    for (const q of questions) {
      const answer = await this.askSingleQuestion(q);
      answers.push(answer);
    }

    return answers;
  }

  private async askSingleQuestion(q: Question): Promise<UserAnswer> {
    // 渲染问题
    this.renderQuestion(q);

    // 等待用户输入
    const input = await this.waitForInput();

    // 解析用户输入
    return this.parseInput(q, input);
  }

  private renderQuestion(q: Question): void {
    console.log(`\n┌─ ${q.header} ─────────────────────────────────────┐`);
    console.log(`│ ${q.question}`);
    console.log('│');
    q.options.forEach((opt, i) => {
      console.log(`│  ${i + 1}. ${opt.label}`);
      console.log(`│     ${opt.description}`);
    });
    console.log(`│  0. Other (custom input)`);
    console.log('└─────────────────────────────────────────────────┘');

    const hint = q.multiSelect
      ? 'Enter numbers (e.g., 1,3) or 0 for custom: '
      : 'Enter number or 0 for custom: ';
    process.stdout.write(hint);
  }

  private async waitForInput(): Promise<string> {
    return new Promise(resolve => {
      this.rl.once('line', resolve);
    });
  }

  private async parseInput(q: Question, input: string): Promise<UserAnswer> {
    const trimmed = input.trim().toLowerCase();

    // 处理自定义输入
    if (trimmed === '0' || trimmed === 'other') {
      const customInput = await this.waitForCustomInput();
      return {
        header: q.header,
        selected: ['Other'],
        customInput,
      };
    }

    // 解析数字选择
    const nums = trimmed.split(',').map(s => parseInt(s.trim(), 10));
    const selected = nums
      .filter(n => n >= 1 && n <= q.options.length)
      .map(n => q.options[n - 1].label);

    // 如果多选但只允许单选，取第一个
    const finalSelected = q.multiSelect ? selected : selected.slice(0, 1);

    return {
      header: q.header,
      selected: finalSelected.length > 0 ? finalSelected : [q.options[0].label],
    };
  }

  private async waitForCustomInput(): Promise<string> {
    process.stdout.write('Enter your answer: ');
    return new Promise(resolve => {
      this.rl.once('line', resolve);
    });
  }
}
```

---

## 系统提示词

新增 `src/tools/handlers/agent-bash/ask/ask-user-question.md`：

```markdown
AskUserQuestion - Ask user questions during execution

USAGE:
    AskUserQuestion '<json_input>'

ARGUMENTS:
    <json_input>    JSON object containing questions array

JSON SCHEMA:
    {
      "questions": [           // Required, 1-4 questions
        {
          "question": string,  // Required, complete question text ending with ?
          "header": string,    // Required, short label max 12 chars (e.g., "Auth method")
          "options": [         // Required, 2-4 options
            {
              "label": string,       // Display text, 1-5 words
              "description": string  // Explanation of the option
            }
          ],
          "multiSelect": boolean  // Required, true for multiple selections
        }
      ]
    }

OUTPUT:
    JSON object with answers:
        {"answers":{"header1":"selected_label","header2":"label1, label2"}}

NOTES:
    - "Other" option is automatically provided for custom input
    - If recommending an option, make it first and add "(Recommended)" to label
    - Use multiSelect: true when choices are not mutually exclusive

WHEN TO USE:
    - Gathering user preferences or requirements
    - Clarifying ambiguous instructions
    - Getting decisions on implementation choices
    - Offering choices about what direction to take

WHEN NOT TO USE:
    - The answer is clearly stated in user's message
    - You can make a reasonable default decision
    - The question is about implementation details user doesn't need to know

EXAMPLES:
    AskUserQuestion '{"questions":[{"question":"Which database?","header":"Database","options":[{"label":"PostgreSQL","description":"Relational DB"},{"label":"MongoDB","description":"Document store"}],"multiSelect":false}]}'

    # Returns: {"answers":{"Database":"PostgreSQL"}}

    AskUserQuestion '{"questions":[{"question":"Which features to enable?","header":"Features","options":[{"label":"Caching","description":"Redis caching"},{"label":"Logging","description":"JSON logs"}],"multiSelect":true}]}'

    # Returns: {"answers":{"Features":"Caching, Logging"}}
```

---

## 输入验证规则

### 字段验证

**questions 数组**：
- 必填，1-4 个问题
- 空数组返回错误

**question**：
- 必填，非空字符串
- 最大长度：500 字符

**header**：
- 必填，非空字符串
- 最大长度：12 字符

**options 数组**：
- 必填，2-4 个选项

**option.label**：
- 必填，非空字符串
- 最大长度：50 字符

**option.description**：
- 必填，非空字符串
- 最大长度：200 字符

**multiSelect**：
- 必填，布尔值

### Zod Schema

```typescript
// ask/ask-schema.ts
import { z } from 'zod';

const QuestionOptionSchema = z.object({
  label: z.string().min(1).max(50),
  description: z.string().min(1).max(200),
});

const QuestionSchema = z.object({
  question: z.string().min(1).max(500),
  header: z.string().min(1).max(12),
  options: z.array(QuestionOptionSchema).min(2).max(4),
  multiSelect: z.boolean(),
});

// 输入 Schema
export const AskUserQuestionInputSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(4),
});

// 输出 Schema
export const AskUserQuestionOutputSchema = z.object({
  answers: z.record(z.string(), z.string()),
});
```

### 错误处理

**JSON 解析失败**：
```
Error: Invalid JSON format
Usage: AskUserQuestion '{"questions":[...]}'
```

**Schema 验证失败**：
```
Error: Validation failed
- questions[0].header: String must contain at most 12 character(s)
- questions[0].options: Array must contain at least 2 element(s)
- questions[0].multiSelect: Required
```

**空参数**：
```
Error: Missing JSON parameter
Usage: AskUserQuestion '{"questions":[...]}'
```

---

## 执行流程

```
┌─────────────────────────────────────────────────────────┐
│ AI 遇到需要决策的场景                                    │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 是否需要用户输入?    │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
          否                          是
           ↓                           ↓
     继续执行任务              构建 AskUserQuestion 调用
                                       ↓
┌─────────────────────────────────────────────────────────┐
│ 验证参数                                                │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 参数有效?            │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
          否                          是
           ↓                           ↓
      返回错误                   渲染问题界面
                                       ↓
┌─────────────────────────────────────────────────────────┐
│ 显示问题和选项                                          │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 等待用户选择                                            │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 用户选择             │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
       预设选项                      Other
           ↓                           ↓
       记录选择 ◄───── 用户输入自定义文本
           ↓
              ┌──────────┴──────────┐
              │ 还有更多问题?        │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
          是                          否
           ↓                           ↓
    返回显示问题和选项          返回 answers 对象
                                       ↓
┌─────────────────────────────────────────────────────────┐
│ AI 根据答案继续执行                                     │
└─────────────────────────────────────────────────────────┘
```

---

## 测试用例

### 正常流程

1. 单问题单选 → 验证返回正确的 answers 对象
2. 单问题多选 → 验证 multiSelect 正确收集多个选项
3. 多问题混合 → 验证多个问题依次提问并收集
4. 选择 Other → 验证自定义输入正确收集

### 错误处理

5. 无效 JSON → 验证错误提示
6. 缺失必填字段 → 验证 Schema 错误（question/header/options/multiSelect）
7. 空 questions 数组 → 验证最小长度校验
8. 超过 4 个问题 → 验证最大长度校验
9. 选项少于 2 个 → 验证 options 最小长度
10. 选项超过 4 个 → 验证 options 最大长度

### 边界情况

11. header 超过 12 字符 → 验证长度限制
12. question 超过 500 字符 → 验证长度限制
13. 无效数字输入 → 验证默认选择第一项
14. 空输入 → 验证默认行为

### 用户交互

15. 数字选择 → 输入 `1` 选择第一项
16. 多选数字 → 输入 `1,3` 选择多项
17. 输入 0 或 other → 进入自定义输入模式
18. 自定义输入为空 → 验证处理逻辑

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `ASK_MAX_QUESTIONS` | 4 | 单次调用最大问题数 |
| `ASK_MAX_OPTIONS` | 4 | 每个问题最大选项数 |
| `ASK_HEADER_MAX_LENGTH` | 12 | header 最大字符数 |
| `ASK_QUESTION_MAX_LENGTH` | 500 | question 最大字符数 |
