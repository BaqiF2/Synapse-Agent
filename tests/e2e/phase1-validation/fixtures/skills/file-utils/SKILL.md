# File Utilities

**Domain**: programming
**Description**: Utility tools for file operations including counting, listing, and organizing files
**Tags**: file, utility, directory, organization, count
**Version**: 2.0.0

## Usage Scenarios
When you need to perform batch file operations or gather file statistics.

## Tool Dependencies
- find (Native Shell Command)
- bash (Native Shell Command)

## Execution Steps
1. Use find to locate matching files
2. Process files as needed
3. Return results summary

## Available Scripts

### count_files.sh
Counts files in a directory grouped by their extension.

**Usage**: `skill:file-utils:count_files <directory>`

**Parameters**:
- `directory` (required): Directory path to scan

### list_large.sh
Lists files larger than a specified size.

**Usage**: `skill:file-utils:list_large <directory> [min_size_kb]`

**Parameters**:
- `directory` (required): Directory path to scan
- `min_size_kb` (optional): Minimum file size in KB (default: 100)

## Examples

```bash
# Count files by extension
skill:file-utils:count_files /path/to/project

# List large files (>100KB)
skill:file-utils:list_large /path/to/project

# List files larger than 500KB
skill:file-utils:list_large /path/to/project 500
```
