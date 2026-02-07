Execute bash commands in a persistent shell session.

**THREE COMMAND LAYERS:**

1. **Native Shell Commands**
   - Simple (use directly): `ls`, `pwd`, `cd`, `mkdir`, `echo`, etc.
   - Complex (run `--help` first): `git`, `docker`, `curl`, `npm`, etc.

2. **Agent Shell Commands** (syntax in system prompt, use directly):
   `read`, `write`, `edit`, `bash`, `skill:load`, `command:search`, `task:*`

3. **Extension Commands** (run `--help` first):
   `mcp:*:*`, `skill:*:*`

**RULES:**
- Layer 1 simple + Layer 2: Execute directly
- Layer 1 complex + Layer 3: Run `<command> --help` before first use
- On Error: Follow the `--help` hint in the error message
- Persistent Session: Environment variables and CWD maintained
- Non-Interactive Only: No `vim`, `nano`, `top`, interactive `python`
