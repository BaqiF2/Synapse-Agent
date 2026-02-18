# Non-Functional Requirements (NFR) Mapping Guide

This guide provides a systematic method for extracting implicit non-functional requirements from a PRD and mapping them to concrete technology stack implications.

## NFR Extraction Pattern

PRDs often express non-functional needs implicitly. Use the following mapping table to translate common PRD language into actionable technology requirements.

### Performance NFRs

| PRD Language Pattern | Implied NFR | Technology Implication |
|---------------------|-------------|----------------------|
| "real-time", "instant", "live" | Latency < 100ms | WebSocket/SSE, in-memory cache, event-driven architecture |
| "fast loading", "smooth experience" | Page load < 2s, API response < 500ms | CDN, SSR/SSG, query optimization, caching layers |
| "handle large volumes", "scale" | High throughput | Message queues, horizontal scaling, read replicas |
| "export/report should be fast" | Async processing | Background job framework, task queues, caching |
| "support N concurrent users" | Concurrency handling | Load balancer, connection pooling, stateless services |

### Reliability NFRs

| PRD Language Pattern | Implied NFR | Technology Implication |
|---------------------|-------------|----------------------|
| "always available", "24/7" | High availability (99.9%+) | Multi-AZ deployment, health checks, auto-failover |
| "no data loss" | Durability | Write-ahead logs, replication, backup strategy |
| "transaction", "consistent" | Data consistency | ACID-compliant DB, distributed transaction support |
| "retry", "recover" | Fault tolerance | Circuit breaker, retry mechanisms, dead-letter queues |

### Security NFRs

| PRD Language Pattern | Implied NFR | Technology Implication |
|---------------------|-------------|----------------------|
| "user authentication", "login" | AuthN/AuthZ | OAuth2/OIDC provider, JWT, session management |
| "sensitive data", "compliance" | Data protection | Encryption at rest/transit, audit logging, RBAC |
| "multi-tenant" | Tenant isolation | Schema/DB-level isolation, row-level security |
| "API access", "third-party" | API security | Rate limiting, API gateway, API key management |

### Scalability NFRs

| PRD Language Pattern | Implied NFR | Technology Implication |
|---------------------|-------------|----------------------|
| "internationalization", "global" | i18n/l10n support | i18n framework, timezone-aware DB, multi-region deploy |
| "future expansion", "modular" | Extensibility | Plugin architecture, microservices, event-driven |
| "growing user base" | Horizontal scalability | Container orchestration, auto-scaling, stateless design |
| "multi-platform", "mobile + web" | Cross-platform | API-first design, responsive framework, BFF pattern |

### Operational NFRs

| PRD Language Pattern | Implied NFR | Technology Implication |
|---------------------|-------------|----------------------|
| "monitor", "track", "insight" | Observability | Logging framework, APM, metrics collection |
| "deploy frequently", "rapid iteration" | CI/CD maturity | Pipeline tools, containerization, IaC |
| "rollback", "version" | Release management | Blue-green/canary deploy, feature flags, versioned APIs |

## NFR-to-Stack Mapping Process

For each extracted NFR:

1. **Identify the PRD source** — Record the exact PRD section or requirement ID
2. **Quantify the requirement** — Convert vague language to measurable thresholds (ask the user if unclear)
3. **Map to technology domains** — Determine which stack layers are affected (frontend, backend, database, infrastructure, testing)
4. **Generate constraints** — Express as technology constraints (e.g., "database must support ACID transactions")
5. **Flag conflicts** — Identify when NFRs conflict with each other (e.g., "maximum flexibility" vs. "strict consistency")

## NFR Summary Table Template

| NFR ID | Category | PRD Source | Requirement | Threshold | Affected Stack Layer | Technology Constraint |
|--------|----------|-----------|-------------|-----------|--------------------|-----------------------|
| NFR-001 | Performance | PRD §4.1 | API response time | < 200ms p95 | Backend, Database | In-memory cache required |
| NFR-002 | Security | PRD §4.2 | User authentication | OAuth2 compliant | Backend, Frontend | OIDC provider integration |
| NFR-003 | Scalability | PRD §1.1 | Concurrent users | 10,000+ | Infrastructure | Container orchestration |
