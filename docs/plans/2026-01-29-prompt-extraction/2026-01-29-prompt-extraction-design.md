# Prompt Extraction Design

## Overview

将代码中硬编码的提示词抽取为独立的 `.md` 文件，实现代码与提示词分离。

## Design Decisions

- **文件放置**: 就近放置，.md 文件紧邻对应的 .ts 代码文件
- **加载机制**: `loadDesc(path, substitutions?)` 工具函数，同步读取 + 模板变量替换
- **模板语法**: `${VAR_NAME}` 风格
- **抽取范围**: 全部（系统提示词 + 子代理提示词 + 工具定义 + handler 帮助文本）

## File Structure

```
src/
├── utils/
│   └── load-desc.ts                      # loadDesc 工具函数
│
├── agent/
│   ├── prompts/
│   │   ├── base-role.md                  # 角色定义 + 统一架构说明
│   │   ├── native-shell-command.md       # Layer 1: 原生 Shell 命令
│   │   ├── agent-shell-command.md        # Layer 2: Agent Shell 命令
│   │   ├── extend-shell-command.md       # Layer 3: 扩展命令
│   │   ├── skill-system.md              # 技能系统（静态部分）
│   │   ├── execution-principles.md       # 执行原则
│   │   ├── auto-enhance.md              # 自动增强提示词
│   │   └── minimal-system.md            # 最小系统提示词
│   ├── skill-sub-agent-prompts/
│   │   ├── base-role.md                  # 子代理角色定义
│   │   ├── tool-section.md              # 子代理可用工具
│   │   ├── skill-search-instructions.md  # 技能搜索指令（deprecated）
│   │   └── skill-enhance-instructions.md # 技能增强指令（deprecated）
│   ├── system-prompt.ts                  # 简化为组装逻辑
│   └── skill-sub-agent-prompt.ts         # 简化为组装逻辑
│
├── tools/
│   ├── bash-tool.md                      # Bash 工具 description
│   ├── bash-tool-schema.ts
│   └── handlers/
│       ├── agent-bash/
│       │   ├── read.md                   # read 帮助文本
│       │   ├── write.md                  # write 帮助文本
│       │   ├── edit.md                   # edit 帮助文本
│       │   ├── glob.md                   # glob 帮助文本
│       │   ├── grep.md                   # search 帮助文本
│       │   ├── bash-wrapper.md           # bash 帮助文本
│       │   └── skill-search.md           # skill search 帮助文本
│       └── field-bash/
│           └── command-search.md           # tools 帮助文本
```

## loadDesc Implementation

```typescript
export function loadDesc(
  mdPath: string,
  substitutions?: Record<string, string>
): string {
  let content = fs.readFileSync(mdPath, 'utf-8');
  if (substitutions) {
    for (const [key, value] of Object.entries(substitutions)) {
      content = content.replaceAll(`\${${key}}`, value);
    }
  }
  return content;
}
```

## Migration Pattern

- 静态文本 → 完全抽到 .md 文件
- 动态文本（如 availableSkills 列表）→ 静态部分抽到 .md，动态部分保留在代码中拼接
- 函数签名和接口保持不变，外部调用方无需修改
