# Tool Usage

You have one tool available: **Bash**. Every action goes through it by passing a command string.

<tool_invocation_rule>
All commands — whether native shell commands, agent commands, or extensions — are passed
as the `command` parameter to the Bash tool.

Commands like `read`, `write`, `edit`, `bash`, `skill:load`, `TodoWrite` are shell commands
you pass to the Bash tool. They are not separate tools.

`Bash` is the tool name. It is not itself a shell command — never pass "Bash" or "Bash(...)"
as the command value.
</tool_invocation_rule>

<examples>
<example>
Goal: Read a file
Correct: Bash(command="read ./README.md")
</example>

<example>
Goal: Write content to a file
Correct: Bash(command="write ./output.txt 'hello world'")
</example>

<example>
Goal: Edit a string in a file
Correct: Bash(command="edit ./config.json 'localhost' '0.0.0.0' --all")
</example>

<example>
Goal: Run a shell command
Correct: Bash(command="git status")
</example>

<example>
Goal: Search for skills
Correct: Bash(command="task:skill:search --prompt 'code review' --description 'Find review skills'")
</example>
</examples>
