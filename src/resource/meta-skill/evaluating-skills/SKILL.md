---
name: evaluating-skills
description: Guide for evaluating and quality assessment of skills to determine their effectiveness and identify areas for improvement. This skill should be used when assessing skill quality, comparing skills, or deciding whether a skill needs enhancement or replacement.
---

# Evaluating Skills

This skill provides guidance for evaluating skill quality and effectiveness.

## When to Evaluate

Evaluate a skill when:

1. **Quality Check**: Before deploying a new or enhanced skill
2. **Periodic Review**: As part of regular skill maintenance
3. **Issue Investigation**: When a skill isn't performing as expected
4. **Comparison**: When choosing between similar skills

## Evaluation Criteria

### 1. Clarity (Score 1-5)

Does the skill communicate clearly?

| Score | Description |
|-------|-------------|
| 5 | Crystal clear, no ambiguity |
| 4 | Clear with minor room for improvement |
| 3 | Generally clear but some confusing parts |
| 2 | Frequently unclear or ambiguous |
| 1 | Confusing, hard to follow |

**Check:**
- Is the description specific about when to use the skill?
- Are execution steps unambiguous?
- Are examples helpful and clear?

### 2. Completeness (Score 1-5)

Does the skill cover what it needs to?

| Score | Description |
|-------|-------------|
| 5 | Comprehensive coverage, all cases handled |
| 4 | Covers most cases, minor gaps |
| 3 | Covers main cases, some gaps |
| 2 | Significant gaps in coverage |
| 1 | Missing critical content |

**Check:**
- Are all necessary steps included?
- Are edge cases covered appropriately?
- Are prerequisites documented?
- Are error handling scenarios addressed?

### 3. Usability (Score 1-5)

Is the skill easy to follow and use?

| Score | Description |
|-------|-------------|
| 5 | Excellent flow, easy to follow |
| 4 | Good structure, minor friction |
| 3 | Usable but could be clearer |
| 2 | Difficult to follow |
| 1 | Unusable without significant effort |

**Check:**
- Is the structure logical?
- Is navigation clear (for skills with references)?
- Are best practices included where helpful?
- Does progressive disclosure work well?

### 4. Accuracy (Score 1-5)

Is the information correct?

| Score | Description |
|-------|-------------|
| 5 | All information verified correct |
| 4 | Correct with minor issues |
| 3 | Mostly correct, some errors |
| 2 | Significant errors present |
| 1 | Fundamentally incorrect |

**Check:**
- Is the technical information correct?
- Are examples valid and working?
- Are references up to date?
- Are scripts tested and functional?

### 5. Efficiency (Score 1-5)

Is the skill token-efficient?

| Score | Description |
|-------|-------------|
| 5 | Optimal use of context budget |
| 4 | Efficient with minor bloat |
| 3 | Some unnecessary content |
| 2 | Significant bloat |
| 1 | Wasteful, needs major reduction |

**Check:**
- Is SKILL.md under ~500 lines?
- Is progressive disclosure used appropriately?
- Is there unnecessary duplication?
- Could content be moved to references?

## Evaluation Process

### Step 1: Initial Review

Read the skill's SKILL.md and note:
- First impression of clarity
- Overall structure
- Length and token usage

### Step 2: Score Each Criterion

For each of the 5 criteria:
1. Review the relevant aspects
2. Assign a score (1-5)
3. Note specific issues or strengths

### Step 3: Calculate Overall Score

```
Overall Score = (Clarity + Completeness + Usability + Accuracy + Efficiency) / 5
```

### Step 4: Identify Issues

List specific problems found:
- Critical issues that must be fixed
- Important issues that should be fixed
- Minor issues that could be improved

### Step 5: Generate Recommendations

For each issue, provide an actionable recommendation:
- What specifically should change
- How to make the change
- Priority (critical/high/medium/low)

## Evaluation Output Format

When reporting evaluation results, use this structure:

```json
{
  "skillName": "skill-name",
  "evaluatedAt": "2025-01-27T10:00:00Z",
  "scores": {
    "clarity": 4,
    "completeness": 3,
    "usability": 4,
    "accuracy": 5,
    "efficiency": 3
  },
  "overallScore": 3.8,
  "issues": [
    {
      "severity": "high",
      "criterion": "completeness",
      "description": "Missing error handling for network failures",
      "location": "Section: API Integration"
    }
  ],
  "recommendations": [
    {
      "priority": "high",
      "action": "Add error handling section",
      "details": "Include timeout and retry patterns for API calls"
    }
  ],
  "summary": "Good skill with solid accuracy but needs completeness improvements"
}
```

## Quality Thresholds

| Overall Score | Quality Level | Action |
|---------------|---------------|--------|
| 4.5 - 5.0 | Excellent | Ready for use |
| 3.5 - 4.4 | Good | Use with minor fixes |
| 2.5 - 3.4 | Needs Work | Enhance before use |
| Below 2.5 | Poor | Major revision or rebuild |

## Comparative Evaluation

When comparing multiple skills for the same purpose:

1. Evaluate each skill independently
2. Create a comparison table:

```markdown
| Criterion | Skill A | Skill B | Skill C |
|-----------|---------|---------|---------|
| Clarity | 4 | 3 | 5 |
| Completeness | 3 | 4 | 3 |
| Usability | 4 | 3 | 4 |
| Accuracy | 5 | 4 | 4 |
| Efficiency | 3 | 4 | 4 |
| **Overall** | **3.8** | **3.6** | **4.0** |
```

3. Consider non-score factors:
   - Maintenance burden
   - Author/source reliability
   - Update frequency
   - Community support

## Quick Validation

For rapid assessment when full evaluation isn't needed:

```markdown
Quick Validation Checklist:
- [ ] Has valid YAML frontmatter with name and description
- [ ] Description clearly states when to use it
- [ ] Instructions use imperative form
- [ ] At least one example provided
- [ ] SKILL.md under 500 lines
- [ ] References properly linked (if any)
- [ ] No obvious errors in content
```

Pass = skill is minimally viable. Fail = needs attention before use.

## Evaluation Tips

1. **Be objective** - Use the criteria consistently
2. **Document evidence** - Note specific examples for each score
3. **Consider audience** - A skill for experts differs from one for beginners
4. **Check freshness** - Older skills may have outdated information
5. **Test scripts** - Run bundled scripts if present
6. **Validate examples** - Try the examples when possible
