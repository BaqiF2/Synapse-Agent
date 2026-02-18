#!/usr/bin/env python3
"""
Architecture Validator - Validates project structure against architecture rules.

Checks:
- Required directories exist
- Dependency rules are not violated (basic import analysis)
- Test structure mirrors source structure
- Required configuration files exist

Usage:
    validate_architecture.py <project-root> --config <architecture-config.json>
    validate_architecture.py <project-root>  (uses default rules)
"""

import json
import os
import re
import sys
from pathlib import Path


def load_config(config_path):
    """Load architecture configuration from JSON file."""
    if config_path and os.path.exists(config_path):
        with open(config_path, 'r') as f:
            return json.load(f)
    return get_default_config()


def get_default_config():
    """Return default architecture validation rules."""
    return {
        "required_dirs": [
            "docs/adr",
            "tests/unit",
            "tests/integration"
        ],
        "required_files": [],
        "dependency_rules": [],
        "naming_conventions": {}
    }


def check_required_dirs(project_root, required_dirs):
    """Check that all required directories exist."""
    issues = []
    for d in required_dirs:
        full_path = os.path.join(project_root, d)
        if not os.path.isdir(full_path):
            issues.append(f"Missing required directory: {d}")
    return issues


def check_required_files(project_root, required_files):
    """Check that all required files exist."""
    issues = []
    for f in required_files:
        full_path = os.path.join(project_root, f)
        if not os.path.isfile(full_path):
            issues.append(f"Missing required file: {f}")
    return issues


def check_test_mirror(project_root, src_dir, test_dir):
    """Check that test directory mirrors source directory structure."""
    issues = []
    src_path = os.path.join(project_root, src_dir)
    test_path = os.path.join(project_root, test_dir)

    if not os.path.isdir(src_path):
        return [f"Source directory not found: {src_dir}"]
    if not os.path.isdir(test_path):
        return [f"Test directory not found: {test_dir}"]

    # Find all module directories in source
    for item in os.listdir(src_path):
        item_path = os.path.join(src_path, item)
        if os.path.isdir(item_path) and not item.startswith('.') and not item.startswith('__'):
            test_counterpart = os.path.join(test_path, item)
            if not os.path.isdir(test_counterpart):
                issues.append(
                    f"Source module '{src_dir}/{item}' has no test counterpart at '{test_dir}/{item}'"
                )

    return issues


def check_circular_deps_basic(project_root, modules_dir):
    """Basic circular dependency check by analyzing import statements."""
    issues = []
    modules_path = os.path.join(project_root, modules_dir)

    if not os.path.isdir(modules_path):
        return []

    # Build a simple dependency graph
    deps = {}
    for module_name in os.listdir(modules_path):
        module_path = os.path.join(modules_path, module_name)
        if not os.path.isdir(module_path) or module_name.startswith('.'):
            continue
        deps[module_name] = set()

        for root, _dirs, files in os.walk(module_path):
            for fname in files:
                if not fname.endswith(('.py', '.ts', '.js', '.java', '.kt', '.go')):
                    continue
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                except (IOError, OSError):
                    continue

                for other_module in os.listdir(modules_path):
                    if other_module == module_name or other_module.startswith('.'):
                        continue
                    # Simple heuristic: check if module name appears in imports
                    patterns = [
                        rf'from\s+["\']?.*{re.escape(other_module)}',
                        rf'import\s+.*{re.escape(other_module)}',
                        rf'require\s*\(.*{re.escape(other_module)}',
                    ]
                    for pattern in patterns:
                        if re.search(pattern, content):
                            deps[module_name].add(other_module)
                            break

    # Detect cycles
    visited = set()
    rec_stack = set()

    def has_cycle(node, path):
        visited.add(node)
        rec_stack.add(node)
        for neighbor in deps.get(node, set()):
            if neighbor not in visited:
                cycle = has_cycle(neighbor, path + [node])
                if cycle:
                    return cycle
            elif neighbor in rec_stack:
                cycle_path = path + [node, neighbor]
                start = cycle_path.index(neighbor)
                return cycle_path[start:]
        rec_stack.discard(node)
        return None

    for module in deps:
        if module not in visited:
            cycle = has_cycle(module, [])
            if cycle:
                issues.append(
                    f"Circular dependency detected: {' -> '.join(cycle)}"
                )

    return issues


def validate(project_root, config):
    """Run all validation checks and return issues."""
    all_issues = []

    print(f"Validating project architecture at: {project_root}")
    print("=" * 60)

    # Check required directories
    dir_issues = check_required_dirs(project_root, config.get("required_dirs", []))
    if dir_issues:
        all_issues.extend(dir_issues)
        for issue in dir_issues:
            print(f"  [FAIL] {issue}")
    else:
        print(f"  [PASS] All required directories exist ({len(config.get('required_dirs', []))} checked)")

    # Check required files
    file_issues = check_required_files(project_root, config.get("required_files", []))
    if file_issues:
        all_issues.extend(file_issues)
        for issue in file_issues:
            print(f"  [FAIL] {issue}")
    else:
        print(f"  [PASS] All required files exist ({len(config.get('required_files', []))} checked)")

    # Check test mirror (if configured)
    mirror_config = config.get("test_mirror", {})
    if mirror_config:
        mirror_issues = check_test_mirror(
            project_root,
            mirror_config.get("src_dir", "src/modules"),
            mirror_config.get("test_dir", "tests/unit/modules")
        )
        if mirror_issues:
            all_issues.extend(mirror_issues)
            for issue in mirror_issues:
                print(f"  [WARN] {issue}")
        else:
            print("  [PASS] Test directory mirrors source structure")

    # Check circular dependencies (if modules dir configured)
    modules_dir = config.get("modules_dir")
    if modules_dir:
        cycle_issues = check_circular_deps_basic(project_root, modules_dir)
        if cycle_issues:
            all_issues.extend(cycle_issues)
            for issue in cycle_issues:
                print(f"  [FAIL] {issue}")
        else:
            print("  [PASS] No circular dependencies detected")

    print("=" * 60)
    if all_issues:
        print(f"Found {len(all_issues)} issue(s)")
    else:
        print("All checks passed")

    return all_issues


def main():
    if len(sys.argv) < 2:
        print("Usage: validate_architecture.py <project-root> [--config <config.json>]")
        sys.exit(1)

    project_root = sys.argv[1]
    config_path = None

    if '--config' in sys.argv:
        idx = sys.argv.index('--config')
        if idx + 1 < len(sys.argv):
            config_path = sys.argv[idx + 1]

    if not os.path.isdir(project_root):
        print(f"Error: project root not found: {project_root}")
        sys.exit(1)

    config = load_config(config_path)
    issues = validate(project_root, config)

    sys.exit(1 if issues else 0)


if __name__ == "__main__":
    main()
