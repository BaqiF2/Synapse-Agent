# BDD Acceptance Document Template

## File Naming Convention
- Consistent with PRD name: `docs/requirements/YYYY-MM-DD-<topic>-bdd/`
- One JSON file per feature: `<feature-name>.json`

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "Test category, e.g. functional, performance, security"
      },
      "feature": {
        "type": "string",
        "description": "Feature module name"
      },
      "description": {
        "type": "string",
        "description": "Feature module description"
      },
      "overallPass": {
        "type": "boolean",
        "description": "Whether all tests in this feature pass"
      },
      "bdd": {
        "type": "array",
        "description": "List of BDD scenarios",
        "items": {
          "type": "object",
          "properties": {
            "scenario": {
              "type": "string",
              "description": "Scenario name"
            },
            "description": {
              "type": "string",
              "description": "Scenario description"
            },
            "steps": {
              "type": "object",
              "description": "Given-When-Then step structure",
              "properties": {
                "given": {
                  "type": "array",
                  "items": { "type": "string" }
                },
                "when": {
                  "type": "array",
                  "items": { "type": "string" }
                },
                "then": {
                  "type": "array",
                  "items": { "type": "string" }
                }
              },
              "required": ["given", "when", "then"],
              "additionalProperties": false
            },
            "passes": {
              "type": "boolean",
              "description": "Whether this scenario passes"
            }
          },
          "required": ["scenario", "description", "steps", "passes"],
          "additionalProperties": false
        }
      }
    },
    "required": ["category", "feature", "description", "overallPass", "bdd"],
    "additionalProperties": false
  }
}
```

## BDD Writing Principles

### Given (Preconditions)
- Describe the initial state of the system
- Include all necessary context information
- Each condition should be independent and unambiguous

### When (Actions)
- Describe the specific action that triggers the behavior
- A scenario typically has only one core When action
- Actions should be concrete and executable

### Then (Verification)
- Describe the expected system behavior and output
- Must be verifiable and measurable
- Cover both primary results and side effects

### Scenario Design Requirements
- Each scenario tests one independent behavioral point
- Scenarios have no dependencies on each other
- Coverage: normal flows, error flows, boundary conditions
- Map 1:1 with functional requirements in the PRD
- Use business language, not technical language

### Category Classification
- `functional`: Functional tests
- `performance`: Performance tests
- `security`: Security tests
- `usability`: Usability tests
- `compatibility`: Compatibility tests
- `reliability`: Reliability tests
