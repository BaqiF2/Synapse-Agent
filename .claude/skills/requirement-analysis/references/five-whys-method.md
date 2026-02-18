# 5 Whys Method — Practical Guide

## Definition

The 5 Whys is a structured root-cause analysis technique. Continuously ask "why" about a problem to trace from "surface symptoms" to "systemic defects" or "real motivations". It is not about asking five random questions — it is a logical chain tracing from effect back to cause.

## When to Trigger

Whenever a user's "requirement" contains specific technical implementation paths (REST, WebSocket, full snapshot, batch, cron jobs, etc.), immediately start the 5 Whys — this is a Candidate Solution, not a raw requirement.

## Identifying Candidate Solutions

- The user has already assumed "this is how the problem should be solved"
- The phrasing contains specific technical implementation paths
- The user believes "the more detail I provide, the faster you can develop it"
- The real "problem" is wrapped inside the proposed solution and has never been stated

## 5 Whys Trace Template

### Why #1: Ask about purpose
"Why do you need [the solution the user described]?"
→ Discovery: The user's real business objective

### Why #2: Ask about current state
"How are you doing it now? What difficulties are you encountering?"
→ Discovery: Core pain points and existing bottlenecks

### Why #3: Ask about sufficiency
"If we give you [initial solution], would that completely solve the problem?"
→ Discovery: Hidden additional requirements

### Why #4: Ask about solution boundaries
"Suppose we provide [improved solution], would that meet your needs?"
→ Discovery: The user's acceptance range for solutions

### Why #5: Ask about minimum viability
"If [minimal solution] could achieve [core value], would that be acceptable?"
→ Discovery: The true minimum requirement

## Worked Example

### Input (disguised requirement)
"Please provide a REST API to query all trading pairs' 24-hour price change, returning a full list, updated every 5 seconds."

### 5 Whys Trace

**Why #1**: "Why do you need to query all trading pairs' 24-hour price change?"
→ User: "We're running a momentum strategy — select the top 10 coins by 24h gain, analyze whether they've broken previous highs, and decide whether to open a position."
→ **Discovery**: Not "viewing market data" — it's for generating decision signals.

**Why #2**: "How often does this strategy execute? How do you currently get the data?"
→ User: "Every 5 minutes. We can only poll individual coins — 80+ coins, 80 requests, frequently rate-limited, and timestamps are inconsistent across coins."
→ **Discovery**: Core pain points are inefficient single-coin polling, rate limiting, and misaligned data timestamps.

**Why #3**: "If we return all pairs' 24h change in one call, is the problem fully solved?"
→ User: "Not quite — we also need trading volume and turnover rate. Plus we care more about 1-hour and 4-hour changes than 24h."
→ **Discovery**: What's actually needed is multi-period, multi-indicator market scanning capability.

**Why #4**: "A full-market ticker snapshot API with real-time price, 24h change, volume, etc., updated every 1 second — would that work?"
→ User: "Yes! But we need HTTP as backup, and the data must be generated as a single batch."
→ **Discovery**: User accepts composite data structures as long as atomicity and low latency are guaranteed.

**Why #5**: "A REST endpoint, optional multi-coin filter, cache ensures all data within the same second comes from the same source — would that work?"
→ User: "Fully meets our needs. Even every 10 seconds would be fine."

### Output (User Story)
As a quantitative strategy team, I want a market snapshot API that supports multi-coin batch queries, multi-period indicators, and atomic timestamps, so that I can accurately compute momentum signals while avoiding rate-limiting and data misalignment caused by single-coin polling.

## Questioning Principles

- Ask only one question at a time — never throw multiple questions at once
- Prefer multiple-choice format to reduce cognitive load
- When detecting solution-wrapped language, gently guide the user to describe the problem itself
- Record the discovery from each question to form a complete trace chain
- Stop questioning when the user's answers have converged to a stable business need
