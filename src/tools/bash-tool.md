Execute bash commands in a persistent shell session.

**CAPABILITIES:**
1. **Native Shell**: Standard Unix commands (ls, cd, pwd, grep, find, git, curl, jq, etc.).
2. **Agent Built-ins**:
    - \`read <path>\`: Read file content.
    - \`write <path> <content>\`: Create/Overwrite file.
    - \`edit <path> <pattern> <replacement>\`: String replacement.
    - \`glob <pattern>\`: List files.
    - \`search <query>\`: Semantic search.
3. **Extended Commands**: Domain-specific tools (e.g., \`mcp:*\`, \`skill:*\`).

**CRITICAL RULES:**
- **Persistent Session**: Environment variables and CWD are maintained across calls.
- **Non-Interactive Only**: FORBIDDEN: \`vim\`, \`nano\`, \`top\`, interactive \`python\`. Use \`sed\` or \`python -c\` instead.
- **Output Safety**: Do NOT \`cat\` massive files. Use \`head\`, \`tail\`, or \`grep\`.
- **Error Handling**: If exit code != 0, read stderr and fix the issue.