bash - Execute system commands explicitly

USAGE:
    bash <command>

ARGUMENTS:
    <command>      The bash command to execute

DESCRIPTION:
    This is an explicit wrapper for executing system commands in the
    persistent Bash session. Use this when you want to clearly indicate
    that a system command should be executed, rather than relying on
    automatic command routing.

    The command is executed in the same persistent session as other
    commands, so environment variables and working directory are preserved.

OPTIONS:
    -h             Show brief help
    --help         Show detailed help

EXAMPLES:
    bash ls -la                    List files in detail
    bash pwd                       Print working directory
    bash echo $PATH                Print PATH environment variable
    bash npm install               Install npm packages
    bash git status                Show git status
    bash export FOO=bar            Set environment variable
    bash cd /tmp && ls             Change directory and list