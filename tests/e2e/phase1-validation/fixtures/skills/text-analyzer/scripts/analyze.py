#!/usr/bin/env python3
"""
analyze - Analyze text file statistics

Description:
    Analyzes a text file and returns statistics including line count,
    word count, character count, and character frequency analysis.

Parameters:
    file_path (str): Path to the text file to analyze

Returns:
    Analysis summary with statistics

Examples:
    python analyze.py /path/to/file.txt
    python analyze.py README.md
"""
import sys
import os
from collections import Counter

def print_help():
    """Print help information."""
    print("""
analyze - Analyze text file statistics

USAGE:
    analyze.py <file_path>
    analyze.py -h | --help

PARAMETERS:
    file_path    Path to the text file to analyze

OPTIONS:
    -h, --help   Show this help message

EXAMPLES:
    analyze.py /path/to/document.txt
    analyze.py README.md
""")

def analyze_file(file_path):
    """Analyze a text file and print statistics."""
    if not os.path.exists(file_path):
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(file_path):
        print(f"Error: Not a file: {file_path}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        print(f"Error: Unable to read file as text: {file_path}", file=sys.stderr)
        sys.exit(1)

    lines = content.split('\n')
    words = content.split()
    chars = [c for c in content if c.isalpha()]

    print("=" * 40)
    print("       TEXT ANALYSIS REPORT")
    print("=" * 40)
    print(f"File: {file_path}")
    print("-" * 40)
    print(f"Lines:      {len(lines):,}")
    print(f"Words:      {len(words):,}")
    print(f"Characters: {len(content):,}")
    print(f"Letters:    {len(chars):,}")
    print("-" * 40)

    if chars:
        freq = Counter(c.lower() for c in chars).most_common(5)
        print("Top 5 letters:")
        for char, count in freq:
            pct = (count / len(chars)) * 100
            print(f"  '{char}': {count:,} ({pct:.1f}%)")

    print("=" * 40)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Error: Missing file path argument", file=sys.stderr)
        print("Usage: analyze.py <file_path>", file=sys.stderr)
        sys.exit(1)

    arg = sys.argv[1]

    if arg in ('-h', '--help'):
        print_help()
        sys.exit(0)

    analyze_file(arg)
