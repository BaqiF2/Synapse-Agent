# File Analyzer

**Domain**: programming
**Version**: 1.0.0
**Description**: Analyze file content and provide statistics
**Tags**: file, analysis, statistics, code

## Usage Scenarios

Use this skill when you need to:
- Get statistics about files (line count, word count, character count)
- Analyze code files for complexity metrics
- Compare file sizes and content

## Tool Dependencies

- Standard Unix commands (wc, du)

## Execution Steps

1. Use `skill:example-file-analyzer:file_stats` to get basic file statistics
2. Use `skill:example-file-analyzer:code_analysis` for code-specific metrics
3. Interpret the results and provide insights

## Tools

- `skill:example-file-analyzer:file_stats` - Get file statistics (lines, words, chars)
- `skill:example-file-analyzer:code_analysis` - Analyze code file metrics

## Examples

```bash
# Get file statistics
skill:example-file-analyzer:file_stats /path/to/file.txt

# Analyze a code file
skill:example-file-analyzer:code_analysis /path/to/main.py --type python
```
