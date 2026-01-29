skill search - Search for skills in the skill library

USAGE:
    skill search [query] [OPTIONS]

ARGUMENTS:
    [query]        Search query (matches name, description, tags, tools)

OPTIONS:
    --max <n>      Maximum number of results (default: ${DEFAULT_MAX_RESULTS})
    -h             Show brief help
    --help         Show detailed help

SEARCH BEHAVIOR:
    - Query matches skill name, title, description, tags, and tools
    - Results are ranked by relevance score

OUTPUT FORMAT:
    1. skill-name (domain)
       Description text
       Tags: tag1, tag2
       Scripts: N

EXAMPLES:
    skill search pdf              Search for skills related to PDF
    skill search git              Search for git skills
    skill search --max 5          List first 5 skills

SKILL LOCATIONS:
    Skills directory: ~/.synapse/skills/
    Index file: ~/.synapse/skills/index.json