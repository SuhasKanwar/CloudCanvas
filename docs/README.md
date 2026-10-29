# CloudCanvas complete project guide

This collective README brings together the project overview, implementation map,
all nine architecture/workflow diagrams, setup and operations, the ten-paper
literature review, company comparisons, learnings, bibliography and PDF provenance.
It is intended to be readable on its own; focused documents remain available for
shorter references. All ten original PDFs remain under [research](research/).

**Consolidated:** 2026-10-29. **Reviewed code baseline:**
`3fb7def7d852d52177fb343c7d8f793588f5d9b3`. The research and product sources were
reviewed on 2026-10-29; architecture review and local test receipts retain their
original dates. Consolidation does not constitute a new live AWS/provider test or
an independent benchmark. Implemented capabilities, historical checks, proposed
improvements and unproven comparative claims remain distinct.

## Contents

- [Project overview and native development](#project-overview)
- [Repository implementation map](#repository-map)
- [System architecture](#system-architecture)
- [User flow](#user-flow)
- [Deployment lifecycle](#deployment-lifecycle)
- [AI request flow](#ai-request-flow)
- [CloudFront and S3 delivery](#cloudfront-delivery)
- [Docker Compose setup](#docker-setup)
- [Research comparison, differentiation and learnings](#research-comparison)
- [Ten paper bibliography and PDF catalog](#paper-catalog)
- [Detailed implementation evidence](#implementation-evidence)
- [Paper provenance and verification metadata](#paper-provenance)
- [Source and license link index](#additional-sources)

<a id="project-overview"></a>

## Project overview and native development

CloudCanvas is a visual AWS infrastructure workspace for designing, validating,
and publishing connected cloud resources from a canvas. It gives developers a
clearer way to build small-to-medium AWS architectures without starting from a
blank SDK script or manually repeating the same console workflow.

The project turns an infrastructure sketch into an ordered deployment plan. It
validates resource compatibility, resolves dependencies, provisions through the
AWS SDK, and records desired configuration, deployed state, errors, and
deployment history. An AI assistant can explain AWS decisions or generate a
valid draft graph that the user reviews before publishing.

### The Problem

AWS infrastructure often spans several dependent resources. An EC2 instance
needs a key pair and security groups; a Lambda function needs an execution role;
a CloudFront distribution needs a ready S3 origin. Managing these relationships
across the AWS console, deployment scripts, and team documentation is error
prone and makes it difficult to see what is deployed and why.

CloudCanvas addresses this by making dependencies visible and enforceable. A
sketch is both the design surface and the source of truth for deployment. The
system blocks incompatible connections, deploys resources in graph order, polls
their state, and keeps resource details attached to the sketch.

### What It Does

- Authenticates users with credentials or Google, then persists their sketches,
  AWS connections, deployments, resources, and AI conversations.
- Lets users create, rename, import, and edit AWS infrastructure graphs with
  React Flow, including undo/redo and debounced autosave.
- Validates graph YAML/JSON in the shared client and server contract before it
  can become a deployable sketch.
- Deploys dependencies in sequence and waits for required source resources to
  be ready before creating their targets.
- Tracks deployed state, identifiers, IP addresses, URLs, DNS names, and
  failures through polling.
- Supports AI-assisted architecture help and graph generation. Generated graphs
  are validated against the same schema as manual graphs before they reach the
  canvas.
- Supports direct browser-to-S3 upload of files and folders through short-lived
  signed forms after a managed bucket is deployed.

### Implemented AWS Resources

| Area | Resources and relationships |
| --- | --- |
| Compute | EC2 instances, key pairs, security groups, IAM instance profiles |
| Containers | ECR repositories |
| Storage and delivery | S3 buckets and CloudFront distributions |
| Serverless | Lambda functions with IAM execution roles |
| Data and messaging | DynamoDB tables, SQS queues, SNS topics |
| Identity | IAM roles and managed policy attachments |

The graph permits only relationships that CloudCanvas can deploy safely:

```text
KEY_PAIR -----------\
                     -> EC2_INSTANCE
SECURITY_GROUP -----/

IAM_ROLE ------------> LAMBDA_FUNCTION

S3_BUCKET -----------> CLOUDFRONT_DISTRIBUTION
```

For static frontend delivery, CloudCanvas creates a private S3 REST origin,
CloudFront Origin Access Control, a distribution-scoped bucket policy, HTTPS
redirects, and managed security headers. The bucket is deployed and checked
before its connected distribution starts. See [CloudFront deployment notes](#cloudfront-delivery).

### Technology

| Layer | Technologies |
| --- | --- |
| Client | Next.js 16, React 19, TypeScript, Tailwind CSS, React Flow, NextAuth, Motion, Markdown-it, YAML |
| API | Node.js, Express 5, TypeScript, Prisma 7, PostgreSQL, JWT, bcrypt, Axios |
| AWS integration | AWS SDK for JavaScript v3 for EC2, ECR, IAM, S3, CloudFront, Lambda, DynamoDB, SQS, and SNS |
| Graph contract | TypeScript, AJV JSON Schema validation, YAML parsing |
| AI service | Python, FastAPI, Pydantic, LangChain, LangGraph, ChatGroq, ChatNVIDIA |
| Persistence and operations | Encrypted AWS credential storage, deployment/resource records, polling, in-memory catalog caching, structured server logs |

### Security Model

AWS credentials are stored encrypted by the server and are never sent to the
client. A user can only access their own sketches, connections, conversations,
and resources. S3 browser uploads use scoped, short-lived signed POST forms
instead of routing file data through the API. CloudFront uses an Origin Access
Control and a distribution-scoped S3 bucket policy so a managed frontend bucket
can remain private.

The AWS connection must have permission for the selected resources. CloudCanvas
does not create unrestricted IAM credentials or bypass AWS account-level
policies, service quotas, or regional availability.

### Local Development

For the containerized stack, see [Docker Compose setup](#docker-setup).

Prerequisites: Node.js, npm, PostgreSQL, Python 3.12+, and Conda. The project
uses the `cloudcanvas-venv` Conda environment for the AI service.

1. Start PostgreSQL and create a database named `cloudcanvas`.
2. Copy and complete the environment files:

   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env.local
   cp service/.env.example service/.env
   ```

3. Install dependencies and prepare the database:

   ```bash
   cd contracts && npm install && npm run build
   cd ../server && npm install && npm run db:generate && npm run db:push
   cd ../client && npm install
   cd ../service && conda run -n cloudcanvas-venv pip install -r requirements.txt
   ```

4. Run the three services in separate terminals:

   ```bash
   cd server && npm run dev
   cd client && npm run dev
   cd service && conda run -n cloudcanvas-venv uvicorn app:app --reload --port 8000
   ```

The default endpoints are the client at `http://localhost:3000`, API at
`http://localhost:9000`, and AI service at `http://localhost:8000`.

### Validation

```bash
cd contracts && npm test
cd server && npm test
cd client && npm run lint && npm run build -- --webpack
conda run -n cloudcanvas-venv python -m unittest discover -s service/tests
```

These checks verify contracts, deployment behavior with mocked AWS SDK calls,
client types and build output, and the AI schema. They do not prove deployment
against a live AWS account or delivery through a live CloudFront distribution.

### Current Scope

CloudCanvas currently focuses on AWS resource design and deployment. GitHub
repository integration, Docker image workflows, custom domains, CDN logging,
and full infrastructure-as-code export are future work, not current features.

<a id="repository-map"></a>

## Repository implementation map

### Repository analysis

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
is a library built for client/server use, not a fourth HTTP service. The root
Docker Compose file runs those processes and PostgreSQL; see the Docker setup
document for its container-specific networking. No Kubernetes deployment,
background job worker, queue, WebSocket, or CI workflow was found in this review.
The application's AWS resources are
deployment targets; they do not establish where CloudCanvas itself is hosted.

### Findings that affect the diagrams

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

### Evidence and verification scope

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

<a id="system-architecture"></a>

## System architecture

CloudCanvas separates the design UI, application API, and AI runtime. Express
owns persistence and AWS operations. AI produces advice or draft graphs; resource
creation is performed only through the deployment API.

### Runtime components

```mermaid
flowchart LR
    Person["User"] --> Browser["Browser: React workspace<br/>React Flow, forms, AI chat"]

    subgraph Next["Next.js client application :3000"]
        Pages["App Router pages<br/>dashboard session checks"]
        Auth["NextAuth<br/>credentials and Google callbacks"]
    end

    Browser --> Pages
    Browser -->|"session and sign-in"| Auth
    Auth <-->|"OAuth"| Google["Google"]
    Auth -->|"signup, signin, Google profile exchange"| AuthAPI

    subgraph Server["Express application API :9000"]
        AuthAPI["Auth controller<br/>bcrypt and API JWT issuance"]
        Guard["JWT middleware<br/>Bearer token or Authorization cookie"]
        Controllers["Owned sketches, connections,<br/>conversations and S3 object APIs"]
        Deploy["Publish, refresh and cleanup<br/>graph plan and output resolution"]
        Manager["AWSResourceManager<br/>SDK v3 service dispatch"]
        Crypto["AES-256-GCM<br/>credential encryption and decryption"]
        Cache["Process-local catalog cache<br/>120-second catalog TTL"]
        Adapter["AIService adapter<br/>response validation and 120-second timeout"]
        ORM["Prisma with PostgreSQL adapter"]
        Guard --> Controllers
        Controllers --> Deploy --> Manager
        Controllers --> Manager
        Controllers --> Crypto
        Controllers --> ORM
        AuthAPI --> ORM
        Controllers --> Adapter
        Manager --> Cache
    end

    Browser -->|"API JWT from NextAuth session"| Guard
    ORM <--> DB[("PostgreSQL")]
    Manager -->|"decrypted connection credentials"| AWS["AWS APIs<br/>EC2, ECR, S3, IAM, Lambda,<br/>DynamoDB, SQS, SNS, CloudFront"]

    subgraph AI["FastAPI AI service :8000"]
        Query["POST /api/agent/query<br/>Pydantic schemas"]
        Graph["LangGraph router<br/>build branch or conversation/tool loop"]
        Tools["Support guidance, web search,<br/>AWS catalog tool"]
        Query --> Graph
        Graph <--> Tools
    end

    Adapter -->|"query, history, optional catalog and user JWT"| Query
    Graph --> Groq["Groq<br/>route classification and structured builds"]
    Graph --> NVIDIA["NVIDIA NIM<br/>general conversation and tool calls"]
    Tools --> Search["DuckDuckGo search"]
    Tools -->|"catalog callback with user Bearer JWT"| Guard

    Contract["contracts library<br/>JSON Schema, YAML, dependency rules"]
    Contract -.->|"imported by client"| Browser
    Contract -.->|"imported by server"| Controllers
    Contract -.->|"validates returned build"| Adapter

    Browser -->|"request scoped signed POST form"| Guard
    Browser -->|"file bytes using signed form"| S3["Managed S3 bucket"]
    Visitor["Site visitor"] --> CDN["CloudFront distribution"]
    CDN -->|"OAC-signed origin request"| S3
```

Ports are local defaults, not a prescribed production topology. The browser calls
Express directly for workspace APIs; these calls are not Next.js API proxies.
Responses return along the request path. S3 uploads are the exception: Express
signs an upload, and the browser sends the file directly to S3. The CloudFront/S3
path depicts infrastructure users may create, separate from CloudCanvas hosting.

### Persistence relationships

Arrows below mean “has records,” not request flow. Optional links are labeled.

```mermaid
flowchart TD
    User["User"] --> Sketch["Sketch<br/>name, version, status"]
    User --> Connection["AwsConnection<br/>region, encrypted keys, active flag"]
    User --> Resource["AwsResource"]
    User --> Deployment["Deployment"]
    User --> Conversation["SketchConversation"]
    Sketch --> Nodes["SketchNode<br/>type, position, config JSON"]
    Sketch --> Edges["SketchEdge<br/>source and target node IDs"]
    Edges -->|"references"| Nodes
    Sketch --> Resource
    Sketch --> Deployment
    Sketch -->|"at most one"| Conversation
    Conversation --> Messages["ChatMessage<br/>user or assistant; text or build JSON"]
    Sketch -.->|"optional selected connection"| Connection
    Resource -->|"required connection"| Connection
    Deployment -->|"required connection"| Connection
    Resource -.->|"optional unique node link"| Nodes
    Resource --> State["desiredConfig, actualState,<br/>externalId, managed, status, lastError"]
    Deployment --> Receipt["request, response, status,<br/>errorMessage, timestamps"]
```

Desired node configuration and recorded AWS state are separate. Deleting a node
sets its resource link to null; controllers first block deletion of live or
unresolved resources. Connection deletion is restricted by resource/deployment
foreign keys. Sketch/conversation child records use cascading deletion; the
sketch controller attempts AWS cleanup before deleting database records.

### Boundaries and limits

AWS credentials enter through connection settings and are encrypted at rest with
`AWS_ENCRYPTION_KEY`; the API returns connection metadata. The AI receives catalog
metadata and, for tools, the user's API JWT rather than raw AWS credentials.
Catalog caching is process-local, not shared across replicas.

Protected controllers scope data to the JWT user ID. This is not proof that every
boundary is hardened: FastAPI has no service authentication in the current source,
and the Express Google exchange does not verify a Google token independently.
There is no durable deployment worker or event-driven AWS status feed.

### Source entry points

- [Client auth callbacks](../client/src/app/api/auth/[...nextauth]/options.ts), [API client](../client/src/lib/api.ts), [graph editor](../client/src/components/graph/GraphEditor.tsx)
- [Express entry point](../server/src/index.ts), [JWT middleware](../server/src/middlewares/authenticate.ts), [infrastructure controller](../server/src/controllers/infrastructureController.ts)
- [AWS dispatcher](../server/src/services/aws/index.ts), [encryption](../server/src/services/aws/crypto.ts), [bucket APIs](../server/src/controllers/bucketObjectsController.ts)
- [Prisma schema](../server/prisma/schema.prisma), [shared graph contract](../contracts/src/index.ts)
- [FastAPI route](../service/routers/agent.py), [active agent graph](../service/agents/graph.py), [catalog callback](../service/tools/aws_catalog.py)

<a id="user-flow"></a>

## User flow

This flow follows the current browser UI. Import and direct AI sketch creation
also exist as API operations; the dashboard currently exposes New sketch and
Open sketch, without a standalone import or AI-create screen.

### Entry and workspace

```mermaid
flowchart TD
    Start(["Open CloudCanvas"]) --> Landing["Landing page"]
    Landing --> Enter["Open dashboard"]
    Enter --> Session{"NextAuth session<br/>has API token?"}
    Session -->|"No"| Auth["Sign in or create account<br/>credentials or Google"]
    Auth --> Accepted{"Authentication succeeds?"}
    Accepted -->|"No"| AuthError["Show authentication error"] --> Auth
    Accepted -->|"Yes"| Dashboard
    Session -->|"Yes"| Dashboard["Dashboard: list owned sketches"]
    Dashboard -->|"AWS connections"| Connections["Save account credentials and region<br/>select active connection"]
    Connections --> Dashboard
    Dashboard -->|"New sketch"| New["Create empty persisted draft"]
    Dashboard -->|"Open sketch"| Load["Load nodes, edges and resource snapshots"]
    New --> Load --> Canvas["Canvas workspace"]
    Dashboard -->|"Delete sketch"| Confirm["Confirm AWS cleanup and sketch deletion"]
    Confirm --> Cleanup["Run dependency-aware cleanup"]
    Cleanup --> Done{"Cleanup complete?"}
    Done -->|"Yes"| Removed["Delete sketch records; refresh list"] --> Dashboard
    Done -->|"No: pending or failed"| Retry["Show error or pending message<br/>open workspace to poll; retry deletion"] --> Dashboard
    Dashboard -->|"Log out"| Logout["Clear API cookie and NextAuth session"] --> Landing
    Canvas -->|"Sketches"| Dashboard
    Canvas -->|"AWS connections"| Connections
    Protected["Protected API request returns 401"] --> Reset["Clear NextAuth session<br/>redirect to sign-in"] --> Auth
```

An AWS connection is required for publishing and catalog-backed configuration,
but users can create a sketch before adding one. Saving a connection stores its
credentials; it does not prove AWS permissions. Catalog or deployment calls may
subsequently fail. Deleting a connection used by resource or deployment records
returns a conflict.

### Design, review, and publish

```mermaid
flowchart TD
    Canvas["Open canvas"] --> Manual["Add resource nodes<br/>configure forms and connect dependencies"]
    Manual --> Edit["Move, rename, edit, undo or redo"]
    Edit --> Autosave["Debounced incremental autosave"]
    Autosave --> Saved{"Saved successfully?"}
    Saved -->|"No"| Fix["Show save error<br/>correct blocked or invalid edit"] --> Edit
    Saved -->|"Yes"| Review["Review saved draft"]

    Canvas --> Chat["Open AI assistant<br/>type or use supported speech input"]
    Chat --> Reply{"Assistant response"}
    Reply -->|"Text"| Read["Read advice or ask follow-up"] --> Chat
    Reply -->|"Build"| Preview["Inspect blueprint summary"]
    Preview -->|"Apply blueprint"| Replace["Validate and replace entire sketch graph"]
    Replace --> Applied{"Replacement allowed?"}
    Applied -->|"No"| ApplyError["Show error; delete or detach<br/>non-terminated resources before retry"] --> Preview
    Applied -->|"Yes"| Review

    Review -->|"Save button"| Save["Validate full graph<br/>replace graph through import API"]
    Save --> SaveOK{"No non-terminated resources<br/>and valid graph?"}
    SaveOK -->|"No"| SaveError["Show validation or replacement error"] --> Review
    SaveOK -->|"Yes"| Review
    Review -->|"Publish"| Account{"AWS connection available?"}
    Account -->|"No"| Settings["Add connection in AWS settings"] --> Account
    Account -->|"Yes"| Select["Select connection and Deploy sketch"]
    Select --> Flush["Flush queued canvas saves"]
    Flush --> FlushOK{"Save succeeds?"}
    FlushOK -->|"No"| Fix
    FlushOK -->|"Yes"| Deploy["API validates and deploys in dependency order"]
    Deploy --> Outcome{"Publish request succeeds?"}
    Outcome -->|"No"| Failure["Show error; inspect partial resources<br/>correct draft or clean up before retry"] --> Review
    Outcome -->|"Yes"| Poll["Reload sketch and poll AWS resource state"]
    Poll --> Details["Inspect status, outputs, URLs and errors"]
    Details -->|"Running managed S3 bucket"| Objects["Browse objects; upload files or folders<br/>create folders; confirm content deletion"]
    Details -->|"Delete resource or all resources"| Confirm["Confirm deletion or detachment"]
    Confirm --> Cleanup["Delete managed resources<br/>detach adopted resources; retain nodes"]
    Cleanup --> Pending{"Pending or failed cleanup?"}
    Pending -->|"Yes"| Wait["Poll CloudFront deletion or inspect failure<br/>retry remaining cleanup"] --> Details
    Pending -->|"No"| Review
```

Autosave preserves canvas edits through incremental node/edge APIs. Save and
Apply blueprint both replace the full graph, regenerate persisted node IDs, and
remap references. Apply blueprint overwrites the graph rather than merging it.
Neither action provisions AWS resources. Publish first waits for queued saves;
its completion does not guarantee every resource has reached AWS readiness.

Configuration changes to a live resource are blocked by the current node PATCH
handler, even where forms describe publish-time updates. Delete or detach the
resource before changing its configuration. Position and label edits remain
separate from AWS configuration changes.

Single-resource cleanup retains the canvas node. Delete all resources retains
the graph too; whole-sketch deletion removes the graph and conversation after
cleanup succeeds. CloudFront propagation can require keeping the editor open
and retrying the remaining bulk or sketch deletion later. S3 bucket cleanup
removes contents, including versions; ECR cleanup uses forced repository deletion.

### Source entry points

- [Dashboard guard](../client/src/app/dashboard/page.tsx), [sketch index](../client/src/components/dashboard/SketchIndex.tsx), [connection settings](../client/src/components/dashboard/AwsConnectionsPanel.tsx)
- [Editor and autosave](../client/src/components/graph/GraphEditor.tsx), [publish control](../client/src/components/graph/PublishSketchButton.tsx), [AI composer](../client/src/components/graph/AiComposer.tsx)
- [S3 object panel](../client/src/components/graph/BucketObjectsPanel.tsx), [invalid-session handler](../client/src/components/auth/InvalidSessionHandler.tsx)
- [Server lifecycle and edit guards](../server/src/controllers/infrastructureController.ts), [AI detail](#ai-request-flow), [deployment detail](#deployment-lifecycle)

<a id="deployment-lifecycle"></a>

## Deployment lifecycle

Publish runs sequentially within the Express request. There is no external job
queue or transaction spanning AWS calls and PostgreSQL. Earlier successful
resources remain after a later failure; cleanup is explicit.

### Publish and readiness

```mermaid
flowchart TD
    Start["POST /api/sketches/:sketchId/deploy<br/>with connectionId"] --> Guard["Verify JWT, ownership, connection<br/>and non-empty sketch"]
    Guard --> Plan["Validate graph attachments and cycles<br/>build requests; check S3 origin constraints"]
    Plan --> Credentials["Require encryption key<br/>decrypt connection credentials"]
    Credentials --> Existing["Check stored resource state and outputs<br/>reject active operations and unresolved resources"]
    Existing --> Record["Set sketch connection<br/>create PENDING Deployment"]
    Record --> Next{"Next node in<br/>topological order?"}
    Next -->|"Yes"| Ready["Wait for direct source resources<br/>to reach RUNNING; refresh their outputs"]
    Ready --> ReadyOK{"Dependencies ready<br/>within timeout?"}
    ReadyOK -->|"No"| Blocked["Record FAILED deployment<br/>return blocked outcome; retain prior resources"]
    ReadyOK -->|"Yes"| Resolve["Resolve source output references<br/>build concrete AWS request"]
    Resolve --> Running{"Existing resource<br/>is RUNNING?"}

    Running -->|"Yes"| Changed{"Resolved config changed?"}
    Changed -->|"No"| Skip["Record skipped outcome"] --> Next
    Changed -->|"Yes"| Mutable{"Managed resource and<br/>supported mutable fields?"}
    Mutable -->|"No"| Conflict["Return conflict"]
    Mutable -->|"Yes"| Update["Call service update handler<br/>save desired config and returned state"]
    Update --> UpdateOK{"Update succeeds?"}
    UpdateOK -->|"No"| Conflict
    UpdateOK -->|"Yes"| Updated["Record updated outcome<br/>CloudFront remains PROVISIONING"] --> Next

    Running -->|"No"| Upsert["Upsert AwsResource as PROVISIONING<br/>set managed flag from resource mode"]
    Upsert --> Create["AWSResourceManager.createResource<br/>create or adopt existing resource"]
    Create --> Created{"Creation and setup succeed?"}
    Created -->|"No"| Failed["Record resource and deployment FAILED<br/>save error and partial identifiers when available"]
    Failed --> Return["Return 409 for S3 name conflict<br/>or 502 for other creation failure"]
    Created -->|"Yes"| Outputs["Save externalId and actualState<br/>cache outputs; invalidate catalog"]
    Outputs --> Status["Mark RUNNING initially<br/>CloudFront stays PROVISIONING"] --> Next
    Next -->|"No"| Success["Mark Deployment SUCCEEDED<br/>and Sketch ACTIVE; return outcomes"]
    Success --> Poll["Editor POSTs resource refresh<br/>on load and periodic timer"]
    Poll --> Describe["Describe AWS resources in bounded batches<br/>update status, actualState and lastError"]
    Describe --> UI["Merge resource snapshots into UI<br/>preserve edited node configuration"]
```

Early guard/plan/decryption failures return before the deployment loop. The
diagram groups those checks for readability. The default dependency wait is
90 seconds with a 3-second interval. Resource refresh defaults to batches of four;
the editor interval defaults to 30 seconds, with a 10-second minimum.

`SUCCEEDED` records completion of the publish loop. Creation normally marks a
resource `RUNNING` before a later describe refresh; CloudFront is explicitly kept
`PROVISIONING`. Dependency waits verify readiness before a dependent node starts.
These statuses are application observations, not a guarantee of application health.

The existing-resource update branch is implemented in `deploySketch`, but normal
canvas config updates are blocked for live resources by `updateSketchNode`.
Some conflict/update exits after creating a deployment return without marking its
record failed, leaving it `PENDING`. Preflight state checks are not an atomic lock:
concurrent requests can pass them. The diagram does not imply automatic rollback,
durable recovery, or exactly-once execution.

### Supported dependency and output flow

```mermaid
flowchart LR
    Key["KEY_PAIR"] -->|"keyName"| EC2["EC2_INSTANCE"]
    SG["SECURITY_GROUP"] -->|"securityGroupId"| EC2
    Role["IAM_ROLE"] -->|"roleArn"| Lambda["LAMBDA_FUNCTION"]
    Bucket["S3_BUCKET"] -->|"bucketName"| CDN["CLOUDFRONT_DISTRIBUTION"]
    Independent["Independent nodes:<br/>ECR_REPOSITORY, DYNAMODB_TABLE,<br/>SQS_QUEUE, SNS_TOPIC"]
```

An edge points from a dependency to its consumer. References use exact values
such as `${bucket-node.bucketName}` and require a direct incoming dependency edge.
They are not arbitrary string interpolation. Import remaps source IDs to database
IDs; deployment resolves references against stored or freshly retrieved outputs.
The four independent types can coexist on a canvas but have no supported
attachments. An SNS-to-SQS line, for example, would not create a subscription.
EC2 instance profiles are selected from the catalog; the graph does not implement
an IAM-role-to-EC2 attachment.

### Cleanup and pending CloudFront deletion

```mermaid
flowchart TD
    Request["Confirmed single, bulk,<br/>or whole-sketch deletion"] --> Order["Bulk and sketch: reverse dependency order<br/>single: operate on selected resource"]
    Order --> Item{"Next selected resource?"}
    Item -->|"Yes"| Managed{"Managed resource<br/>with external ID?"}
    Managed -->|"No"| Detach["Mark TERMINATED locally<br/>leave adopted AWS resource intact"] --> Item
    Managed -->|"Yes"| Delete["Create termination Deployment<br/>mark DELETING; call AWS delete"]
    Delete --> Result{"Delete result?"}
    Result -->|"Deleted or already missing"| Terminated["Mark TERMINATED<br/>finalize receipt and clear error"] --> Item
    Result -->|"CloudFront pending"| Pending["Leave DELETING<br/>stop bulk or sketch cleanup"]
    Pending --> Refresh["Workspace refresh retries CloudFront delete<br/>wait for disabled distribution propagation"]
    Refresh --> Propagated{"Ready for final cleanup?"}
    Propagated -->|"No"| Pending
    Propagated -->|"Yes"| Final["Remove bucket-policy grant,<br/>distribution and OAC; mark TERMINATED"]
    Final --> Retry["Retry bulk or sketch deletion<br/>to process remaining resources"] --> Order
    Result -->|"Error"| Error["Record FAILED and lastError<br/>stop cleanup; inspect and retry"]
    Item -->|"No"| Finish{"Requested operation"}
    Finish -->|"Single resource"| Keep["Keep canvas node"]
    Finish -->|"All resources"| Draft["Keep graph; set Sketch DRAFT"]
    Finish -->|"Whole sketch"| Remove["Delete sketch and cascading child records"]
```

Already terminated records are skipped. Bulk cleanup stops on the first pending
or failed result. If graph planning fails, its implementation falls back to reverse
node order; it is not an AWS dependency discovery engine. Single-resource deletion
does not walk dependents, so AWS can reject an in-use resource.

The refresh path advances CloudFront deletion only while called; there is no
background cleanup daemon. A termination deployment can be marked `SUCCEEDED`
when asynchronous deletion is merely accepted, while the resource is `DELETING`.
Failed CloudFront setup and recorded incomplete setup are excluded from ordinary
refresh so errors remain available for explicit cleanup. S3 deletion clears object
versions and delete markers; ECR deletion is forced. These actions can remove data.

### Source entry points

- [Deployment and cleanup controller](../server/src/controllers/infrastructureController.ts), [resource dispatcher](../server/src/services/aws/index.ts)
- [Deployment graph and reference resolution](../server/src/services/aws/graph.ts), [readiness helper](../server/src/services/aws/readiness.ts), [timing/concurrency settings](../server/src/lib/config.ts)
- [Contract graph rules](../contracts/src/index.ts), [resource schema](../contracts/graph.schema.json)
- [CloudFront lifecycle](../server/src/services/aws/resources/cloudfront.ts), [S3 cleanup](../server/src/services/aws/resources/s3.ts), [ECR cleanup](../server/src/services/aws/resources/ecr.ts)
- [Editor polling](../client/src/components/graph/GraphEditor.tsx), [poll interval](../client/src/lib/config.ts)

<a id="ai-request-flow"></a>

## AI request flow

The active agent graph uses Groq for route selection and structured AWS builds,
and NVIDIA NIM for general conversation with tools. Although a `Llama` wrapper
exists, the compiled graph does not use it. Responses are returned as a single
JSON result; the current UI does not stream tokens.

### Persisted sketch conversation

```mermaid
flowchart TD
    Ask["User submits message in AiComposer"] --> API["POST /api/sketches/:sketchId/conversation/messages"]
    API --> Check["Verify API JWT and sketch ownership<br/>trim content; enforce 8,000-character limit"]
    Check --> Store["Transaction: upsert conversation,<br/>save USER message, load prior text history"]
    Store --> Context["Try sketch connection, otherwise active connection<br/>fetch bounded AWS catalog context"]
    Context --> Adapter["AIService sends query, history, context<br/>optional connection_id and user tool_token"]
    Adapter --> FastAPI["FastAPI POST /api/agent/query<br/>Pydantic request validation"]
    FastAPI --> Bind["Bind request-local AWS tool context<br/>invoke LangGraph with recursion limit 10"]
    Bind --> Route["Groq ModelRouter classifies current query"]
    Route --> Branch{"Route decision"}
    Branch -->|"AWS"| Budget["Trim history and compact catalog"]
    Budget --> Build["Groq AwsRouter<br/>structured Pydantic BuildResponse"]
    Build -->|"Success"| Return["Return text or build response envelope"]
    Build -->|"HTTP 413"| Retry["Retry once without optional<br/>context and history"] --> Return
    Branch -->|"GENERAL"| Model["NVIDIA model<br/>history, context and tool messages"]
    Model --> Calls{"Tool calls present?"}
    Calls -->|"No"| Text["Create text final_response"] --> Return
    Calls -->|"Yes"| Tools["Execute requested tools"]
    Tools --> Support["CloudCanvas resource support guidance"]
    Tools --> Search["DuckDuckGo web search"]
    Tools --> Catalog["AWS catalog callback to Express<br/>connection ID and user Bearer JWT"]
    Catalog --> Owned["Verify JWT and connection ownership<br/>read cached or fresh AWS catalog"]
    Support --> Results["Append tool results"]
    Search --> Results
    Owned --> Results
    Results --> Model

    Return --> Validate["Express validates envelope and response shape<br/>validate build through shared graph contract"]
    Validate --> Save["Persist ASSISTANT TEXT or BUILD message<br/>store blueprint JSON for builds"]
    Save --> Show["Show advice or blueprint card"]
    Show --> Apply{"User chooses<br/>Apply blueprint?"}
    Apply -->|"No"| Continue["Keep graph; continue conversation"]
    Apply -->|"Yes"| Import["Client validates graph YAML<br/>PUT /api/sketches/:sketchId/import"]
    Import --> Gate{"Valid graph and all resource<br/>records TERMINATED or absent?"}
    Gate -->|"No"| Rejected["Show error; leave graph unchanged"]
    Gate -->|"Yes"| Replace["Transaction: replace nodes and edges<br/>remap output references; increment version"]
    Replace --> Reload["Reload canvas; review and configure draft"]
    Reload --> Publish["User separately chooses Publish"]
```

The budget step describes request preparation and the optional retry around the
build call. The tool loop is bounded by LangGraph's recursion limit. NVIDIA has a
configured 110-second request timeout; the Express adapter has a 120-second
request timeout, which is not a durable job deadline or cancellation mechanism.

The controller sends prior conversation text plus catalog context; it does not
automatically serialize the current canvas into AI context. If catalog context
cannot be fetched, it falls back to empty context. Tools require a connection and
the forwarded API JWT; without them the catalog tool returns an error. The JWT is
held in request-local tool context, not included in the model's prompt inputs.

The backend saves the user message before calling AI. On failure it returns an
error and the saved message identifiers, and the UI reloads the conversation.
There is no automatic assistant-message retry or idempotency key. Adapter error
mapping is 400 for an invalid local request, 504 for timeout, 503 for unavailability,
and 502 for other upstream/response errors. Pydantic validation at FastAPI can
reject input before graph execution.

FastAPI currently accepts the query route without a service key; only its catalog
callback re-enters the authenticated Express boundary. The Python schema and
TypeScript graph contract are separate definitions. Successful model structure
validation is followed by Express graph validation, so generated output can still
be rejected. A valid draft may also need user choices such as an AMI or Lambda ZIP
before it can be deployed.

### Other supported API operations

```mermaid
flowchart LR
    Direct["Authenticated caller<br/>POST /api/sketches/ai"] --> Query["Same AIService and FastAPI graph<br/>query and optional caller history"]
    Query --> Type{"Response type"}
    Type -->|"text"| Text["Return text; create no sketch"]
    Type -->|"build"| Validate["Validate shared graph contract"]
    Validate --> Persist["Transaction: create new draft sketch<br/>persist nodes, edges and remapped references"]
    Persist --> Result["Return saved sketch<br/>no AWS deployment"]
```

The direct creation endpoint does not use the persisted conversation controller
or add its catalog/tool context. It is available in the server API but has no
current dashboard entry point. Conversation GET loads messages, and conversation
DELETE clears that conversation and its messages without deleting the sketch or
resources.

### Source entry points

- [AI composer](../client/src/components/graph/AiComposer.tsx), [blueprint application](../client/src/components/graph/GraphEditor.tsx)
- [Conversation controller](../server/src/controllers/conversationController.ts), [AI adapter](../server/src/services/aiService.ts), [direct creation and import](../server/src/controllers/infrastructureController.ts)
- [FastAPI query route](../service/routers/agent.py), [compiled graph](../service/agents/graph.py), [graph nodes](../service/agents/nodes.py), [Pydantic schemas](../service/schemas/agent.py)
- [Groq routing and budget handling](../service/services/router.py), [NVIDIA wrapper](../service/models/nvidia.py), [model settings](../service/config/models.py)
- [AWS catalog tool](../service/tools/aws_catalog.py), [support tool](../service/tools/cloudcanvas.py), [search tool](../service/tools/search.py)

<a id="cloudfront-delivery"></a>

## CloudFront and S3 delivery

Connect an S3 bucket node to a CloudFront distribution node. Publish resolves
the bucket reference and creates a private S3 REST origin using Origin Access
Control (OAC), HTTPS redirects, and managed security headers. The resource details
show the distribution ID, ARN, HTTPS URL, and AWS propagation status.

The bucket must be in the sketch connection's region and use SSE-S3. CloudFront
API calls use us-east-1 because distributions are global. Existing bucket policy
statements are preserved; the distribution receives its own scoped read grant.
Public access is blocked on the origin bucket.

**Current UI/API qualification:** update handlers exist, but the normal node PATCH route blocks configuration changes to live resources. The settings below describe handler support, not a qualified end-to-end update journey; see [deployment lifecycle](#deployment-lifecycle).

Supported updates: origin path, default document, description, enabled state,
price class, caching mode, and SPA fallback. Changing the origin bucket requires
a replacement distribution. Caching defaults to disabled; optimized caching uses
the AWS managed policy. Publish creates the bucket before creating its connected
distribution and waits for the bucket to become available. Once the bucket is
running, open its node to upload files or folders, create folders, browse objects,
and delete them. Files go directly to S3 using a short-lived signed POST; the
server only signs the upload and lists metadata. Each upload is limited to 100 MB.
Set `FRONTEND_URL` to the web app origin so uploads can configure S3 CORS.
This integration does not build code, configure custom domains or access logs,
or support KMS-encrypted origins. Optimized caching can keep earlier files at
edge locations until they expire; use disabled caching while iterating.

Deletion first disables the distribution. Resource polling waits for propagation,
then deletes it and its OAC and removes its bucket-policy grant. Keep the workspace
open for polling or retry deletion later. Sketch deletion returns a pending message
without deleting the origin prematurely; retry once the distribution is terminated.
Failed setup/cleanup remains visible for explicit retry or deletion.

The connection needs CloudFront distribution create/get/update/delete, managed
cache and response-header policy listing, and OAC create/get/delete permissions.
It also needs s3:GetEncryptionConfiguration, s3:PutBucketPublicAccessBlock,
s3:GetBucketPolicy, s3:PutBucketPolicy, and s3:DeleteBucketPolicy on the origin.
Browsing and content management need s3:ListBucket, s3:PutObject and
s3:DeleteObject. Browser uploads also need s3:GetBucketCORS and
s3:PutBucketCORS; existing CORS rules are preserved. Existing S3 creation
permissions remain separate.

Tests mock AWS calls; live deployment and CDN delivery have not been verified.

<a id="docker-setup"></a>

## Docker Compose setup

Run commands from the repository root. Docker Engine and Docker Compose with
BuildKit support are required. The Compose stack includes the client, Express
server, Python AI service, and a dedicated PostgreSQL 16 database.

### Environment files

Create any missing files from the examples, then fill in their values:

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
cp service/.env.example service/.env
```

Do not overwrite existing env files. Compose reads exactly `client/.env`,
`server/.env`, and `service/.env`; it does not read `client/.env.local`.
No root `.env` file is needed. Configure Google credentials and the NextAuth
secret in the client file, JWT and AWS encryption secrets in the server file,
and model-provider keys in the AI service file.

The client file also supplies build-time public settings through a temporary
BuildKit secret mount. `NEXT_PUBLIC_HTTP_SERVER_BASE_URL` must be reachable from
the user's browser, normally `http://localhost:9000`. After changing `NEXT_PUBLIC_*`
settings, run `docker compose build --no-cache client` and recreate the client.
BuildKit secret contents do not invalidate the build cache, and runtime env alone
cannot update the compiled browser bundle. The env file itself is excluded from image layers.
See [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
and [Docker build secrets](https://docs.docker.com/build/building/secrets/).

Compose intentionally overrides these values from the per-service files:

| Service | Override | Reason |
| --- | --- | --- |
| Client | `HTTP_SERVER_BASE_URL=http://server:9000` | NextAuth/server-side API calls use Docker DNS; browser calls retain the public API URL |
| Client | `NEXTAUTH_URL=http://localhost:3000` | Local browser callback URL |
| Server | `DATABASE_URL=postgresql://postgres:dev@postgres:5432/cloudcanvas` | Use the bundled database, leaving the host database untouched |
| Server | `MICROSERVICE_BASE_URL=http://service:8000` | Reach FastAPI on the internal network |
| AI service | `CLOUDCANVAS_SERVER_URL=http://server:9000` | Catalog tools call back to Express |
| Applications | Fixed internal ports, production Node environment, bind hosts | Match published ports and container networking |

All other settings come from each service's env file via
[Compose `env_file`](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).
For a different public hostname, update the public client URL, server
`FRONTEND_URL`, and Compose `NEXTAUTH_URL`/published ports together, then rebuild.
The database credentials above are local-development defaults, not production
secrets; change both the PostgreSQL environment and server URL before deploying
elsewhere. PostgreSQL and FastAPI are only exposed on the internal Compose network.

### Start, inspect, and stop

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs -f server service
```

Open `http://localhost:3000`; the browser API is at `http://localhost:9000`.
The server waits for healthy PostgreSQL and FastAPI, then runs
`prisma migrate deploy` before starting. This applies the checked-in migrations
to the bundled database and preserves its data in the `postgres_data` volume.
The client starts after the server health check passes. Health checks establish
process readiness; they do not verify model credentials or AWS permissions.

```bash
docker compose down
```

Stopping the stack retains database data. `docker compose down --volumes` deletes
the bundled database volume and all data in it. It does not clean up AWS resources;
delete managed AWS resources through CloudCanvas before discarding their records.

### Image builds

Every build uses the repository root as context. Client/server images build
`contracts` first, preserving the `/app/contracts` sibling location required by
their `file:../contracts` dependency. The checked-in npm locks drive installation;
no client Bun lock exists. The server generates Prisma before TypeScript compilation.

```bash
docker build -f docker/Dockerfile.server -t cloudcanvas-server:local .
docker build --secret id=client_env,src=client/.env -f docker/Dockerfile.client -t cloudcanvas-client:local .
docker build -f docker/Dockerfile.service -t cloudcanvas-service:local .
```

The root `.dockerignore` excludes env files, local dependencies, generated Prisma,
logs, and build outputs. Prisma migration tooling remains installed in the server
image because Compose runs it at startup. Provider requests and AWS provisioning
still require valid credentials and network access.

<a id="research-comparison"></a>

## Research comparison, differentiation and learnings

CloudCanvas implements a concrete AWS-focused workflow that connects visual resource design, schema-checked AI drafts, explicit user review, and SDK-based deployment with stored resource state. **The defensible contribution is this integration and its bounded intermediate graph; the reviewed evidence does not establish a new graph algorithm, a new foundation model, or superiority over existing platforms.** Visual cloud modeling and topology-based execution already appear in Winery and OpenTOSCA, while modern IaC research separates syntax, intent, security and deployability rather than treating them as one success condition. Commercial tools, especially Massdriver, also combine visual composition, contracts and deployment. The ten original PDFs and their exact publication/version details are in the [research library](#paper-catalog); the analysis below explains what each implements, how it relates to this codebase, and what to learn from it. Proposed advantages, inferences and future work are explicitly distinguished from implemented features and measured results. ([Winery](https://doi.org/10.1007/978-3-642-45005-1_64), [OpenTOSCA](https://doi.org/10.1007/978-3-642-45005-1_62), [IaC-Eval](https://papers.nips.cc/paper_files/paper/2024/hash/f26b29298ae8acd94bd7e839688e329b-Abstract-Datasets_and_Benchmarks_Track.html), [Massdriver](https://docs.massdriver.cloud/).)

**Review date:** 2026-10-29. **Source baseline:** `3fb7def7d852d52177fb343c7d8f793588f5d9b3`. This is a targeted related-work review, not an exhaustive literature, novelty or patent search. Paper citations use physical PDF page numbers, including repository covers. Product descriptions reflect official documentation retrieved on the review date and were not independently benchmarked.

### CloudCanvas already connects design and execution, with important limits

The current project has a Next.js/React Flow client, an Express application API, a FastAPI/LangGraph AI service, PostgreSQL persistence and a shared TypeScript graph contract. The contract is a library used by client and server, not an independently deployed service. Python maintains separate Pydantic schemas; Express checks returned AI builds against the shared contract before accepting them. This creates a common structural boundary without proving that the separate language definitions can never diverge. ([Contract](../contracts/src/index.ts), [AI adapter](../server/src/services/aiService.ts), [Python schemas](../service/schemas/agent.py), [Compose](../docker-compose.yml).)

| Implemented area | What the source actually does | Evidence and qualification |
| --- | --- | --- |
| Bounded AWS model | Supports EC2 instances, key pairs, security groups, ECR, S3, IAM roles, Lambda, DynamoDB, SQS, SNS and CloudFront: **11 node types**. | [Contract `AwsService`](../contracts/src/index.ts); this is a curated AWS subset, not arbitrary AWS coverage or multi-cloud support. |
| Attachment semantics | Accepts key pair → EC2, security group → EC2, IAM role → Lambda and S3 → CloudFront. References require direct dependency edges. | [Contract `canConnectResources` and `validateReferences`](../contracts/src/index.ts). Edges are supported provisioning relationships, not arbitrary network traffic or SNS subscriptions. |
| Structural validation | Uses JSON Schema/AJV, YAML parsing restrictions, duplicate-node/edge checks, compatible attachments and cycle checks. | [Contract validation](../contracts/src/index.ts), [JSON Schema](../contracts/graph.schema.json). These checks do not prove least privilege or prompt intent. |
| Editable workspace | Supports forms, incremental node/edge persistence, position changes, queued debounce saves, undo/redo and resource output views. | [Editor `persistCanvas`](../client/src/components/graph/GraphEditor.tsx), [history](../client/src/hooks/useCanvasHistory.ts). |
| AI generation and advice | Routes AWS build requests through the structured Groq branch and general conversation through NVIDIA with tools for support guidance, web search and AWS catalog lookup. | [Active agent graph](../service/agents/graph.py), [nodes](../service/agents/nodes.py). A separate Llama wrapper exists but is not wired into this graph. |
| Account grounding | Supplies bounded catalog context and an authenticated catalog callback; Express handles decrypted AWS credentials. Catalog failure can yield empty context. | [Conversation `awsCatalogContext`](../server/src/controllers/conversationController.ts), [catalog tool](../service/tools/aws_catalog.py). No grounding accuracy experiment has been performed here. |
| Review before change | Displays a build for explicit Apply blueprint, then requires a separate Publish action. Apply/Save replace the graph transactionally and remap references. | [AI composer](../client/src/components/graph/AiComposer.tsx), [graph replacement](../server/src/controllers/infrastructureController.ts). Replacement is blocked while any associated resource is non-terminated; it is not a merge. |
| Dependency-aware execution | Plans topological order, waits for direct source readiness, resolves output references and calls AWS SDK resource handlers sequentially. | [Controller `deploySketch`](../server/src/controllers/infrastructureController.ts), [output resolution](../server/src/services/aws/graph.ts), [readiness](../server/src/services/aws/readiness.ts). Execution runs inside the HTTP request. |
| Stored lifecycle evidence | Persists desired configuration, observed state, external IDs, management ownership, errors, deployment requests/results and conversations. | [Prisma models](../server/prisma/schema.prisma). Stored observations are not a complete drift-reconciliation engine. |
| Cleanup and adoption | Detaches adopted EC2/key-pair/security-group resources locally; deletes managed resources. Bulk cleanup reverses graph order and stops on pending/failure. | [Cleanup controller](../server/src/controllers/infrastructureController.ts). S3 cleanup removes versions/content and ECR deletion is forced: these operations can destroy data. |
| Static-site delivery | Creates private S3/CloudFront infrastructure with OAC and scoped bucket policy; supports direct signed browser uploads, with a 600-second form expiry and 100-MiB bound. | [CloudFront](../server/src/services/aws/resources/cloudfront.ts), [object service](../server/src/services/aws/resources/objects.ts). It does not build frontend code or configure arbitrary custom domains. |
| Local packaging | Builds contracts before both Node applications and generates Prisma; Compose includes four containers, env-file loading, health checks, migrations and a database volume. | [Docker setup](#docker-setup), [client image](../docker/Dockerfile.client), [server image](../docker/Dockerfile.server). This packages CloudCanvas itself, not a user-facing Docker deployment feature. |

The strongest implementation boundary is **AI proposes a graph; controlled application code validates and executes supported operations**. The model is not directly given an unrestricted AWS mutation tool. That design is useful, but catalog access still delegates the user's API token and therefore needs explicit privilege and expiry decisions. Review gates also do not replace server-side authorization or secure identity verification. ([AI adapter](../server/src/services/aiService.ts), [catalog callback](../service/tools/aws_catalog.py), [publish control](../client/src/components/graph/PublishSketchButton.tsx).)

Several current limitations materially constrain any claim of “better.” The public Express Google exchange accepts profile fields without independently verifying a Google token, and FastAPI's query endpoint has no service-authentication guard. Publish lacks atomic per-sketch reservation, a durable worker, an idempotency key and automatic rollback; certain exits after deployment creation leave a `PENDING` receipt. Normal node PATCH rejects live AWS configuration changes even though the dispatcher contains update handlers, so editable forms are not evidence of a complete update journey. ([Google handler](../server/src/controllers/authController.ts), [public auth routes](../server/src/routes/authRouter.ts), [FastAPI route](../service/routers/agent.py), [`deploySketch` and `updateSketchNode`](../server/src/controllers/infrastructureController.ts).)

Status also needs careful interpretation. The editor triggers refresh on load and periodically, by default every 30 seconds. Most successful creation returns initially become `RUNNING`; CloudFront stays `PROVISIONING`, with asynchronous deletion continued through refresh. Neither a publish receipt nor an application status proves workload health. The previous Docker task recorded three image builds, 39 server tests, 13 Python tests, seven migrations and an isolated HTTP smoke test on 2026-10-28. Those are **historical local receipts**, not new research experiments or live AWS, Google or model qualification. ([Editor polling](../client/src/components/graph/GraphEditor.tsx), [interval](../client/src/lib/config.ts), [resource state transitions](../server/src/controllers/infrastructureController.ts), [existing validation scope](../README.md#validation).)

### Ten papers establish the relevant prior art and evaluation methods

#### P01 — Winery establishes visual topology editing before this project

**What the paper implements.** Winery provides an HTML5 topology modeler, a type/element manager, a REST-backed repository, reusable node/relationship definitions and CSAR import/export. Its Moodle example uses two EC2 VMs to demonstrate composition. The modeling tool itself does not include a deployment runtime or integrated management-plan editing; external plans and runtimes supply execution. The paper is a demonstration, not a controlled performance or usability comparison. ([Source](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-46-Winery_A_Modeling_Tool_for_TOSCA-based_Cloud_Applications.pdf), [local PDF](research/01-winery-modeling-tool.pdf), pp. 3–6.)

**CloudCanvas relationship and inference.** Typed browser-based cloud design is established prior art. CloudCanvas adds AI draft review and SDK lifecycle operations to its own AWS-specific representation, but cannot claim to invent the canvas. **Learning:** keep resource types, connection semantics and forms aligned; reusable verified blueprints are a sensible extension, not an implemented research result.

#### P02 — OpenTOSCA separates a deployment model from its execution runtime

**What the paper implements.** OpenTOSCA consumes CSAR packages through importer/control logic, implementation-artifact handling and a plan engine. A portability API exposes topology, endpoints and instance information to workflows. The prototype provisions a Moodle stack's VMs, server, database and connecting configuration, returning its URL. The 2013 implementation is imperative and plan-based; declarative processing is future work in that paper. Its evidence establishes prototype feasibility, not quantified reliability. ([Source](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-45-OpenTOSCA_A_Runtime_for_TOSCA-based_Cloud_Applications.pdf), [local PDF](research/02-opentosca-runtime.pdf), pp. 3–5.)

**CloudCanvas relationship and inference.** Graph-led execution and instance state are not new contributions. CloudCanvas's HTTP-request SDK loop is simpler in scope, but simplicity does not establish reliability. **Learning:** retain the separation between desired model, executable actions and observed state, then make actions resumable and guarantee failure finalization before expanding autonomy.

#### P03 — CAMEL shows that runtime models extend beyond resource status

**What the paper implements.** CAMEL integrates deployment, requirements, provider, metric, scalability and execution sublanguages. It distinguishes provider-independent/type-level models from provider-specific runtime instances for the PaaSage workflow. A study with 23 practitioners uses questionnaires and the Technology Acceptance Model; perceived usefulness exceeds ease of use, with a paired comparison reported at p=.005. Participants come from collaborating organizations, and the language study does not evaluate full-platform deployment performance. ([Source](https://link.springer.com/article/10.1186/s13677-019-0138-7), [local PDF](research/03-camel-cloud-modeling.pdf), pp. 3, 7, 18–21.)

**CloudCanvas relationship and inference.** Stored resource state is useful but narrower than adaptive, multi-aspect runtime modeling. The study provides no evidence that CloudCanvas is easier or faster. **Learning:** evaluate time-to-correct-result and recovery effort with actual users; SLOs, scaling policy and closed-loop adaptation belong in future-work discussions until implemented.

#### P04 — EDMM provides a vocabulary for honest coverage comparisons

**What the paper implements.** The Essential Deployment Metamodel review identifies 56 technologies and analyzes 13 against a common deployment scenario. It extracts components, relations, types, properties, operations and artifacts, explaining restrictions in mappings to specific technologies. Selection uses 2019 popularity/search criteria and licensing/scope exclusions, while the reference scenario is deliberately simplified. This is a metamodel and comparison study, not a runtime benchmark or proof that every deployment representation is semantically interchangeable. The article appeared online in 2019 and in a 2020 journal issue; the stored file is author preprint v2. ([Source](https://arxiv.org/abs/1905.07314), [local PDF](research/04-essential-deployment-metamodel.pdf), pp. 2–4, 6–11.)

**CloudCanvas relationship and inference.** Its four attachment pairings should be documented as explicit semantics rather than generic architecture edges. **Learning:** a future Terraform/CloudFormation exporter needs tests for behavioral coverage and loss of meaning, not just valid serialization.

#### P05 — DOML demonstrates stronger assurance than schema validation alone

**What the paper implements.** DOML separates application, abstract-infrastructure and concrete-infrastructure layers, supports extensibility and generates IaC including Terraform, Ansible and Compose. Its Z3-backed checker evaluates declarative model properties. A modified WordPress case exposes mapping/network defects; Table 5 reports sub-second checking in that scenario. A separate SI-MPA case involves five experienced team members, including an author. The paper cautions that a few deployments and code-size comparisons do not constitute a general ease-of-use evaluation. ([Source](https://repositum.tuwien.at/handle/20.500.12708/203669), [local PDF](research/05-doml-modeling-infrastructure.pdf), pp. 4–7, 12–18, 20.)

**CloudCanvas relationship and inference.** AJV and graph checks establish supported structure, not network reachability or policy correctness. **Learning:** introduce declared infrastructure invariants and bounded verification. A smaller AWS-specific schema offers a focused scope; whether that improves usability needs measurement.

#### P06 — IaC-Eval distinguishes executable structure from requested intent

**What the paper implements.** IaC-Eval supplies 458 expert-authored AWS/Terraform tasks with natural-language requirements and Rego intent specifications. It first produces a speculative deployment graph through `terraform plan`, then uses OPA to check required intent without actual deployment. Its historical GPT-4 pass@1 result is 19.36% in Table 1. The benchmark focuses on AWS/Terraform and excludes HCL function-generation coverage. These results concern the paper's model/configuration and cannot predict current Groq or NVIDIA performance. ([Source](https://papers.nips.cc/paper_files/paper/2024/hash/f26b29298ae8acd94bd7e839688e329b-Abstract-Datasets_and_Benchmarks_Track.html), [local PDF](research/06-iac-eval.pdf), pp. 3–4, 6, 8–9.)

**CloudCanvas relationship and inference.** A schema-valid graph can still omit the resource or attribute requested by a user. **Learning:** adopt graph-specific intent tests. Because CloudCanvas does not emit Terraform, reporting an IaC-Eval score would require a documented adapter and comparable task semantics.

#### P07 — Multi-IaC-Eval makes preservation during edits measurable

**What the paper implements.** Multi-IaC-Bench represents mutation as an initial template, a natural-language change and an expected template. Validation combines format linters, Checkov, an LLM semantic judge and a 60-sample human review. Experiments include 337 CloudFormation, 171 Terraform and 191 CDK templates, with CDK converted through CloudFormation. Retry ablations improve static compliance, but the authors explicitly exclude actual deployment testing and identify enterprise-scale/native-CDK limitations. No peer-reviewed venue was verified for the stored preprint. ([Source](https://arxiv.org/abs/2509.05303), [local PDF](research/07-multi-iac-eval.pdf), pp. 6–9.)

**CloudCanvas relationship and inference.** Replacing a complete graph is not a safe incremental mutation engine. **Learning:** evaluate preservation of unaffected nodes/attributes, add a change preview, and count unintended edits. Static success rates must not be labeled live deployment success.

#### P08 — TerraFormer turns verifier feedback into model training

**What the paper implements.** TerraFormer uses Terraform validation/planning and OPA/Rego feedback to construct training data and support supervised-plus-reinforcement fine-tuning. Table 2 reports 31.44% IaC-Eval correctness for the 14B SFT+RL variant versus 15.50% for the base model: an **absolute 15.94 percentage-point gain**. Correctness remains relative to encoded policies; its security metric averages passed Checkov checks per instance, rather than counting entirely secure deployments. The stored PDF is an arXiv author version of the ICSE 2026 SEIP paper. ([Source](https://arxiv.org/abs/2601.08734), [conference entry](https://conf.researchr.org/details/icse-2026/icse-2026-software-engineering-in-practice/43/TerraFormer-Automated-Infrastructure-as-Code-with-LLMs-Fine-Tuned-via-Policy-Guided-), [local PDF](research/08-terraformer.pdf), pp. 3–7.)

**CloudCanvas relationship and inference.** Typed parsing is much narrower than policy-guided learning. **Learning:** make verifier feedback actionable before considering fine-tuning; this repository currently contains neither that training framework nor a comparable generation-accuracy result.

#### P09 — IaCGen shows why deployability is a separate experimental target

**What the paper implements.** IaCGen uses formatting, syntax and live-deployment feedback over DPIaC-Eval's 153 AWS CloudFormation scenarios across 58 services. Across six historical models, Table 2 reports 20.8–30.2% first-attempt deployability and 54.6–91.6% success within ten iterations. These are different budgets. Intent assessment samples 51 scenarios, with 25.2% satisfying both resource and attribute requirements across models. The 8.4% security result is filtered full-template Checkov compliance, excluding templates without applicable checks. Historical model/configuration scope limits transferability. The stored v3 is the FSE 2026 author version, first preprinted in 2025. ([Source](https://arxiv.org/abs/2506.05623), [conference entry](https://conf.researchr.org/details/fse-2026/fse-2026-research-papers/43/Deployability-Centric-Infrastructure-as-Code-Generation-Fail-Learn-Refine-and-Suc), [local PDF](research/09-deployability-centric-iac.pdf), pp. 4–11, 15–18.)

**CloudCanvas relationship and inference.** Unit tests do not provide comparable evidence. **Learning:** measure live creation, readiness, cleanup, intent and security separately, including partial failures and residual resources.

#### P10 — Cloud infrastructure agents need synchronization and oversight

**What the paper implements.** This position/preliminary-study preprint compares SDK, CLI, Terraform and web agents on Azure VM provisioning, updates and monitoring. Provisioning covers three tasks with eight trials each. Different underlying models limit comparability, and counted agent actions are not elapsed time. The architectural discussion proposes unified state, synchronization, policy checks, audit trails, fault tolerance and human supervision rather than presenting a completed universal cloud manager. No peer-reviewed venue was verified. ([Source](https://arxiv.org/abs/2506.12270), [local PDF](research/10-cloud-infrastructure-ai-agents.pdf), pp. 2–6.)

**CloudCanvas relationship and inference.** Apply/Publish review agrees with prior human-supervision proposals; direct SDK use is not evidence of superiority over these Azure agents. **Learning:** harden delegated access, reserve operations atomically and design interrupted-operation recovery before offering autonomous mutation.

### The credible contribution is a bounded integration, not universal superiority

A defensible project statement is: **“CloudCanvas implements an AWS-specific intermediate graph shared across visual editing, validated AI drafting, persistence and dependency-aware SDK execution, with explicit review before application and deployment.”** Each part is present in source, while the combination gives a concrete object to evaluate. The stronger statement “CloudCanvas is the first visual AI cloud deployment platform” is unsupported by the selected literature and commercial documentation. ([Contract](../contracts/src/index.ts), [adapter](../server/src/services/aiService.ts), [deployment controller](../server/src/controllers/infrastructureController.ts), [Massdriver contracts/composition](https://docs.massdriver.cloud/).)

| Comparison dimension | Relevant prior evidence | CloudCanvas's current position | Claim that still requires evidence |
| --- | --- | --- | --- |
| Visual typed topology | P01; P05; commercial visual tools | Implemented for a curated AWS graph | Lower learning effort or fewer design errors |
| Model-to-runtime execution | P02; P04 | SDK handlers, output references, state records | Better reliability, portability or recovery |
| Runtime adaptation | P03 | Periodic observation, not general adaptive reconciliation | Correct continuous drift detection/repair |
| Model/property assurance | P05 | Structural schema and dependency checks | Formal safety, semantic completeness or least privilege |
| Natural-language intent | P06; P08 | Structured drafts and catalog context | Higher intent accuracy than a matched baseline |
| Existing-infrastructure edits | P07 | Incremental manual saves; AI full replacement with guards | Reliable non-destructive AI mutation |
| Real deployment evaluation | P09 | Existing local mocked/unit and HTTP evidence | Measured AWS deployment and cleanup success |
| Agent supervision | P10; Neo | User Apply/Publish gates | Better review decisions or safer autonomous action |

This is a comparison of documented methods and implementation scope, not a binary claim that every paper lacks every unmentioned feature. Benchmarks, modeling languages, runtimes and products solve different parts of the problem. A model benchmark's lack of a canvas is not evidence that a canvas-based application outperforms its generation method.

Relative to a text-only chat answer, CloudCanvas enforces a supported graph boundary and offers a persistent, editable review surface. Relative to authoring Terraform for every supported operation, the SDK path removes that particular authoring requirement. Those are **observable workflow differences**, not measured reductions in mistakes or time. The trade-off is that CloudCanvas owns its lifecycle semantics: retries, partial state, concurrency, compatibility and safe cleanup cannot be delegated to a mature IaC engine by assumption. Its smaller interface can aid focused explanation, but also limits supported architectures and established IaC ecosystem integration. ([Graph validation](../contracts/src/index.ts), [review workflow](../client/src/components/graph/AiComposer.tsx), [SDK dispatcher](../server/src/services/aws/index.ts).)

The current work does not establish multi-cloud capability, a cost optimizer, automatic scaling, formal correctness, production security qualification or autonomous self-healing. Neither using two model providers nor wrapping them in LangGraph constitutes a new ML method. A stronger research contribution would be a reproducible result about when a bounded graph and explicit review improve supported AWS tasks, including the cases where they do not.

### Six commercial comparators define the surrounding product space

These descriptions are **vendor-stated capabilities retrieved on 2026-10-29**, not paid-product trials, independent security assessments or performance rankings. A missing entry in one documentation page is not treated as proof that a company lacks a feature.

| Company and product | Positively documented capability and status | Relationship to CloudCanvas — inference |
| --- | --- | --- |
| AWS — Infrastructure Composer | Visual CloudFormation/SAM composition, canvas/template synchronization, import/export and VS Code access. AWS announces standalone-console end of support on **2026-12-07**; that date is future relative to this review, and the VS Code experience remains. [Official documentation](https://docs.aws.amazon.com/infrastructure-composer/latest/dg/what-is-composer.html). | Native AWS visual-IaC comparator. CloudCanvas uses a narrower SDK-executed graph, not a claim of greater AWS coverage. |
| Brainboard | Drag/drop cloud-resource design, automatic Terraform code, credentials and Terraform/OpenTofu plan output from the design workflow. [Official guide](https://docs.brainboard.co/getting-started/fast-track). | Close visual design-to-deployment comparator. The graph-versus-IaC review representation differs; learning-time benefits need a controlled comparison. |
| Massdriver | Visual composition of reusable IaC bundles, JSON Schema input/output contracts, dependency validation, pipeline execution, state and compliance checks. [Official documentation](https://docs.massdriver.cloud/). | Particularly close prior art. It directly rules out broad novelty around typed visual composition plus deployment. CloudCanvas's exact resource-level AWS/AI workflow is the narrower comparison. |
| Pulumi — Neo | An infrastructure agent that investigates, previews changes and updates Pulumi code; access follows user permissions and connected-tool credentials, with approval settings. [Current official documentation](https://www.pulumi.com/docs/ai/concepts/neo/). | AI, state context and human approval are established product patterns. Canvas-first review is a different surface, not proof of equivalent governance or better outcomes. |
| Firefly | Desired/live drift detection, notifications, drift insight and generated remediation/PR workflows. [Official drift documentation](https://docs.firefly.ai/key-features/drift-detection). | Demonstrates why recording observations is not enough to claim drift management. Desired state, observed change, proposed remediation and authorized execution should remain distinct. |
| Spacelift | VCS-integrated multi-IaC worker runs, proposed/tracked runs, approvals, OPA/Rego policy enforcement and scheduled drift checks/reconciliation. [Official platform description](https://spacelift.io/platform/how-it-works). | Governance and lifecycle comparator. Its worker/policy model highlights gaps in request-driven execution; it is not presented as an identical canvas UI. |

**Positioning inference:** a transparent AWS learning/prototyping workspace is a plausible initial focus for CloudCanvas because its supported dependencies, catalog choices and outputs are inspectable. This is a proposal, not demonstrated product-market fit. Product pricing, customer counts, compliance badges and marketing speed claims are intentionally excluded from the comparison. Current Neo documentation was preferred to more detailed search snippets; product behavior can change after retrieval.

### The next research result should measure intent, execution and review separately

The highest-priority engineering work is safe, recoverable execution. The highest-value research question is whether the bounded intermediate graph, catalog grounding and explicit review change outcomes on a declared supported task set. These are recommendations derived from the reviewed evidence and source limitations; **none of the following proposals is claimed as already implemented**.

| Priority | Proposed work and inference basis | Evidence needed before claiming an improvement |
| --- | --- | --- |
| P0 — Secure trust boundaries | Verify Google identity server-side, authenticate FastAPI, and constrain delegated catalog privileges. Review gates alone do not establish authorization. | Forged-profile/token rejection, cross-user denial and delegated-token scope/expiry tests. |
| P0 — Make operations durable | Atomically reserve per-sketch operations, define idempotency, finalize every deployment receipt and recover interrupted work. P02/P10 and the current controller motivate this. | Concurrent-publish, timeout, process-crash and partial-create tests; duplicate/orphan counts and recovery outcomes. |
| P1 — Specify stronger intent/invariants | Add graph-specific requirement checks and declared security/network invariants, drawing on P05/P06/P08. | Separate structural, semantic and policy pass rates, including false acceptance and false rejection. |
| P1 — Explain planned changes | Show graph/config diffs and destructive effects before execution; separate replacement from future merge/mutation. P07 motivates preservation tests. | Unintended-edit rates and user detection of harmful changes, rather than only valid output counts. |
| P1 — Evaluate grounding | Compare fixed-model runs with and without catalog context/tools. | Invented/invalid identifier rate, regional compatibility, intent success, latency and token/API cost. |
| P1 — Interpret observed state | Normalize desired/live fields, identify supported drift and require approval for corrections. P03 and Firefly motivate the distinction. | Injected-drift precision/recall, stale-observation behavior and repair success within a stated field scope. |
| P2 — Qualify actual AWS lifecycle | Test creation, dependency readiness, adoption, teardown and CloudFront propagation in isolated accounts with bounded spend. P09 motivates live evidence. | Time-to-ready, complete cleanup, orphan count, residual spend and partial-failure outcomes. |
| P2 — Test usability rather than infer it | Compare manual, text-assisted and graph-reviewed workflows on matched tasks, following the need for empirical evidence illustrated by P03/P05. | Time-to-correct-result, task completion, correction effort, unsafe approvals and reported workload. |

A useful experiment would freeze the supported resource subset and distinguish simple single-resource tasks, valid dependency pairs, incomplete requests, unsupported architectures and edits to existing graphs. Preserve prompts, model/provider versions, temperatures, catalog snapshots, contract versions and retry budgets. Create requirements and policy expectations independently of generated output, and use held-out tasks so the evaluator does not merely reward examples embedded in prompts. Record refusals and failures, not just successful demonstrations.

For ablations, compare a text-oriented baseline, structured graph generation, graph generation with validation feedback, catalog-grounded graph generation, and catalog plus tools. Then evaluate the human-review stage separately. Keep underlying models and task sets matched where the experiment intends to isolate representation or grounding; otherwise label the comparison as an entire-system comparison. Report first-attempt results and fixed-budget retries separately, as P09 shows why those quantities cannot be merged into one success rate. ([IaCGen](https://arxiv.org/abs/2506.05623), [TerraFormer](https://arxiv.org/abs/2601.08734).)

Each stage needs its own denominator. Parse/schema success should count all attempted generations; intent success should count satisfaction of independently specified resources and attributes; security should distinguish per-check averages from complete-template compliance. Deployability should require actual supported AWS operations, and readiness should require a declared service condition rather than API acceptance. Cleanup should account for every created resource and unresolved billable item. Human-review metrics should distinguish finding an error from approving a corrected result. Record sample counts, repeated trials and uncertainty intervals; do not combine unlike metrics from the ten papers into a league table.

Resource creation experiments must use controlled test environments and explicit cost/teardown bounds. Provider errors, quotas, credentials, region availability and propagation delays are part of the execution record, not reasons to silently remove failed trials. A recovery experiment should interrupt work at known lifecycle points and check whether the stored desired/actual state supports an explainable continuation. A negative test should also confirm that unsupported model output is rejected before mutation and that adopted resources are detached without deletion. These experiments would turn existing architectural choices into testable claims.

### Scope, rights and the claim this review supports

The ten PDFs are original downloads with metadata/checksums and inspected substantive method/evaluation sections. Their dates and manuscript stages differ deliberately: EDMM's journal issue is 2020 but its stored preprint is from 2019; IaCGen first appeared in 2025 but the stored v3 and FSE acceptance are from 2026. Multi-IaC-Eval and the cloud-agent position study remain labeled preprints because a peer-reviewed venue was not verified. Full author lists, source records and versions are in the [catalog](#paper-catalog). The [collective project README](#paper-provenance) preserves checksums, verification results, license links and the detailed evidence trail.

Rights differ across the collection. CAMEL, DOML and the stored IaCGen version record CC BY 4.0; Multi-IaC-Eval and TerraFormer record CC BY-NC-ND 4.0. The Winery/OpenTOSCA author copies retain publisher copyright notices, and the IaC-Eval paper's redistribution license was not established merely from its dataset/code licensing. EDMM and the cloud-agent arXiv records use non-exclusive distribution grants rather than a blanket downstream republication permission. Preserve originals and attribution, and verify rights before public or commercial redistribution; source links are supplied for sharing without implying uniform relicensing.

No new live AWS/model/Google evaluation, product trial or controlled user study was performed for this review. Consequently, the supported conclusion is an **implementation contribution with a clear evaluation opportunity**, not demonstrated superiority. The most informative next result would show which errors the shared graph prevents, which semantic errors survive it, and how accurately users recognize the remaining risks before execution. That would give CloudCanvas a stronger, narrower claim than adding more services or more autonomous behavior without evidence.

<a id="paper-catalog"></a>

## Ten paper bibliography and PDF catalog

Ten related research papers collected on **2026-10-29**. Read the [comparison and learnings](#research-comparison) for the implementation inventory, paper findings, defensible differentiation, company comparisons and evaluation roadmap. These are original downloaded PDFs, not generated summaries presented as papers.

The selection spans visual cloud modeling and execution (01–05) and AI-assisted infrastructure generation, validation and operations (06–10). It is targeted related work, not an exhaustive systematic review or a proof of first-in-world novelty. Peer-reviewed papers, author preprints of published papers and unreviewed preprints are labeled separately.

### Reading and provenance

Page references in the report are physical PDF pages. Papers 01 and 02 include a repository cover sheet. Full bibliography, source/download links, versions and rights notes are listed below. Detailed checksums, sizes, verification results and evidence locations are preserved in the [collective project README](#paper-provenance).

Public access is not the same as unrestricted republication permission. Preserve author attribution and original notices. The collection does not establish commercial/public redistribution clearance for every PDF; use original source links when sharing if reuse rights are uncertain. In particular, an arXiv non-exclusive distribution grant is not a blanket downstream reuse license, and a dataset license does not automatically cover its paper.

### The ten papers

#### 01 — Winery – A Modeling Tool for TOSCA-Based Cloud Applications

**Authors:** Oliver Kopp, Tobias Binz, Uwe Breitenbücher, Frank Leymann.

**Publication:** 2013; ICSOC 2013, LNCS 8274, pp. 700–704. Published conference demonstration paper.

**Identifiers:** DOI 10.1007/978-3-642-45005-1_64.

**Files and source:** [Local PDF](research/01-winery-modeling-tool.pdf) · [Primary record](https://doi.org/10.1007/978-3-642-45005-1_64) · [Original PDF download](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-46-Winery_A_Modeling_Tool_for_TOSCA-based_Cloud_Applications.pdf). 6 physical pages; 704,560 bytes.

**Stored version:** Institutional author copy, with an additional repository cover sheet; exact manuscript-stage label not stated.

**Rights recorded:** Copyright 2013 Springer-Verlag; no Creative Commons reuse license stated in this institutional copy.

#### 02 — OpenTOSCA – A Runtime for TOSCA-Based Cloud Applications

**Authors:** Tobias Binz, Uwe Breitenbücher, Florian Haupt, Oliver Kopp, Frank Leymann, Alexander Nowak, Sebastian Wagner.

**Publication:** 2013; ICSOC 2013, LNCS 8274, pp. 692–695. Published conference demonstration paper.

**Identifiers:** DOI 10.1007/978-3-642-45005-1_62.

**Files and source:** [Local PDF](research/02-opentosca-runtime.pdf) · [Primary record](https://doi.org/10.1007/978-3-642-45005-1_62) · [Original PDF download](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-45-OpenTOSCA_A_Runtime_for_TOSCA-based_Cloud_Applications.pdf). 5 physical pages; 382,841 bytes.

**Stored version:** Institutional author copy, with an additional repository cover sheet; exact manuscript-stage label not stated.

**Rights recorded:** Copyright 2013 Springer-Verlag; no Creative Commons reuse license stated in this institutional copy.

#### 03 — The cloud application modelling and execution language

**Authors:** Achilleas P. Achilleos, Kyriakos Kritikos, Alessandro Rossini, Georgia M. Kapitsaki, Jörg Domaschka, Michal Orzechowski, Daniel Seybold, Frank Griesinger, Nikolay Nikolov, Daniel Romero, George A. Papadopoulos.

**Publication:** 2019; Journal of Cloud Computing 8, article 20. Published open-access research article.

**Identifiers:** DOI 10.1186/s13677-019-0138-7.

**Files and source:** [Local PDF](research/03-camel-cloud-modeling.pdf) · [Primary record](https://link.springer.com/article/10.1186/s13677-019-0138-7) · [Original PDF download](https://link.springer.com/content/pdf/10.1186/s13677-019-0138-7.pdf). 25 physical pages; 2,896,670 bytes.

**Stored version:** Publisher version of record.

**Rights recorded:** Creative Commons Attribution 4.0 International.

#### 04 — The Essential Deployment Metamodel: A Systematic Review of Deployment Automation Technologies

**Authors:** Michael Wurster, Uwe Breitenbücher, Michael Falkenthal, Christoph Krieger, Frank Leymann, Karoline Saatkamp, Jacopo Soldani.

**Publication:** 2020; SICS Software-Intensive Cyber-Physical Systems 35(1–2), pp. 63–75. Published journal article; downloaded file is its author preprint.

**Date distinction:** first online in 2019; journal issue in 2020. The stored file is the 2019 author preprint, not publisher layout.

**Identifiers:** DOI 10.1007/s00450-019-00412-x; arXiv 1905.07314v2.

**Files and source:** [Local PDF](research/04-essential-deployment-metamodel.pdf) · [Primary record](https://arxiv.org/abs/1905.07314) · [Original PDF download](https://arxiv.org/pdf/1905.07314v2). 13 physical pages; 1,111,335 bytes.

**Stored version:** arXiv v2, 10 September 2019; document identifies itself as pre-print of the journal article.

**Rights recorded:** arXiv non-exclusive distribution license; this does not grant a general downstream republication license.

#### 05 — DOML: A new modeling approach to Infrastructure-as-Code

**Authors:** Michele Chiari, Bin Xiang, Sergio Canzoneri, Galia Novakova Nedeltcheva, Elisabetta Di Nitto, Lorenzo Blasi, Debora Benedetto, Laurentiu Niculut, Igor Škof.

**Publication:** 2024; Information Systems 125, article 102422. Published peer-reviewed open-access research article.

**Identifiers:** DOI 10.1016/j.is.2024.102422.

**Files and source:** [Local PDF](research/05-doml-modeling-infrastructure.pdf) · [Primary record](https://repositum.tuwien.at/handle/20.500.12708/203669) · [Original PDF download](https://repositum.tuwien.at/bitstream/20.500.12708/203669/1/Chiari-2024-Information%20Systems-vor.pdf). 21 physical pages; 2,305,788 bytes.

**Stored version:** Publisher version of record in TU Wien institutional repository.

**Rights recorded:** Creative Commons Attribution 4.0 International.

#### 06 — IaC-Eval: A Code Generation Benchmark for Cloud Infrastructure-as-Code Programs

**Authors:** Patrick Tser Jern Kon, Jiachen Liu, Yiming Qiu, Weijun Fan, Ting He, Lei Lin, Haoran Zhang, Owen M. Park, George S. Elengikal, Yuxin Kang, Ang Chen, Mosharaf Chowdhury, Myungjin Lee, Xinyu Wang.

**Publication:** 2024; NeurIPS 2024 Datasets and Benchmarks Track; Advances in Neural Information Processing Systems 37. Peer-reviewed conference paper.

**Files and source:** [Local PDF](research/06-iac-eval.pdf) · [Primary record](https://papers.nips.cc/paper_files/paper/2024/hash/f26b29298ae8acd94bd7e839688e329b-Abstract-Datasets_and_Benchmarks_Track.html) · [Original PDF download](https://papers.nips.cc/paper_files/paper/2024/file/f26b29298ae8acd94bd7e839688e329b-Paper-Datasets_and_Benchmarks_Track.pdf). 19 physical pages; 1,716,903 bytes.

**Stored version:** Official NeurIPS 2024 proceedings PDF.

**Rights recorded:** Paper redistribution license not established from inspected source.

#### 07 — Multi-IaC-Eval: Benchmarking Cloud Infrastructure as Code Across Multiple Formats

**Authors:** Sam Davidson, Li Sun, Bhavana Bhasker, Laurent Callot, Anoop Deoras.

**Publication:** 2025; arXiv cs.DC. arXiv preprint; no peer-reviewed venue verified.

**Identifiers:** DOI 10.48550/arXiv.2509.05303; arXiv 2509.05303.

**Files and source:** [Local PDF](research/07-multi-iac-eval.pdf) · [Primary record](https://arxiv.org/abs/2509.05303) · [Original PDF download](https://arxiv.org/pdf/2509.05303v1). 28 physical pages; 327,424 bytes.

**Stored version:** v1, 2025-08-21.

**Rights recorded:** CC BY-NC-ND 4.0.

#### 08 — TerraFormer: Automated Infrastructure-as-Code with LLMs Fine-Tuned via Policy-Guided Verifier Feedback

**Authors:** Prithwish Jana, Sam Davidson, Bhavana Bhasker, Andrey Kan, Anoop Deoras, Laurent Callot.

**Publication:** 2026; ICSE 2026 Software Engineering in Practice (SEIP). Peer-reviewed conference paper; downloaded arXiv author version.

**Identifiers:** DOI 10.1145/3786583.3786898; arXiv 2601.08734.

**Files and source:** [Local PDF](research/08-terraformer.pdf) · [Primary record](https://arxiv.org/abs/2601.08734) · [Original PDF download](https://arxiv.org/pdf/2601.08734v1). 12 physical pages; 4,081,876 bytes.

**Stored version:** v1, 2026-01-13.

**Rights recorded:** CC BY-NC-ND 4.0.

#### 09 — Deployability-Centric Infrastructure-as-Code Generation: Fail, Learn, Refine, and Succeed through LLM-Empowered DevOps Simulation

**Authors:** Tianyi Zhang, Shidong Pan, Zejun Zhang, Zhenchang Xing, Xiaoyu Sun.

**Publication:** 2026; FSE 2026 Research Papers. Accepted peer-reviewed FSE 2026 research paper; downloaded arXiv author version.

**Date distinction:** first preprint in 2025; stored v3 and the cited FSE acceptance are from 2026.

**Identifiers:** DOI 10.48550/arXiv.2506.05623; arXiv 2506.05623.

**Files and source:** [Local PDF](research/09-deployability-centric-iac.pdf) · [Primary record](https://arxiv.org/abs/2506.05623) · [Original PDF download](https://arxiv.org/pdf/2506.05623v3). 23 physical pages; 1,552,624 bytes.

**Stored version:** v3, 2026-01-11.

**Rights recorded:** CC BY 4.0.

#### 10 — Cloud Infrastructure Management in the Age of AI Agents

**Authors:** Zhenning Yang, Archit Bhatnagar, Yiming Qiu, Tongyuan Miao, Patrick Tser Jern Kon, Yunming Xiao, Yibo Huang, Martin Casado, Ang Chen.

**Publication:** 2025; arXiv cs.AI. arXiv position/preliminary-study preprint; no peer-reviewed venue verified.

**Identifiers:** DOI 10.48550/arXiv.2506.12270; arXiv 2506.12270.

**Files and source:** [Local PDF](research/10-cloud-infrastructure-ai-agents.pdf) · [Primary record](https://arxiv.org/abs/2506.12270) · [Original PDF download](https://arxiv.org/pdf/2506.12270v1). 8 physical pages; 1,555,893 bytes.

**Stored version:** v1, 2025-06-13.

**Rights recorded:** arXiv non-exclusive distribution license; not a general third-party redistribution grant.

### Scope of the comparison

The source implementation baseline is commit `3fb7def7d852d52177fb343c7d8f793588f5d9b3`. No new AWS/provider deployments, company product trials or comparative user study were performed for this literature review. Existing project test receipts do not measure superiority over these papers or products. The PDFs were checked for PDF headers, successful parsing, title/author agreement, and matching metadata/checksums.

[Back to project documentation](#repository-map) · [Main project README](../README.md)

<a id="implementation-evidence"></a>

## Detailed implementation evidence

The detailed source references below preserve the implementation evidence behind the research comparison. Function names and recorded line numbers refer to the reviewed baseline and may move after later edits.

| Area | Source-verified implementation | Evidence |
| --- | --- | --- |
| Supported scope | Eleven graph node types: EC2 instance, key pair, security group, ECR repository, S3 bucket, IAM role, Lambda function, DynamoDB table, SQS queue, SNS topic, CloudFront distribution. The only accepted attachment pairings are key pair → EC2, security group → EC2, IAM role → Lambda, S3 → CloudFront. | [Shared contract](../contracts/src/index.ts), `AwsService`, lines 9–20; `canConnectResources`, lines 47–51. |
| Graph validation | AJV JSON Schema checks, YAML parsing with duplicate-key and alias restrictions, unique-node/edge checks, supported attachments, acyclicity, and direct-edge requirements for configuration references. This validates supported structure, not complete AWS security or business intent. | [Shared contract](../contracts/src/index.ts), `createGraphPlan`, line 65; `validateGraphObject`, line 155; `parseGraphYaml`, line 170; [schema](../contracts/graph.schema.json). |
| Workspace persistence | Graph editor computes incremental canvas diffs and persists edge/node deletion, creation, position changes and configuration changes through separate API calls. It queues debounced saves; the UI also has undo/redo. | [Graph editor](../client/src/components/graph/GraphEditor.tsx), `persistCanvas`, line 249; queue/flush, lines 273–287; [history helper](../client/src/hooks/useCanvasHistory.ts). |
| Full graph replacement | Save and Apply blueprint validate YAML and call the full import/replace API. The replacement API blocks replacement while any associated resource is non-terminated; accepted replacement runs in a database transaction and remaps node references. | [Graph editor](../client/src/components/graph/GraphEditor.tsx), `saveGraph`, line 289, `applyBlueprint`, line 343; [infrastructure controller](../server/src/controllers/infrastructureController.ts), `replaceSketchGraph`, lines 533–560, `persistPreparedGraph`. |
| AI routing and tools | Active LangGraph routes AWS build requests to the structured AWS router and general conversation to NVIDIA, with a tool loop. Tools are resource-support guidance, DuckDuckGo search, and AWS catalog lookup. A defined Llama wrapper is not part of this active graph. | [Compiled graph](../service/agents/graph.py), `compile_graph`, lines 18–37; [nodes](../service/agents/nodes.py); [catalog tool](../service/tools/aws_catalog.py). |
| Catalog grounding | Conversation controller obtains bounded catalog context for the sketch/active AWS connection. Python catalog tools call authenticated Express catalog endpoints with the user's bearer token, held in request-local context. Raw AWS credentials are decrypted in Express, not handed to the model. Catalog failure falls back to empty context. | [Conversation controller](../server/src/controllers/conversationController.ts), `awsCatalogContext`, lines 52–80, query call lines 134–142; [catalog callback](../service/tools/aws_catalog.py), lines 17–44. |
| AI review gate | Express validates returned build shape and shared graph contract; user explicitly chooses Apply blueprint to replace the canvas, then separately chooses Publish to provision resources. Applying a blueprint overwrites the graph; it is not an additive merge or cloud deployment. | [AI adapter](../server/src/services/aiService.ts), `parseAiAgentResponse`, lines 140–176; [AI composer](../client/src/components/graph/AiComposer.tsx), `applyBlueprint`, line 88; [publish button](../client/src/components/graph/PublishSketchButton.tsx), lines 25–31. |
| Dependency execution | Express constructs a topological plan, waits for direct dependencies, resolves configuration references from resource outputs, and dispatches SDK create/update operations. It provisions sequentially within the request. | [Infrastructure controller](../server/src/controllers/infrastructureController.ts), `deploySketch`, line 856, source readiness lines 940–955; [deployment graph](../server/src/services/aws/graph.ts), `resolveConfigReferences`; [readiness helper](../server/src/services/aws/readiness.ts), lines 3–16. |
| Recorded state | PostgreSQL/Prisma models separately persist sketches, nodes, edges, connections, AWS resources, deployment requests/results/errors, and per-sketch conversation/messages. Resource records separate `desiredConfig` from `actualState` and retain `managed`, status, external IDs and last errors. | [Prisma schema](../server/prisma/schema.prisma), models `Sketch` line 67, `AwsConnection` line 125, `AwsResource` line 147, `Deployment` line 176, `SketchConversation` line 196, `ChatMessage` line 212. |
| Status observation | Browser editor invokes resource refresh on load and a timer (default 30 seconds). Server refresh describes resources and records their returned state. This is not a background drift-detection or reconciliation system comparing every desired field with live configuration. | [Editor](../client/src/components/graph/GraphEditor.tsx), lines 131–147; [interval config](../client/src/lib/config.ts), line 6; [refresh controller](../server/src/controllers/infrastructureController.ts), `refreshResourceRecord`, lines 141–180. |
| Managed versus adopted cleanup | Existing EC2/key-pair/security-group resources can be adopted. Unmanaged records are terminated/detached locally without an AWS delete call. Managed cleanup calls AWS; bulk/sketch cleanup uses reverse graph order and stops at a pending/failed result. S3 bucket deletion clears contents/versions, and ECR deletion is forced. | [Infrastructure controller](../server/src/controllers/infrastructureController.ts), `isAdoptedResource`, `deleteResourceRecord`, lines 80–125, `deleteSketchResourceRecords`, lines 127–138; [S3 deletion](../server/src/services/aws/resources/s3.ts), `deleteBucket`; [ECR deletion](../server/src/services/aws/resources/ecr.ts), `deleteRepository`. |
| S3/CloudFront path | Managed frontend delivery creates private S3-origin CloudFront infrastructure with OAC and a scoped bucket policy. CloudFront setup records identifiers before final policy setup. Deletion disables first and is completed through subsequent refresh after propagation. Managed running S3 buckets have a direct browser upload path through scoped forms (600-second expiry, 100-MiB bound). | [CloudFront service](../server/src/services/aws/resources/cloudfront.ts), `create`, `delete`, lines 81–103 and 129–162; [bucket object service](../server/src/services/aws/resources/objects.ts), lines 4 and 48–52; [bucket API](../server/src/controllers/bucketObjectsController.ts). |
| Credential handling and ownership | AWS secrets use AES-256-GCM with random 12-byte IVs; the key is SHA-256-derived from `AWS_ENCRYPTION_KEY`. Express JWT middleware protects AWS/sketch routes, and controllers scope owned data. This alone is not a complete security qualification. | [Crypto implementation](../server/src/services/aws/crypto.ts), lines 3–23; [Express entry](../server/src/index.ts), lines 40–42; [JWT middleware](../server/src/middlewares/authenticate.ts); [owned-sketch query](../server/src/controllers/infrastructureController.ts), lines 861–864. |
| Local reproducibility | Docker Compose defines PostgreSQL, client, API and AI containers, folder-specific env loading, health checks, a database volume, migration startup and internal service URLs. Node image builds compile the sibling contracts package and server Prisma client. This packages CloudCanvas itself; it is not a user-facing Docker image deployment pipeline. | [Compose](../docker-compose.yml); [client Dockerfile](../docker/Dockerfile.client), lines 4–15; [server Dockerfile](../docker/Dockerfile.server), lines 3–13. |

<a id="paper-provenance"></a>

## Paper provenance and verification metadata

These records preserve the collected bibliography, versions, rights, original download locations, checksums and physical-PDF evidence locations. PDF bytes are unchanged. Public access does not imply uniform reuse rights.

### P01 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 01 |
| Title | Winery – A Modeling Tool for TOSCA-Based Cloud Applications |
| Authors | Oliver Kopp; Tobias Binz; Uwe Breitenbücher; Frank Leymann |
| Year | 2013 |
| Venue | ICSOC 2013, LNCS 8274, pp. 700–704 |
| Publication status | Published conference demonstration paper |
| DOI | 10.1007/978-3-642-45005-1_64 |
| Source record URL | [https://doi.org/10.1007/978-3-642-45005-1_64](https://doi.org/10.1007/978-3-642-45005-1_64) |
| PDF URL | [https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-46-Winery_A_Modeling_Tool_for_TOSCA-based_Cloud_Applications.pdf](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-46-Winery_A_Modeling_Tool_for_TOSCA-based_Cloud_Applications.pdf) |
| Filename | [01-winery-modeling-tool.pdf](research/01-winery-modeling-tool.pdf) |
| Version | Institutional author copy, with an additional repository cover sheet; exact manuscript-stage label not stated |
| License | Copyright 2013 Springer-Verlag; no Creative Commons reuse license stated in this institutional copy |
| Evidence pages | 3; 4; 5; 6 |
| Retrieved on | 2026-10-29 |
| Bytes | 704560 |
| SHA-256 | ef4445afeea823f7027a5ea9e0a2a54204cc21eef5834892a2a0233be3a97faf |
| Pages | 6 |
| Path | [01-winery-modeling-tool.pdf](research/01-winery-modeling-tool.pdf) |
| Verification | PDF header, pdfinfo parse, extracted first-page title/authors, substantive method/evaluation/limitations inspected; page references are physical PDF page numbers. |

### P02 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 02 |
| Title | OpenTOSCA – A Runtime for TOSCA-Based Cloud Applications |
| Authors | Tobias Binz; Uwe Breitenbücher; Florian Haupt; Oliver Kopp; Frank Leymann; Alexander Nowak; Sebastian Wagner |
| Year | 2013 |
| Venue | ICSOC 2013, LNCS 8274, pp. 692–695 |
| Publication status | Published conference demonstration paper |
| DOI | 10.1007/978-3-642-45005-1_62 |
| Source record URL | [https://doi.org/10.1007/978-3-642-45005-1_62](https://doi.org/10.1007/978-3-642-45005-1_62) |
| PDF URL | [https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-45-OpenTOSCA_A_Runtime_for_TOSCA-based_Cloud_Applications.pdf](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-45-OpenTOSCA_A_Runtime_for_TOSCA-based_Cloud_Applications.pdf) |
| Filename | [02-opentosca-runtime.pdf](research/02-opentosca-runtime.pdf) |
| Version | Institutional author copy, with an additional repository cover sheet; exact manuscript-stage label not stated |
| License | Copyright 2013 Springer-Verlag; no Creative Commons reuse license stated in this institutional copy |
| Evidence pages | 3; 4; 5 |
| Retrieved on | 2026-10-29 |
| Bytes | 382841 |
| SHA-256 | fca679f86360273488947e3db24c980259a1b6937daa344fbd73e1011956c401 |
| Pages | 5 |
| Path | [02-opentosca-runtime.pdf](research/02-opentosca-runtime.pdf) |
| Verification | PDF header, pdfinfo parse, extracted first-page title/authors, substantive method/evaluation/limitations inspected; page references are physical PDF page numbers. |

### P03 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 03 |
| Title | The cloud application modelling and execution language |
| Authors | Achilleas P. Achilleos; Kyriakos Kritikos; Alessandro Rossini; Georgia M. Kapitsaki; Jörg Domaschka; Michal Orzechowski; Daniel Seybold; Frank Griesinger; Nikolay Nikolov; Daniel Romero; George A. Papadopoulos |
| Year | 2019 |
| Venue | Journal of Cloud Computing 8, article 20 |
| Publication status | Published open-access research article |
| DOI | 10.1186/s13677-019-0138-7 |
| Source record URL | [https://link.springer.com/article/10.1186/s13677-019-0138-7](https://link.springer.com/article/10.1186/s13677-019-0138-7) |
| PDF URL | [https://link.springer.com/content/pdf/10.1186/s13677-019-0138-7.pdf](https://link.springer.com/content/pdf/10.1186/s13677-019-0138-7.pdf) |
| Filename | [03-camel-cloud-modeling.pdf](research/03-camel-cloud-modeling.pdf) |
| Version | Publisher version of record |
| License | Creative Commons Attribution 4.0 International |
| License URL | [https://creativecommons.org/licenses/by/4.0/](https://creativecommons.org/licenses/by/4.0/) |
| Evidence pages | 3; 7; 18; 19; 20; 21 |
| Retrieved on | 2026-10-29 |
| Bytes | 2896670 |
| SHA-256 | 536d59be8e4997cdd4035e7205fe552b535e3bc89c0a95be4a7ac01c3aceb702 |
| Pages | 25 |
| Path | [03-camel-cloud-modeling.pdf](research/03-camel-cloud-modeling.pdf) |
| Verification | PDF header, pdfinfo parse, extracted first-page title/authors, substantive method/evaluation/limitations inspected; page references are physical PDF page numbers. |

### P04 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 04 |
| Title | The Essential Deployment Metamodel: A Systematic Review of Deployment Automation Technologies |
| Authors | Michael Wurster; Uwe Breitenbücher; Michael Falkenthal; Christoph Krieger; Frank Leymann; Karoline Saatkamp; Jacopo Soldani |
| Year | 2020 |
| First online year | 2019 |
| Venue | SICS Software-Intensive Cyber-Physical Systems 35(1–2), pp. 63–75 |
| Publication status | Published journal article; downloaded file is its author preprint |
| DOI | 10.1007/s00450-019-00412-x |
| arXiv ID | 1905.07314v2 |
| Source record URL | [https://arxiv.org/abs/1905.07314](https://arxiv.org/abs/1905.07314) |
| Publisher url | [https://link.springer.com/article/10.1007/s00450-019-00412-x](https://link.springer.com/article/10.1007/s00450-019-00412-x) |
| PDF URL | [https://arxiv.org/pdf/1905.07314v2](https://arxiv.org/pdf/1905.07314v2) |
| Filename | [04-essential-deployment-metamodel.pdf](research/04-essential-deployment-metamodel.pdf) |
| Version | arXiv v2, 10 September 2019; document identifies itself as pre-print of the journal article |
| License | arXiv non-exclusive distribution license; this does not grant a general downstream republication license |
| License URL | [http://arxiv.org/licenses/nonexclusive-distrib/1.0/](http://arxiv.org/licenses/nonexclusive-distrib/1.0/) |
| Evidence pages | 2; 3; 4; 6; 7; 8; 9; 10; 11 |
| Retrieved on | 2026-10-29 |
| Bytes | 1111335 |
| SHA-256 | 90b65c3b4984ea5ed2bc0c2afeb6818c190bf50ad976887a4969c3c9c6b72c14 |
| Pages | 13 |
| Path | [04-essential-deployment-metamodel.pdf](research/04-essential-deployment-metamodel.pdf) |
| Verification | PDF header, pdfinfo parse, extracted first-page title/authors, substantive method/evaluation/limitations inspected; page references are physical PDF page numbers. |

### P05 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 05 |
| Title | DOML: A new modeling approach to Infrastructure-as-Code |
| Authors | Michele Chiari; Bin Xiang; Sergio Canzoneri; Galia Novakova Nedeltcheva; Elisabetta Di Nitto; Lorenzo Blasi; Debora Benedetto; Laurentiu Niculut; Igor Škof |
| Year | 2024 |
| Venue | Information Systems 125, article 102422 |
| Publication status | Published peer-reviewed open-access research article |
| DOI | 10.1016/j.is.2024.102422 |
| Source record URL | [https://repositum.tuwien.at/handle/20.500.12708/203669](https://repositum.tuwien.at/handle/20.500.12708/203669) |
| Publisher url | [https://www.sciencedirect.com/science/article/pii/S0306437924000802](https://www.sciencedirect.com/science/article/pii/S0306437924000802) |
| PDF URL | [https://repositum.tuwien.at/bitstream/20.500.12708/203669/1/Chiari-2024-Information%20Systems-vor.pdf](https://repositum.tuwien.at/bitstream/20.500.12708/203669/1/Chiari-2024-Information%20Systems-vor.pdf) |
| Filename | [05-doml-modeling-infrastructure.pdf](research/05-doml-modeling-infrastructure.pdf) |
| Version | Publisher version of record in TU Wien institutional repository |
| License | Creative Commons Attribution 4.0 International |
| License URL | [https://creativecommons.org/licenses/by/4.0/](https://creativecommons.org/licenses/by/4.0/) |
| Evidence pages | 4; 5; 6; 7; 12; 13; 14; 15; 16; 17; 18; 19; 20 |
| Retrieved on | 2026-10-29 |
| Bytes | 2305788 |
| SHA-256 | c724500040fcc4e4be09bd224138e9f3ab9bd16a184fa8db7257771ee90479f1 |
| Pages | 21 |
| Path | [05-doml-modeling-infrastructure.pdf](research/05-doml-modeling-infrastructure.pdf) |
| Verification | PDF header, pdfinfo parse, extracted first-page title/authors, substantive method/evaluation/limitations inspected; page references are physical PDF page numbers. |

### P06 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 06 |
| Title | IaC-Eval: A Code Generation Benchmark for Cloud Infrastructure-as-Code Programs |
| Authors | Patrick Tser Jern Kon; Jiachen Liu; Yiming Qiu; Weijun Fan; Ting He; Lei Lin; Haoran Zhang; Owen M. Park; George S. Elengikal; Yuxin Kang; Ang Chen; Mosharaf Chowdhury; Myungjin Lee; Xinyu Wang |
| Year | 2024 |
| Publication status | Peer-reviewed conference paper |
| Venue | NeurIPS 2024 Datasets and Benchmarks Track; Advances in Neural Information Processing Systems 37 |
| DOI | Not established / not supplied in the collected record. |
| arXiv ID | Not established / not supplied in the collected record. |
| Version | Official NeurIPS 2024 proceedings PDF |
| Source record URL | [https://papers.nips.cc/paper_files/paper/2024/hash/f26b29298ae8acd94bd7e839688e329b-Abstract-Datasets_and_Benchmarks_Track.html](https://papers.nips.cc/paper_files/paper/2024/hash/f26b29298ae8acd94bd7e839688e329b-Abstract-Datasets_and_Benchmarks_Track.html) |
| PDF URL | [https://papers.nips.cc/paper_files/paper/2024/file/f26b29298ae8acd94bd7e839688e329b-Paper-Datasets_and_Benchmarks_Track.pdf](https://papers.nips.cc/paper_files/paper/2024/file/f26b29298ae8acd94bd7e839688e329b-Paper-Datasets_and_Benchmarks_Track.pdf) |
| Local PDF | [06-iac-eval.pdf](research/06-iac-eval.pdf) |
| License | Paper redistribution license not established from inspected source |
| License URL | Not established / not supplied in the collected record. |
| SHA-256 | 708a71ac8498cdfa36d50d73aa1fb95c2b58b96576c8ee894b8ce90597cee9df |
| Bytes | 1716903 |
| Pages | 19 |
| Retrieved date | 2026-10-29 |
| PDF title/authors verified | Yes |
| License note | Original PDF retained without modification; source availability is not a blanket permission to redistribute commercially or publicly. Preserve attribution and verify reuse rights. |

**Evidence findings:**

- PDF pages 3, 4: 458 human-curated AWS/Terraform tasks; terraform plan then OPA/Rego checks of user intent, without requiring deployment.
- PDF pages 6: Table1 GPT-4 pass@1=19.36% on historical benchmark configuration.
- PDF pages 8, 9: AWS/Terraform scope and no HCL function-generation coverage; broader metrics and frameworks are future work.

### P07 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 07 |
| Title | Multi-IaC-Eval: Benchmarking Cloud Infrastructure as Code Across Multiple Formats |
| Authors | Sam Davidson; Li Sun; Bhavana Bhasker; Laurent Callot; Anoop Deoras |
| Year | 2025 |
| Publication status | arXiv preprint; no peer-reviewed venue verified |
| Venue | arXiv cs.DC |
| DOI | 10.48550/arXiv.2509.05303 |
| arXiv ID | 2509.05303 |
| Version | v1, 2025-08-21 |
| Source record URL | [https://arxiv.org/abs/2509.05303](https://arxiv.org/abs/2509.05303) |
| PDF URL | [https://arxiv.org/pdf/2509.05303v1](https://arxiv.org/pdf/2509.05303v1) |
| Local PDF | [07-multi-iac-eval.pdf](research/07-multi-iac-eval.pdf) |
| License | CC BY-NC-ND 4.0 |
| License URL | [https://creativecommons.org/licenses/by-nc-nd/4.0/](https://creativecommons.org/licenses/by-nc-nd/4.0/) |
| SHA-256 | cff039c866fc2db8252a957c863563ebc3c5086b039ed2a4fce71e1b2fcadb24 |
| Bytes | 327424 |
| Pages | 28 |
| Retrieved date | 2026-10-29 |
| PDF title/authors verified | Yes |
| License note | Original PDF retained without modification; source availability is not a blanket permission to redistribute commercially or publicly. Preserve attribution and verify reuse rights. |

**Evidence findings:**

- PDF pages 3, 4, 6: Mutation triplets of initial IaC, natural-language change, expected IaC; static validation and LLM judge plus60 human-reviewed samples.
- PDF pages 7, 8: 337 CloudFormation,171 Terraform,191 CDK templates evaluated; retry-loop ablations improve lint/Checkov rates. CDK converted through CloudFormation.
- PDF pages 9: No actual deployment testing; enterprise complexity and native CDK behavior are limitations.

### P08 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 08 |
| Title | TerraFormer: Automated Infrastructure-as-Code with LLMs Fine-Tuned via Policy-Guided Verifier Feedback |
| Authors | Prithwish Jana; Sam Davidson; Bhavana Bhasker; Andrey Kan; Anoop Deoras; Laurent Callot |
| Year | 2026 |
| Publication status | Peer-reviewed conference paper; downloaded arXiv author version |
| Venue | ICSE 2026 Software Engineering in Practice (SEIP) |
| DOI | 10.1145/3786583.3786898 |
| arXiv ID | 2601.08734 |
| Version | v1, 2026-01-13 |
| Source record URL | [https://arxiv.org/abs/2601.08734](https://arxiv.org/abs/2601.08734) |
| PDF URL | [https://arxiv.org/pdf/2601.08734v1](https://arxiv.org/pdf/2601.08734v1) |
| Local PDF | [08-terraformer.pdf](research/08-terraformer.pdf) |
| License | CC BY-NC-ND 4.0 |
| License URL | [https://creativecommons.org/licenses/by-nc-nd/4.0/](https://creativecommons.org/licenses/by-nc-nd/4.0/) |
| Venue url | [https://conf.researchr.org/details/icse-2026/icse-2026-software-engineering-in-practice/43/TerraFormer-Automated-Infrastructure-as-Code-with-LLMs-Fine-Tuned-via-Policy-Guided-](https://conf.researchr.org/details/icse-2026/icse-2026-software-engineering-in-practice/43/TerraFormer-Automated-Infrastructure-as-Code-with-LLMs-Fine-Tuned-via-Policy-Guided-) |
| SHA-256 | 704e94c0df21a4637c15cb2a8a93c57ded703dad32bf163975dd4e98f44ed2b5 |
| Bytes | 4081876 |
| Pages | 12 |
| Retrieved date | 2026-10-29 |
| PDF title/authors verified | Yes |
| License note | Original PDF retained without modification; source availability is not a blanket permission to redistribute commercially or publicly. Preserve attribution and verify reuse rights. |

**Evidence findings:**

- PDF pages 3, 4, 5, 6: terraform validate, terraform plan and OPA/Rego verifier feedback drives dataset curation and SFT+RL;152475 generation and52516 mutation instances.
- PDF pages 7: Table2:14B SFT+RL achieves31.44% IaC-Eval correctness vs15.50% Qwen2.5-Coder-14B base, an absolute15.94 percentage-point gain; all pass@1.
- PDF pages 7, 9: Correctness is policy-relative; security compliance averages passed Checkov checks per instance, not percent wholly secure deployments.

### P09 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 09 |
| Title | Deployability-Centric Infrastructure-as-Code Generation: Fail, Learn, Refine, and Succeed through LLM-Empowered DevOps Simulation |
| Authors | Tianyi Zhang; Shidong Pan; Zejun Zhang; Zhenchang Xing; Xiaoyu Sun |
| Year | 2026 |
| First preprint year | 2025 |
| Publication status | Accepted peer-reviewed FSE 2026 research paper; downloaded arXiv author version |
| Venue | FSE 2026 Research Papers |
| DOI | 10.48550/arXiv.2506.05623 |
| arXiv ID | 2506.05623 |
| Version | v3, 2026-01-11 |
| Source record URL | [https://arxiv.org/abs/2506.05623](https://arxiv.org/abs/2506.05623) |
| PDF URL | [https://arxiv.org/pdf/2506.05623v3](https://arxiv.org/pdf/2506.05623v3) |
| Local PDF | [09-deployability-centric-iac.pdf](research/09-deployability-centric-iac.pdf) |
| License | CC BY 4.0 |
| License URL | [https://creativecommons.org/licenses/by/4.0/](https://creativecommons.org/licenses/by/4.0/) |
| Venue url | [https://conf.researchr.org/details/fse-2026/fse-2026-research-papers/43/Deployability-Centric-Infrastructure-as-Code-Generation-Fail-Learn-Refine-and-Suc](https://conf.researchr.org/details/fse-2026/fse-2026-research-papers/43/Deployability-Centric-Infrastructure-as-Code-Generation-Fail-Learn-Refine-and-Suc) |
| SHA-256 | d3aab982bf0ff195197ae28cdf933e2ac541c3a711b20c3bf6d113732a277900 |
| Bytes | 1552624 |
| Pages | 23 |
| Retrieved date | 2026-10-29 |
| PDF title/authors verified | Yes |
| License note | Original PDF retained without modification; source availability is not a blanket permission to redistribute commercially or publicly. Preserve attribution and verify reuse rights. |

**Evidence findings:**

- PDF pages 4, 6, 7, 8, 9: DPIaC-Eval153 AWS CloudFormation scenarios across58 services; IaCGen uses formatting, syntax and live deployment feedback.
- PDF pages 11: Table2: six evaluated models first-attempt deployability20.8–30.2%;10-iteration passItr54.6–91.6%. Distinguish iterative success from pass@1.
- PDF pages 15, 16: Intent evaluation samples51 benchmark instances; across models25.2% satisfy both resources and attributes.8.4% filtered full-template security compliance excludes templates with no applicable Checkov policies.
- PDF pages 18: Historical model selection, specialized configurations, subjective difficulty and cross-IaC generalization are threats to validity.

### P10 — Provenance

| Field | Collected value |
| --- | --- |
| Paper ID | 10 |
| Title | Cloud Infrastructure Management in the Age of AI Agents |
| Authors | Zhenning Yang; Archit Bhatnagar; Yiming Qiu; Tongyuan Miao; Patrick Tser Jern Kon; Yunming Xiao; Yibo Huang; Martin Casado; Ang Chen |
| Year | 2025 |
| Publication status | arXiv position/preliminary-study preprint; no peer-reviewed venue verified |
| Venue | arXiv cs.AI |
| DOI | 10.48550/arXiv.2506.12270 |
| arXiv ID | 2506.12270 |
| Version | v1, 2025-06-13 |
| Source record URL | [https://arxiv.org/abs/2506.12270](https://arxiv.org/abs/2506.12270) |
| PDF URL | [https://arxiv.org/pdf/2506.12270v1](https://arxiv.org/pdf/2506.12270v1) |
| Local PDF | [10-cloud-infrastructure-ai-agents.pdf](research/10-cloud-infrastructure-ai-agents.pdf) |
| License | arXiv non-exclusive distribution license; not a general third-party redistribution grant |
| License URL | [https://arxiv.org/licenses/nonexclusive-distrib/1.0/](https://arxiv.org/licenses/nonexclusive-distrib/1.0/) |
| SHA-256 | ba80e42d961ba40f4242b9b6db417e4fcae59bf92266cc397b6a097a14c3eda4 |
| Bytes | 1555893 |
| Pages | 8 |
| Retrieved date | 2026-10-29 |
| PDF title/authors verified | Yes |
| License note | Original PDF retained without modification; source availability is not a blanket permission to redistribute commercially or publicly. Preserve attribution and verify reuse rights. |

**Evidence findings:**

- PDF pages 2, 3, 4: Preliminary Azure VM study compares SDK,CLI,Terraform and web agents for provisioning,updates,monitoring; different underlying models limit comparability.
- PDF pages 3: Provisioning uses three VM tasks with eight trials per task; step counts are agent actions, not elapsed time.
- PDF pages 5, 6: Proposed architecture separates user-agent and agent-cloud interfaces; recommends unified state,locking,policy checks,audit trails,rollback and human supervision.

<a id="additional-sources"></a>

## Source and license links

The following index collects the external paper, publisher, product, setup and license references cited above. Paper claims retain their inline citations and physical PDF page references; company descriptions remain dated vendor documentation rather than independent product trials.

- [http://arxiv.org/licenses/nonexclusive-distrib/1.0/](http://arxiv.org/licenses/nonexclusive-distrib/1.0/)
- [https://arxiv.org/abs/1905.07314](https://arxiv.org/abs/1905.07314)
- [https://arxiv.org/abs/2506.05623](https://arxiv.org/abs/2506.05623)
- [https://arxiv.org/abs/2506.12270](https://arxiv.org/abs/2506.12270)
- [https://arxiv.org/abs/2509.05303](https://arxiv.org/abs/2509.05303)
- [https://arxiv.org/abs/2601.08734](https://arxiv.org/abs/2601.08734)
- [https://arxiv.org/licenses/nonexclusive-distrib/1.0/](https://arxiv.org/licenses/nonexclusive-distrib/1.0/)
- [https://arxiv.org/pdf/1905.07314v2](https://arxiv.org/pdf/1905.07314v2)
- [https://arxiv.org/pdf/2506.05623v3](https://arxiv.org/pdf/2506.05623v3)
- [https://arxiv.org/pdf/2506.12270v1](https://arxiv.org/pdf/2506.12270v1)
- [https://arxiv.org/pdf/2509.05303v1](https://arxiv.org/pdf/2509.05303v1)
- [https://arxiv.org/pdf/2601.08734v1](https://arxiv.org/pdf/2601.08734v1)
- [https://conf.researchr.org/details/fse-2026/fse-2026-research-papers/43/Deployability-Centric-Infrastructure-as-Code-Generation-Fail-Learn-Refine-and-Suc](https://conf.researchr.org/details/fse-2026/fse-2026-research-papers/43/Deployability-Centric-Infrastructure-as-Code-Generation-Fail-Learn-Refine-and-Suc)
- [https://conf.researchr.org/details/icse-2026/icse-2026-software-engineering-in-practice/43/TerraFormer-Automated-Infrastructure-as-Code-with-LLMs-Fine-Tuned-via-Policy-Guided-](https://conf.researchr.org/details/icse-2026/icse-2026-software-engineering-in-practice/43/TerraFormer-Automated-Infrastructure-as-Code-with-LLMs-Fine-Tuned-via-Policy-Guided-)
- [https://creativecommons.org/licenses/by-nc-nd/4.0/](https://creativecommons.org/licenses/by-nc-nd/4.0/)
- [https://creativecommons.org/licenses/by/4.0/](https://creativecommons.org/licenses/by/4.0/)
- [https://docs.aws.amazon.com/infrastructure-composer/latest/dg/what-is-composer.html](https://docs.aws.amazon.com/infrastructure-composer/latest/dg/what-is-composer.html)
- [https://docs.brainboard.co/getting-started/fast-track](https://docs.brainboard.co/getting-started/fast-track)
- [https://docs.docker.com/build/building/secrets/](https://docs.docker.com/build/building/secrets/)
- [https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)
- [https://docs.firefly.ai/key-features/drift-detection](https://docs.firefly.ai/key-features/drift-detection)
- [https://docs.massdriver.cloud/](https://docs.massdriver.cloud/)
- [https://doi.org/10.1007/978-3-642-45005-1_62](https://doi.org/10.1007/978-3-642-45005-1_62)
- [https://doi.org/10.1007/978-3-642-45005-1_64](https://doi.org/10.1007/978-3-642-45005-1_64)
- [https://link.springer.com/article/10.1007/s00450-019-00412-x](https://link.springer.com/article/10.1007/s00450-019-00412-x)
- [https://link.springer.com/article/10.1186/s13677-019-0138-7](https://link.springer.com/article/10.1186/s13677-019-0138-7)
- [https://link.springer.com/content/pdf/10.1186/s13677-019-0138-7.pdf](https://link.springer.com/content/pdf/10.1186/s13677-019-0138-7.pdf)
- [https://nextjs.org/docs/app/guides/environment-variables](https://nextjs.org/docs/app/guides/environment-variables)
- [https://papers.nips.cc/paper_files/paper/2024/file/f26b29298ae8acd94bd7e839688e329b-Paper-Datasets_and_Benchmarks_Track.pdf](https://papers.nips.cc/paper_files/paper/2024/file/f26b29298ae8acd94bd7e839688e329b-Paper-Datasets_and_Benchmarks_Track.pdf)
- [https://papers.nips.cc/paper_files/paper/2024/hash/f26b29298ae8acd94bd7e839688e329b-Abstract-Datasets_and_Benchmarks_Track.html](https://papers.nips.cc/paper_files/paper/2024/hash/f26b29298ae8acd94bd7e839688e329b-Abstract-Datasets_and_Benchmarks_Track.html)
- [https://repositum.tuwien.at/bitstream/20.500.12708/203669/1/Chiari-2024-Information%20Systems-vor.pdf](https://repositum.tuwien.at/bitstream/20.500.12708/203669/1/Chiari-2024-Information%20Systems-vor.pdf)
- [https://repositum.tuwien.at/handle/20.500.12708/203669](https://repositum.tuwien.at/handle/20.500.12708/203669)
- [https://spacelift.io/platform/how-it-works](https://spacelift.io/platform/how-it-works)
- [https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-45-OpenTOSCA_A_Runtime_for_TOSCA-based_Cloud_Applications.pdf](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-45-OpenTOSCA_A_Runtime_for_TOSCA-based_Cloud_Applications.pdf)
- [https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-46-Winery_A_Modeling_Tool_for_TOSCA-based_Cloud_Applications.pdf](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-46-Winery_A_Modeling_Tool_for_TOSCA-based_Cloud_Applications.pdf)
- [https://www.pulumi.com/docs/ai/concepts/neo/](https://www.pulumi.com/docs/ai/concepts/neo/)
- [https://www.sciencedirect.com/science/article/pii/S0306437924000802](https://www.sciencedirect.com/science/article/pii/S0306437924000802)
