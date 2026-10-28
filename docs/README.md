# CloudCanvas implementation map and diagrams

These documents describe the checked-in implementation reviewed on 2026-10-28,
starting from commit `da5f1b4`. They describe source behavior, not a live deployment
qualification. Render the fenced `mermaid` blocks in a Mermaid-capable Markdown
viewer. Solid arrows show requests, actions, or relationships; dotted arrows show
shared code or optional context, with the meaning labeled in each diagram.

## Reading order

| Document | Purpose |
| --- | --- |
| [System architecture](system-architecture.md) | Runtime boundaries, integrations, graph contract, and persistence |
| [User flow](user-flow.md) | Authentication, sketch editing, AI review, publishing, and cleanup |
| [Deployment lifecycle](deployment-lifecycle.md) | Validation, dependency ordering, readiness, refresh, and deletion |
| [AI request flow](ai-request-flow.md) | Conversation persistence, routing, tools, and blueprint application |
| [CloudFront notes](cloudfront.md) | Existing integration details, permissions, and supported settings |

Deployment and AI get separate diagrams because their branching and failure paths
would make the two overview diagrams difficult to read.

## Repository analysis

| Area | Implementation and responsibility |
| --- | --- |
| `client/src/app/` | Next.js App Router pages, server-side dashboard session checks, NextAuth route |
| `client/src/components/auth/` | Credentials/Google entry and invalid-session handling |
| `client/src/components/dashboard/` | Sketch list, AWS connection settings, workspace navigation, logout |
| `client/src/components/graph/` | React Flow editor, resource forms/details, publish control, AI composer, S3 object browser |
| `client/src/hooks/` and `client/src/lib/` | Undo/redo, debounce, speech input, API calls, canvas diffs, graph validation, change summaries, toasts |
| `contracts/` | Shared TypeScript graph types, AJV schema validation, YAML parsing, reference checks, attachment rules, layout, tests |
| `server/src/routes/` and `server/src/controllers/` | Express auth, connections/catalog, graph CRUD/import, deployment/cleanup, conversations, bucket object APIs |
| `server/src/services/aws/` | Resource dispatcher, SDK service implementations, catalog/cache, encryption, deployment graph planning, output resolution, readiness checks |
| `server/src/services/aiService.ts` | FastAPI request/response adapter, shared-contract validation of builds, timeout/error translation |
| `server/src/lib/`, `middlewares/`, `utils/`, `types/` | Configuration, Prisma adapter, HTTP client, JWT middleware, logging, validation, response types |
| `server/prisma/` | PostgreSQL schema and migration history for users, graphs, connections, resources, deployments, conversations |
| `server/src/generated/prisma/` | Generated database client; derived from the Prisma schema |
| `service/app.py`, `routers/`, `schemas/` | FastAPI entry point, query endpoint, Python/Pydantic request and response definitions |
| `service/agents/`, `services/`, `models/` | LangGraph routing, Groq structured routing/build generation, NVIDIA conversation model |
| `service/tools/`, `config/`, `utils/` | AWS catalog callback, support guidance, DuckDuckGo search, prompts/model settings, errors/logging |
| Tests and build configuration | Contract tests; server AWS/graph/AI adapter tests; Python agent/schema tests; client canvas diff tests and lint/build scripts |

The repository contains three application processes plus PostgreSQL. `contracts`
is a library built for client/server use, not a fourth HTTP service. No checked-in
Docker Compose, Kubernetes deployment, background job worker, queue, WebSocket,
or CI workflow was found in this review. The application's AWS resources are
deployment targets; they do not establish where CloudCanvas itself is hosted.

## Findings that affect the diagrams

- Graph edges represent supported resource dependencies, not arbitrary network
  traffic. The contract supports 11 node types and four attachment pairings.
- Manual edits use incremental APIs. Save and Apply blueprint use full graph
  replacement, which is rejected while any resource record is non-terminated.
- Publish executes SDK work inside an Express request. It checks existing
  resource states but has no atomic deployment reservation or durable job runner.
- Resource refresh is driven by the open editor, by default every 30 seconds.
  CloudFront deletion uses that refresh path to continue after propagation.
- Python uses its own Pydantic models; it does not import the TypeScript contract.
  Express validates returned builds against the shared contract before accepting
  them. The defined `Llama` wrapper is not wired into the active LangGraph.
- Express protects AWS and sketch routes with a user JWT. In this checkout the
  FastAPI query route has no service-key authentication. Catalog callbacks carry
  the user's JWT and are checked by Express. The public Express Google auth
  handler accepts profile fields without independently verifying a Google token.
- The deployment dispatcher contains update handlers, but the normal node PATCH
  route blocks AWS configuration changes for live resources. An editable form
  should not be read as proof of a working end-to-end update journey.
- Some publish update/conflict exits occur after creating a `PENDING` deployment
  without finalizing it. There is no automatic rollback of earlier AWS changes.

These are documentation observations, not code changes or a complete security
audit. GitHub/Docker workflows, custom domains, arbitrary graph relationships,
and infrastructure-as-code export are not represented as implemented features.

## Evidence and verification scope

Analysis covered the repository layout, manifests/configuration, routes,
controllers, UI entry points and state handlers, shared contract, Prisma schema
and migrations, AI graph/model/tool wiring, AWS dispatch/services, and existing
test coverage. Source links in each document identify the relevant entry points.
Local environment secrets and generated/vendor/build output are not sources for
these diagrams. The existing root and client READMEs are orientation material;
current source takes precedence when they differ.

Documentation validation checks local Markdown links and Mermaid syntax/rendering.
It does not establish live Google authentication, model availability, database
migration health, AWS permissions, provisioning, or CDN delivery. The existing
tests mainly cover contracts and service units with mocks; they do not qualify
the entire browser-to-AWS journey.
