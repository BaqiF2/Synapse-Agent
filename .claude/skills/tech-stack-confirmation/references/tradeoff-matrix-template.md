# Trade-off Matrix Template

Use this template to quantify technology selection decisions. Create one matrix per decision domain (e.g., one for database selection, one for frontend framework selection).

File naming convention: `docs/architecture/tradeoff/YYYY-MM-DD-<domain>-tradeoff-matrix.md`

---

# [Decision Domain] Trade-off Matrix

**PRD Reference**: [Relevant requirement IDs]

**Decision Domain**: [e.g., "Backend Framework", "Database", "Message Queue", "Frontend Framework"]

## Evaluation Criteria

Derive evaluation criteria directly from PRD requirements. Each criterion must be traceable to a specific PRD requirement or NFR.

| Criterion ID | Criterion | Weight (1-5) | Source (PRD Ref) | Description |
|-------------|-----------|--------------|-----------------|-------------|
| C-01 | [e.g., Transaction Support] | [Weight] | [PRD-F-xxx] | [What this means concretely] |
| C-02 | [e.g., Read Throughput] | [Weight] | [PRD-NFR-xxx] | [What this means concretely] |
| C-03 | [e.g., Development Speed] | [Weight] | [Constraint] | [What this means concretely] |
| C-04 | [e.g., Operational Complexity] | [Weight] | [NFR] | [What this means concretely] |

**Weight scale**: 1 = Nice to have, 2 = Low importance, 3 = Medium importance, 4 = High importance, 5 = Critical / non-negotiable

## Scoring Matrix

Score each option against each criterion on a 1-5 scale.

| Criterion | Weight | Option A: [Name] | Option B: [Name] | Option C: [Name] |
|-----------|--------|-------------------|-------------------|-------------------|
| [C-01] | [W] | Score (1-5) | Score (1-5) | Score (1-5) |
| [C-02] | [W] | Score (1-5) | Score (1-5) | Score (1-5) |
| [C-03] | [W] | Score (1-5) | Score (1-5) | Score (1-5) |
| [C-04] | [W] | Score (1-5) | Score (1-5) | Score (1-5) |
| **Weighted Total** | | **[Sum]** | **[Sum]** | **[Sum]** |

**Score scale**: 1 = Poor fit, 2 = Below average, 3 = Adequate, 4 = Good fit, 5 = Excellent fit

**Weighted total formula**: Sum of (Weight × Score) for each criterion

## Scoring Justification

For each non-obvious score, provide brief justification:

### Option A: [Name]
- C-01 scored [X] because: [reason]
- C-02 scored [X] because: [reason]

### Option B: [Name]
- C-01 scored [X] because: [reason]
- C-02 scored [X] because: [reason]

### Option C: [Name]
- C-01 scored [X] because: [reason]
- C-02 scored [X] because: [reason]

## Result

**Recommended option**: [Option name] with weighted total of [score]

**Key differentiator**: [What made this option stand out]

**Caveats**: [Any concerns or conditions that could change this recommendation]

## Decision

- [ ] Matrix reviewed by technical team
- [ ] Scores validated against evidence (benchmarks, documentation, team experience)
- [ ] Result accepted → proceed to ADR documentation
