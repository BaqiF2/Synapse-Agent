# Text Analyzer

**Domain**: programming
**Description**: Analyzes text files and provides statistics like word count, line count, and character frequency
**Tags**: text, analysis, statistics, file
**Version**: 1.0.0

## Usage Scenarios
When you need to analyze text files for statistics or patterns.

## Tool Dependencies
- read (Agent Shell Command)

## Execution Steps
1. Read the target file using read command
2. Count lines, words, and characters
3. Identify most frequent characters
4. Return analysis summary

## Available Scripts

### analyze.py
Analyzes a text file and returns comprehensive statistics.

**Usage**: `skill:text-analyzer:analyze <file_path>`

**Parameters**:
- `file_path` (required): Path to the text file to analyze

**Output**:
- Line count
- Word count
- Character count
- Top 5 most frequent characters

## Examples

```bash
# Analyze a text file
skill:text-analyzer:analyze /path/to/document.txt

# Analyze a code file
skill:text-analyzer:analyze /path/to/source.py
```
