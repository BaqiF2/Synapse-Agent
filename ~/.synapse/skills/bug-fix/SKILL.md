<< 'EOF'
---
name: bug-fix
description: Comprehensive bug fixing and debugging workflow for systematic error resolution. Use when Claude needs to: (1) Identify and analyze bugs in code, (2) Implement fixes following debugging best practices, (3) Verify solutions through testing, (4) Document changes and prevent regressions, or any other debugging and error resolution tasks.
---

# Bug Fix Workflow

## Quick Start

When encountering a bug, follow this systematic approach:

1. **Reproduce** the issue consistently
2. **Isolate** the root cause
3. **Fix** with minimal impact
4. **Verify** the solution
5. **Document** the change

## Detailed Workflow

### Step 1: Issue Analysis

Start by understanding the bug:

- **Symptoms**: What exactly is broken?
- **Environment**: What conditions trigger the issue?
- **Expected vs Actual**: What should happen vs what actually happens?
- **Scope**: How widespread is the problem?

### Step 2: Reproduction

Create a minimal test case:

```bash
# Isolate the problem
# Create smallest possible reproduction
# Document steps to reproduce
```

### Step 3: Investigation

Find the root cause:

- **Logging**: Add strategic debug output
- **Debugging tools**: Use appropriate debugging utilities
- **Code inspection**: Review relevant code sections
- **Stack traces**: Analyze error messages and call stacks

### Step 4: Solution Design

Plan the fix:

- **Root cause**: What needs to change?
- **Impact assessment**: What will be affected?
- **Risk evaluation**: Could this break other functionality?
- **Test strategy**: How will you verify the fix?

### Step 5: Implementation

Apply the fix:

- **Minimal changes**: Fix only what's necessary
- **Code quality**: Maintain standards and conventions
- **Documentation**: Update comments and docs
- **Version control**: Commit with clear messages

### Step 6: Verification

Test thoroughly:

- **Original bug**: Confirm it's fixed
- **Edge cases**: Test boundary conditions
- **Regression**: Ensure no new issues introduced
- **Performance**: Check for degradation

### Step 7: Documentation

Record the change:

- **What was fixed**: Clear description
- **Why it happened**: Root cause explanation
- **How it was fixed**: Solution approach
- **Prevention**: How to avoid similar issues

## Common Bug Patterns

### Logic Errors
- **Symptoms**: Incorrect calculations or decisions
- **Debug approach**: Trace data flow, verify conditions
- **Fix strategy**: Correct logic, add validation

### Null/Undefined References
- **Symptoms**: Crashes or null pointer errors
- **Debug approach**: Check initialization and state
- **Fix strategy**: Add null checks, improve validation

### Concurrency Issues
- **Symptoms**: Race conditions, deadlocks
- **Debug approach**: Analyze timing and shared state
- **Fix strategy**: Synchronization, atomic operations

### Performance Issues
- **Symptoms**: Slow operations, timeouts
- **Debug approach**: Profile and measure
- **Fix strategy**: Optimize algorithms, cache results

### Configuration Errors
- **Symptoms**: Unexpected behavior with correct code
- **Debug approach**: Verify settings and environment
- **Fix strategy**: Correct configuration, add validation

## Testing Strategies

### Unit Testing
Test individual components:
```python
def test_buggy_function():
    # Arrange
    input_data = get_test_data()
    expected = get_expected_result()
    
    # Act
    result = buggy_function(input_data)
    
    # Assert
    assert result == expected
```

### Integration Testing
Test component interactions:
```python
def test_bug_fix_integration():
    # Test the fix in realistic scenarios
    pass
```

### Regression Testing
Ensure no new issues:
```python
def test_no_regressions():
    # Verify existing functionality still works
    pass
```

## Debugging Tools

### Logging
Strategic log placement:
```python
import logging

logger = logging.getLogger(__name__)

def buggy_function(data):
    logger.debug(f"Input data: {data}")
    # ... processing ...
    logger.debug(f"Result: {result}")
    return result
```

### Debuggers
Use appropriate debugging tools:
- **Python**: pdb, ipdb
- **JavaScript**: Chrome DevTools
- **Java**: JDB, IntelliJ debugger
- **General**: Print statements, logging

### Profilers
For performance issues:
- **Time profiling**: Measure execution time
- **Memory profiling**: Check memory usage
- **CPU profiling**: Identify bottlenecks

## Best Practices

### Prevention
- **Code reviews**: Catch issues early
- **Testing**: Comprehensive test coverage
- **Static analysis**: Use linting and type checking
- **Documentation**: Keep code and APIs clear

### Process
- **Version control**: Track all changes
- **Branching**: Isolated fix development
- **CI/CD**: Automated testing
- **Monitoring**: Production error tracking

### Communication
- **Clear descriptions**: Explain bugs precisely
- **Minimal examples**: Provide reproduction cases
- **Root cause analysis**: Understand why, not just what
- **Knowledge sharing**: Document lessons learned

## Code Review Checklist

When reviewing bug fixes:

- [ ] Fix addresses root cause, not just symptoms
- [ ] Changes are minimal and focused
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No new issues introduced
- [ ] Code follows standards
- [ ] Error handling is appropriate
EOF