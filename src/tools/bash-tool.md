Execute bash commands in a persistent shell session.

**CAPABILITIES:**
1. **Agent Commands** (Zone A): `read`, `write`, `edit`, `glob`, `search`, `skill:*`
2. **Simple Native** (Zone A): `ls`, `pwd`, `cd`, `mkdir`, `echo`, etc.
3. **Complex Native** (Zone B): `git`, `docker`, `curl`, `npm`, etc. — run `--help` first
4. **Extensions** (Zone B): `mcp:*:*`, `skill:*:*` — run `--help` first

**RULES:**
- **Zone A**: Execute directly (syntax documented in system prompt)
- **Zone B**: Run `<command> --help` before first use
- **On Error**: Follow the `--help` hint in the error message
- **Persistent Session**: Environment variables and CWD maintained
- **Non-Interactive Only**: No `vim`, `nano`, `top`, interactive `python`
