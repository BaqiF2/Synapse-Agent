---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

# Brainstorming Ideas Into Requirements

## Overview

Help turn ideas into validated, testable requirement specifications through natural collaborative dialogue. The process starts by understanding user intent, explores approaches, refines design through incremental validation, and produces formal PRD and BDD acceptance documents.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once the design is validated, produce a formal PRD and BDD acceptance criteria — all before any technical implementation begins.

## The Process

**Understanding the idea:**
- Check out the current project state first (files, docs, recent commits)
- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**
- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**Presenting the design:**
- Once you believe you understand what you're building, present the design
- Break it into sections of 200-300 words
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, state behavior, edge cases, testing
- Be ready to go back and clarify if something doesn't make sense

**Validating for testability (BDD readiness check):**

After the full design is presented and validated, run every design point through this checklist before finalizing:

| Dimension | Question to verify |
|---|---|
| Input/Output format | Are the exact formats of inputs and outputs specified? (data types, structure, encoding) |
| Error & exception scenarios | Is every failure mode explicitly described with its expected behavior? (not just the happy path) |
| Boundary & priority rules | When ambiguity or conflict can arise, are the resolution rules defined? (precedence, fallback, default values) |
| State behavior | Is it clear what state persists, what is isolated, and what resets? (sessions, variables, side effects) |
| Verifiable granularity | Can each behavior be independently tested with concrete steps and a single expected outcome? |
| Ambiguity check | Are there any implicit assumptions that different readers could interpret differently? |

**How to use the checklist:**
- For each design section, evaluate all 6 dimensions
- Any dimension that fails → go back to the user with a targeted question to fill the gap
- Do NOT silently assume defaults — if the PRD will be consumed downstream (e.g., converted to BDD test cases), ambiguity is a defect
- Only proceed to documentation once all design points pass all 6 dimensions
- Mark dimensions as "N/A" only when genuinely not applicable (e.g., stateless operations have no state behavior)

## After the Design

### Phase 1: PRD Specification

**Goal**: Transform the validated design into a formal, testable PRD.

Read `references/prd-template.md` for the document template.

**Execution rules**:
1. Write the PRD based on conversation history and the validated design
2. Write to: `docs/requirements/YYYY-MM-DD-<topic>-prd.md`
3. Present the PRD to the user section by section (300-500 words per section), confirming each before moving on
4. **Cross-check**: Verify every design point is captured in the PRD — flag any gaps
5. If gaps exist, present them to the user for resolution before proceeding
6. Run the **BDD readiness check** (see checklist above) on every functional requirement
7. Any dimension that fails → go back to the user with a targeted question. Do NOT silently assume defaults.

### Phase 2: BDD Acceptance Documents

**Goal**: Generate machine-parseable BDD acceptance criteria that map 1:1 to PRD requirements.

Read `references/bdd-template.md` for the JSON schema and writing guide.

**Execution rules**:
1. Create directory: `docs/requirements/YYYY-MM-DD-<topic>-bdd/`
2. Generate one JSON file per feature: `<feature-name>.json`
3. Each JSON file follows the schema defined in `references/bdd-template.md`
4. Set all `passes` and `overallPass` to `false` (not yet tested)
5. Cover: normal flows, error flows, boundary conditions for each feature
6. **Cross-check**: Compare every PRD functional requirement against BDD scenarios — ensure complete coverage
7. If coverage gaps found, add missing scenarios
8. Present the coverage mapping to the user for final validation

### Phase 3: Summary Report

After all documents are complete, present a summary to the user:

1. **Design decisions** made during brainstorming (key choices and reasoning)
2. **PRD** file path and requirement count (Must/Should/Could breakdown)
3. **BDD** directory path, feature count, and total scenario count
4. **Open questions** still unresolved (if any)
5. **Coverage status**: Confirm PRD ↔ BDD alignment is complete

### Continuing to Implementation (optional)

- Ask: "Ready to set up for implementation?"
- Use superpowers:using-git-worktrees to create isolated workspace if available
- Use superpowers:writing-plans to create detailed implementation plan if available

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design in sections, validate each
- **Be flexible** - Go back and clarify when something doesn't make sense
- **No silent assumptions** - If ambiguous, ask; never fill in defaults
- **Separate problem from solution** - Requirements describe WHAT, not HOW