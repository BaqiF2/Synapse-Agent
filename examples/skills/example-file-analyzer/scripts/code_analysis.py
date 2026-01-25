#!/usr/bin/env python3
"""
code_analysis - Analyze code file metrics

Description:
    Analyze a code file and return metrics including function count,
    class count, import count, and comment ratio.

Parameters:
    file_path (str): Path to the code file to analyze
    --type (str): File type (python|javascript|typescript) (default: auto-detect)

Returns:
    str: Code analysis metrics

Examples:
    skill:example-file-analyzer:code_analysis /path/to/main.py
    skill:example-file-analyzer:code_analysis /path/to/app.ts --type=typescript
"""

import argparse
import os
import re
import sys


def detect_file_type(file_path: str) -> str:
    """Detect file type from extension."""
    ext = os.path.splitext(file_path)[1].lower()
    type_map = {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".jsx": "javascript",
    }
    return type_map.get(ext, "unknown")


def analyze_python(content: str) -> dict:
    """Analyze Python code."""
    lines = content.split("\n")

    metrics = {
        "language": "python",
        "total_lines": len(lines),
        "code_lines": 0,
        "comment_lines": 0,
        "blank_lines": 0,
        "functions": 0,
        "classes": 0,
        "imports": 0,
    }

    in_docstring = False
    docstring_char = None

    for line in lines:
        stripped = line.strip()

        if not stripped:
            metrics["blank_lines"] += 1
            continue

        # Check for docstrings
        if '"""' in stripped or "'''" in stripped:
            if not in_docstring:
                in_docstring = True
                docstring_char = '"""' if '"""' in stripped else "'''"
                if stripped.count(docstring_char) >= 2:
                    in_docstring = False
                metrics["comment_lines"] += 1
                continue
            else:
                if docstring_char in stripped:
                    in_docstring = False
                metrics["comment_lines"] += 1
                continue

        if in_docstring:
            metrics["comment_lines"] += 1
            continue

        # Check for comments
        if stripped.startswith("#"):
            metrics["comment_lines"] += 1
            continue

        metrics["code_lines"] += 1

        # Check for functions
        if re.match(r"^(async\s+)?def\s+\w+", stripped):
            metrics["functions"] += 1

        # Check for classes
        if re.match(r"^class\s+\w+", stripped):
            metrics["classes"] += 1

        # Check for imports
        if stripped.startswith("import ") or stripped.startswith("from "):
            metrics["imports"] += 1

    return metrics


def analyze_javascript(content: str) -> dict:
    """Analyze JavaScript/TypeScript code."""
    lines = content.split("\n")

    metrics = {
        "language": "javascript/typescript",
        "total_lines": len(lines),
        "code_lines": 0,
        "comment_lines": 0,
        "blank_lines": 0,
        "functions": 0,
        "classes": 0,
        "imports": 0,
    }

    in_multiline_comment = False

    for line in lines:
        stripped = line.strip()

        if not stripped:
            metrics["blank_lines"] += 1
            continue

        # Check for multiline comments
        if "/*" in stripped and "*/" not in stripped:
            in_multiline_comment = True
            metrics["comment_lines"] += 1
            continue

        if in_multiline_comment:
            metrics["comment_lines"] += 1
            if "*/" in stripped:
                in_multiline_comment = False
            continue

        # Check for single-line comments
        if stripped.startswith("//"):
            metrics["comment_lines"] += 1
            continue

        metrics["code_lines"] += 1

        # Check for functions
        if re.search(r"(function\s+\w+|const\s+\w+\s*=\s*(async\s+)?\(|=>\s*\{)", stripped):
            metrics["functions"] += 1

        # Check for classes
        if re.match(r"^(export\s+)?(abstract\s+)?class\s+\w+", stripped):
            metrics["classes"] += 1

        # Check for imports
        if stripped.startswith("import ") or stripped.startswith("export "):
            metrics["imports"] += 1

    return metrics


def format_metrics(metrics: dict) -> str:
    """Format metrics as text output."""
    comment_ratio = 0
    if metrics["total_lines"] > 0:
        comment_ratio = (metrics["comment_lines"] / metrics["total_lines"]) * 100

    lines = [
        f"Language: {metrics['language']}",
        f"Total lines: {metrics['total_lines']}",
        f"  Code lines: {metrics['code_lines']}",
        f"  Comment lines: {metrics['comment_lines']}",
        f"  Blank lines: {metrics['blank_lines']}",
        f"Comment ratio: {comment_ratio:.1f}%",
        f"Functions: {metrics['functions']}",
        f"Classes: {metrics['classes']}",
        f"Imports: {metrics['imports']}",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Analyze code file metrics",
        prog="skill:example-file-analyzer:code_analysis"
    )
    parser.add_argument("file_path", help="Path to the code file to analyze")
    parser.add_argument(
        "--type",
        choices=["python", "javascript", "typescript"],
        help="File type (default: auto-detect)"
    )

    args = parser.parse_args()

    if not os.path.exists(args.file_path):
        print(f"Error: File not found: {args.file_path}", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(args.file_path):
        print(f"Error: Not a file: {args.file_path}", file=sys.stderr)
        sys.exit(1)

    # Detect or use specified file type
    file_type = args.type or detect_file_type(args.file_path)

    if file_type == "unknown":
        print(f"Error: Cannot detect file type. Use --type to specify.", file=sys.stderr)
        sys.exit(1)

    try:
        with open(args.file_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()

        if file_type == "python":
            metrics = analyze_python(content)
        else:
            metrics = analyze_javascript(content)

        print(format_metrics(metrics))

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
