tools - Search and manage installed MCP and Skill tools

USAGE
  tools search [pattern] [options]   Search for tools by pattern
  tools list                         List all installed tools
  tools help                         Show this help message

OPTIONS
  --type=mcp     Only search MCP tools (mcp:* commands)
  --type=skill   Only search Skill tools (skill:* commands)

EXAMPLES
  tools search git          Search for tools containing "git"
  tools search "mcp:*"      List all MCP tools (pattern match)
  tools search --type=mcp   List all MCP tools (type filter)
  tools search --type=skill List all Skill tools
  tools list                List all installed tools

PATTERN SYNTAX
  *     Match any characters
  ?     Match a single character

TOOL TYPES
  mcp:*    MCP server tools (e.g., mcp:git-tools:commit)
  skill:*  Skill script tools (e.g., skill:pdf-editor:extract_text)

TOOL LOCATIONS
  Installed tools: ~/.synapse/bin/
  Skills source:   ~/.synapse/skills/