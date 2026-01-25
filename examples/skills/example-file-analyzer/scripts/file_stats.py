#!/usr/bin/env python3
"""
file_stats - Get file statistics

Description:
    Analyze a file and return statistics including line count,
    word count, character count, and file size.

Parameters:
    file_path (str): Path to the file to analyze
    --format (str): Output format (text|json) (default: text)

Returns:
    str: File statistics in the specified format

Examples:
    skill:example-file-analyzer:file_stats /path/to/file.txt
    skill:example-file-analyzer:file_stats /path/to/file.txt --format=json
"""

import argparse
import os
import sys
import json


def get_file_stats(file_path: str) -> dict:
    """Get statistics for a file."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    if not os.path.isfile(file_path):
        raise ValueError(f"Not a file: {file_path}")

    stats = {
        "file_path": os.path.abspath(file_path),
        "file_name": os.path.basename(file_path),
        "file_size_bytes": os.path.getsize(file_path),
        "lines": 0,
        "words": 0,
        "characters": 0,
        "non_empty_lines": 0,
    }

    try:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                stats["lines"] += 1
                stats["characters"] += len(line)
                stats["words"] += len(line.split())
                if line.strip():
                    stats["non_empty_lines"] += 1
    except Exception as e:
        raise RuntimeError(f"Error reading file: {e}")

    # Format file size
    size = stats["file_size_bytes"]
    if size < 1024:
        stats["file_size"] = f"{size} B"
    elif size < 1024 * 1024:
        stats["file_size"] = f"{size / 1024:.2f} KB"
    else:
        stats["file_size"] = f"{size / (1024 * 1024):.2f} MB"

    return stats


def format_text(stats: dict) -> str:
    """Format stats as text output."""
    lines = [
        f"File: {stats['file_name']}",
        f"Path: {stats['file_path']}",
        f"Size: {stats['file_size']} ({stats['file_size_bytes']} bytes)",
        f"Lines: {stats['lines']} (non-empty: {stats['non_empty_lines']})",
        f"Words: {stats['words']}",
        f"Characters: {stats['characters']}",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Get file statistics",
        prog="skill:example-file-analyzer:file_stats"
    )
    parser.add_argument("file_path", help="Path to the file to analyze")
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)"
    )

    args = parser.parse_args()

    try:
        stats = get_file_stats(args.file_path)

        if args.format == "json":
            print(json.dumps(stats, indent=2))
        else:
            print(format_text(stats))

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
