# BDD Testability Checklist

Run this checklist on each design point before converting PRD to features.json.

## 6-Dimension Validation

| Dimension | Validation Question |
|-----------|---------------------|
| **Input/Output Format** | Are the exact formats of inputs and outputs specified? (data types, structure, encoding) |
| **Error/Exception Scenarios** | Does each failure mode have a clearly defined expected behavior? (not just happy path) |
| **Boundary/Priority Rules** | Are resolution rules defined when ambiguity or conflicts exist? (priority, fallback, defaults) |
| **State Behavior** | Is it clear what state persists, what is isolated, and what resets? (session, variables, side effects) |
| **Verifiable Granularity** | Can each behavior be tested independently with specific steps and a single expected result? |
| **Ambiguity Check** | Are there implicit assumptions that different readers might interpret differently? |

## Usage

1. For each PRD section, evaluate all 6 dimensions
2. Any dimension that fails → Ask user to fill in the gaps
3. **No silent assumptions** — If PRD will be consumed downstream (e.g., converted to BDD test cases), ambiguity is a defect
4. Only proceed after all design points pass all 6 dimensions
5. Mark as "N/A" only when truly not applicable (e.g., stateless operations have no state behavior)

## Handling Failures

When a dimension fails, there are two options:

1. **Ask the user** — Pose targeted questions to get clear definitions
2. **Use default assumptions** — If user chooses this, must explicitly mark in `expected` field:

```json
{
  "expected": "Returns error message (Default assumption: does not block startup, only outputs warning log)"
}
```

## Common Incomplete Scenarios

- Routing/Dispatch: Priority rules not defined
- Error Handling: Behavior after failure not defined
- Parameter Parsing: Special character/whitespace handling not defined
- State Management: Persistence rules across operations not defined
- Timeout Mechanism: Timeout duration and post-timeout behavior not defined
- Conflict Resolution: Handling rules for duplicate names not defined
