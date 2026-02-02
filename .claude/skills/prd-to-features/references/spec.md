# features.json Specification

## File Structure

```json
[
  {
    "category": "functional",
    "prd": "prd-file.md#section",
    "description": "Feature description",
    "bdd": [
      {
        "title": "BDD test title",
        "description": "Test description",
        "steps": ["Step 1", "Step 2", "Step 3"],
        "expected": "Expected result"
      }
    ],
    "passes": false
  }
]
```

## Priority Rules

**Array order represents priority**: From top to bottom, priority goes from high to low.

Ordering criteria (from high to low):
1. **Core Infrastructure** — Base components that other features depend on
2. **Core Routing/Dispatch** — Core logic that determines system behavior
3. **Basic Capability Implementation** — Concrete functionality implementation layer
4. **Tools/Converters** — Supporting toolchain
5. **Discovery/Integration Mechanisms** — Extensibility-related features
6. **User Interface/Experience** — User-facing interaction features

## Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| category | string | Yes | Category, e.g., "functional", "non-functional" |
| prd | string | Yes | PRD document link, format: `filename.md#section-anchor` |
| description | string | Yes | Brief description of the feature |
| bdd | array | Yes | Array of BDD test cases |
| passes | boolean | Yes | Whether tests pass, initially false |

### BDD Test Case Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Test case title |
| description | string | Yes | Test case description |
| steps | array | Yes | Array of test steps |
| expected | string | Yes | Expected result |

## File Splitting Rules

**Single file line limit: 1000 lines**

When features.json exceeds 1000 lines, split according to these rules:

1. **Split continuously by priority**: Maintain order, do not shuffle
2. **Each file is independently complete**: Each JSON file is a valid array
3. **Naming format**: `features-01.json`, `features-02.json` (two-digit zero-padded)
4. **Split at feature module boundaries when possible**: Avoid splitting features from the same PRD section into different files
