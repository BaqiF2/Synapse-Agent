## 3. extend Shell command (Domain Tools)

Domain-specific tools for MCP servers and Skills.

**REMINDER: These are bash commands, NOT tools. Always call them through the Bash tool:**
```
Tool: Bash
Input: { "command": "mcp:server:tool arg1 arg2" }
```

### MCP Tools
Format: `mcp:<server>:<tool> [args...]`
- Example: `mcp:test-server:add 1 2`
- Use `mcp:<server>:<tool> -h` to see tool usage

### Skill Tools
Format: `skill:<skill>:<tool> [args...]`
- Example: `skill:example-skill:process_text "hello"`
- Use `skill:<skill>:<tool> -h` to see tool usage

**IMPORTANT**: Always use `tools search` first to discover available tools before calling them.