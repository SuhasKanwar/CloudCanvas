# System architecture

[Documentation map](README.md) · [User flow](user-flow.md)

CloudCanvas separates the design UI, application API, and AI runtime. Express
owns persistence and AWS operations. AI produces advice or draft graphs; resource
creation is performed only through the deployment API.

## Runtime components

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

## Persistence relationships

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

## Boundaries and limits

AWS credentials enter through connection settings and are encrypted at rest with
`AWS_ENCRYPTION_KEY`; the API returns connection metadata. The AI receives catalog
metadata and, for tools, the user's API JWT rather than raw AWS credentials.
Catalog caching is process-local, not shared across replicas.

Protected controllers scope data to the JWT user ID. This is not proof that every
boundary is hardened: FastAPI has no service authentication in the current source,
and the Express Google exchange does not verify a Google token independently.
There is no durable deployment worker or event-driven AWS status feed.

## Source entry points

- [Client auth callbacks](../client/src/app/api/auth/[...nextauth]/options.ts), [API client](../client/src/lib/api.ts), [graph editor](../client/src/components/graph/GraphEditor.tsx)
- [Express entry point](../server/src/index.ts), [JWT middleware](../server/src/middlewares/authenticate.ts), [infrastructure controller](../server/src/controllers/infrastructureController.ts)
- [AWS dispatcher](../server/src/services/aws/index.ts), [encryption](../server/src/services/aws/crypto.ts), [bucket APIs](../server/src/controllers/bucketObjectsController.ts)
- [Prisma schema](../server/prisma/schema.prisma), [shared graph contract](../contracts/src/index.ts)
- [FastAPI route](../service/routers/agent.py), [active agent graph](../service/agents/graph.py), [catalog callback](../service/tools/aws_catalog.py)
