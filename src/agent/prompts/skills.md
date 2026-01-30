# Skills

Skills are reusable workflows and knowledge that extend your capabilities.

## Skill Commands

Use `skill:search --help` to see detailed usage and options.

| Command | Description |
|---------|-------------|
| `skill:search` | Search for skills by keyword |
| `skill:load` | Load a skill's content into context |
| `skill:enhance` | Analyze conversation and create/improve skills |

## How to Find Skills

```bash
skill:search <keyword>        # Search by keyword
skill:search --help           # See detailed options
```

## How to Use Skills

1. Search for relevant skills using `skill:search <keyword>`
2. Load the skill using `skill:load <skill-name>`
3. The `SKILL.md` content will be loaded into context - read it for detailed instructions, guidance, and scripts
4. Follow the skill's workflow

Example:
```bash
skill:search "code analysis"
skill:load code-analyzer
# SKILL.md is now in context, follow its instructions
```

## How to Enhance Skills

After completing complex multi-step operations, use `skill:enhance` to analyze the conversation and create or iteratively improve reusable skills.

```bash
skill:enhance                              # Analyze current conversation
skill:enhance --reason "File processing"   # With context
```
