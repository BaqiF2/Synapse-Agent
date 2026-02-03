# Conversation Analysis Patterns

Reference guide for analyzing conversation history to identify enhancement opportunities.

## Pattern Recognition

### Reusable Workflow Patterns

Look for sequences that appear multiple times or could be generalized:

```
Signal: User asks similar questions multiple times
Action: Add an example or workflow branch for this pattern

Signal: Assistant performs the same multi-step process repeatedly
Action: Document the workflow in a more structured way

Signal: Assistant improvises steps not in the skill
Action: Consider adding those steps to the skill
```

### Error Recovery Patterns

Look for situations where the skill didn't work as expected:

```
Signal: Assistant had to backtrack or retry
Action: Add clearer guidance or error handling

Signal: User had to clarify or correct the assistant
Action: Improve the relevant instructions

Signal: Tool calls failed and needed adjustment
Action: Update scripts or add troubleshooting guidance
```

### Missing Information Patterns

Look for gaps in the skill's coverage:

```
Signal: Assistant had to search for information not in the skill
Action: Add that information to the skill or references

Signal: User asked "how do I..." for something not covered
Action: Add the missing workflow

Signal: Assistant made assumptions that turned out wrong
Action: Make expectations explicit in the skill
```

## Analysis Process

### Step 1: Extract Key Events

From the conversation, identify:

1. **User intent** - What was the user trying to accomplish?
2. **Skill usage** - Was a skill invoked? Which one?
3. **Tool calls** - What tools were used?
4. **Outcomes** - Did the task succeed? Any issues?

### Step 2: Map to Skill Content

Compare conversation events to skill content:

| Conversation Event | Skill Content | Gap? |
|-------------------|---------------|------|
| User request | Skill triggers | Description match? |
| Workflow followed | Documented steps | Steps complete? |
| Tools used | Referenced scripts | Scripts work? |
| Final output | Expected format | Quality match? |

### Step 3: Prioritize Enhancements

Rank potential enhancements by impact:

1. **Critical**: Skill doesn't work without this fix
2. **High**: Significantly improves usability
3. **Medium**: Nice to have, reduces friction
4. **Low**: Minor polish, edge cases

## Example Analysis

**Conversation excerpt:**
```
User: Help me analyze this CSV file
Assistant: [reads skill, starts analysis]
Assistant: [realizes skill doesn't mention handling large files]
Assistant: [improvises chunked reading approach]
User: Great, but can you also generate a chart?
Assistant: [skill doesn't cover visualization]
Assistant: [improvises using matplotlib]
```

**Analysis:**
1. Large file handling not documented → **High priority** add chunked reading guidance
2. Visualization not covered → **Medium priority** consider if in scope
3. Both improvised solutions worked → Validate approaches are correct before adding

**Enhancement recommendation:**
- Add "Large file handling" section with chunked reading pattern
- Add note about visualization being out of scope, or create separate skill
