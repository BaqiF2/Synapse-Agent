# PRD Document Template

File naming convention: `docs/requirements/YYYY-MM-DD-<topic>-prd.md`

---

# [Product/Feature Name] — Product Requirements Document (PRD)

## Document Info
| Field | Value |
|-------|-------|
| Version | v1.0 |
| Created | YYYY-MM-DD |
| Last Updated | YYYY-MM-DD |
| Status | Draft / In Review / Approved |

## 1. Overview

### 1.1 Product/Feature Summary
[One paragraph describing the core purpose and value of this feature]

### 1.2 Goals
- [Clear, measurable business objectives]

### 1.3 Non-Goals (explicitly excluded scope)
- [Items explicitly out of scope for this iteration]

## 2. Users & Scenarios

### 2.1 Target Users
| User Role | Description | Core Need |
|-----------|------------|-----------|
| [Role name] | [Role description] | [Core need] |

### 2.2 Core User Story
> As a [role], I want [action], so that [value].

### 2.3 Use Cases
| ID | Description | Trigger | Expected Outcome |
|----|------------|---------|-----------------|
| UC-001 | [Scenario description] | [Trigger condition] | [Expected result] |

## 3. Functional Requirements

### 3.1 Feature List
| ID | Feature Name | Description | Priority |
|----|-------------|------------|----------|
| F-001 | [Feature name] | [Feature description] | Must/Should/Could |

### 3.2 Feature Details

#### F-001: [Feature Name]
**Description**: [Detailed description]

**Input**:
- [Input parameters with data types, formats, constraints]

**Output**:
- [Output parameters with data types, formats]

**Business Rules**:
1. [Rule 1]
2. [Rule 2]

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| [Scenario name] | [Trigger condition] | [How the system should respond] |

**Boundary Conditions**:
- [Boundary conditions and their handling]

**State Behavior**:
- [State persistence, isolation, and reset rules]

## 4. Non-Functional Requirements

### 4.1 Performance Requirements
| Metric | Requirement | Measurement Method |
|--------|------------|-------------------|
| [Metric name] | [Specific numerical requirement] | [How to measure] |

### 4.2 Security Requirements
- [Security-related requirements]

### 4.3 Usability Requirements
- [Usability-related requirements]

### 4.4 Compatibility Requirements
- [Compatibility-related requirements]

## 5. Constraints & Dependencies

### 5.1 Constraints
- [Technical, business, and timeline constraints]

### 5.2 External Dependencies
- [Dependent external systems, services, or teams]

### 5.3 Assumptions
- [Assumptions this document is based on]

## 6. BDD Testability Check

| Dimension | Verification Question | Status |
|-----------|----------------------|--------|
| Input/Output format | Are exact input/output formats specified? (data types, structure, encoding) | Pass/Fail |
| Error & exception scenarios | Is every failure mode explicitly described with expected behavior? | Pass/Fail |
| Boundary & priority rules | Are conflict/ambiguity resolution rules defined? | Pass/Fail |
| State behavior | Is state persistence, isolation, and reset behavior clear? | Pass/Fail |
| Verifiable granularity | Can each behavior be independently tested with concrete steps and a single expected outcome? | Pass/Fail |
| Ambiguity check | Are there implicit assumptions that different readers could interpret differently? | Pass/Fail |

## 7. Glossary
| Term | Definition |
|------|-----------|
| [Term] | [Definition] |
