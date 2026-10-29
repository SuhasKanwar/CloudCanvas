# CloudCanvas implementation and commercial comparisons

Research date: 2026-10-29. Source baseline: `3fb7def7d852d52177fb343c7d8f793588f5d9b3`.
These notes supply implementation evidence and product comparisons for the main
research report. Product descriptions below are vendor-stated capabilities, not
independent product benchmarks. Repository links are relative to this notes file;
line numbers are for the baseline commit and may shift after future edits.

## What is implemented and what limits the current claims?

### Takeaway

CloudCanvas implements an AWS-specific visual graph workspace and a deterministic
deployment path around AI-generated drafts. Its defensible contribution is the
integration and explicit operational workflow, not invention of visual cloud
design, JSON Schema validation, topology ordering, or AI-assisted infrastructure.

### Cited findings

| Area | Source-verified implementation | Evidence |
| --- | --- | --- |
| Supported scope | Eleven graph node types: EC2 instance, key pair, security group, ECR repository, S3 bucket, IAM role, Lambda function, DynamoDB table, SQS queue, SNS topic, CloudFront distribution. The only accepted attachment pairings are key pair → EC2, security group → EC2, IAM role → Lambda, S3 → CloudFront. | [Shared contract](../../../../contracts/src/index.ts), `AwsService`, lines 9–20; `canConnectResources`, lines 47–51. |
| Graph validation | AJV JSON Schema checks, YAML parsing with duplicate-key and alias restrictions, unique-node/edge checks, supported attachments, acyclicity, and direct-edge requirements for configuration references. This validates supported structure, not complete AWS security or business intent. | [Shared contract](../../../../contracts/src/index.ts), `createGraphPlan`, line 65; `validateGraphObject`, line 155; `parseGraphYaml`, line 170; [schema](../../../../contracts/graph.schema.json). |
| Workspace persistence | Graph editor computes incremental canvas diffs and persists edge/node deletion, creation, position changes and configuration changes through separate API calls. It queues debounced saves; the UI also has undo/redo. | [Graph editor](../../../../client/src/components/graph/GraphEditor.tsx), `persistCanvas`, line 249; queue/flush, lines 273–287; [history helper](../../../../client/src/hooks/useCanvasHistory.ts). |
| Full graph replacement | Save and Apply blueprint validate YAML and call the full import/replace API. The replacement API blocks replacement while any associated resource is non-terminated; accepted replacement runs in a database transaction and remaps node references. | [Graph editor](../../../../client/src/components/graph/GraphEditor.tsx), `saveGraph`, line 289, `applyBlueprint`, line 343; [infrastructure controller](../../../../server/src/controllers/infrastructureController.ts), `replaceSketchGraph`, lines 533–560, `persistPreparedGraph`. |
| AI routing and tools | Active LangGraph routes AWS build requests to the structured AWS router and general conversation to NVIDIA, with a tool loop. Tools are resource-support guidance, DuckDuckGo search, and AWS catalog lookup. A defined Llama wrapper is not part of this active graph. | [Compiled graph](../../../../service/agents/graph.py), `compile_graph`, lines 18–37; [nodes](../../../../service/agents/nodes.py); [catalog tool](../../../../service/tools/aws_catalog.py). |
| Catalog grounding | Conversation controller obtains bounded catalog context for the sketch/active AWS connection. Python catalog tools call authenticated Express catalog endpoints with the user's bearer token, held in request-local context. Raw AWS credentials are decrypted in Express, not handed to the model. Catalog failure falls back to empty context. | [Conversation controller](../../../../server/src/controllers/conversationController.ts), `awsCatalogContext`, lines 52–80, query call lines 134–142; [catalog callback](../../../../service/tools/aws_catalog.py), lines 17–44. |
| AI review gate | Express validates returned build shape and shared graph contract; user explicitly chooses Apply blueprint to replace the canvas, then separately chooses Publish to provision resources. Applying a blueprint overwrites the graph; it is not an additive merge or cloud deployment. | [AI adapter](../../../../server/src/services/aiService.ts), `parseAiAgentResponse`, lines 140–176; [AI composer](../../../../client/src/components/graph/AiComposer.tsx), `applyBlueprint`, line 88; [publish button](../../../../client/src/components/graph/PublishSketchButton.tsx), lines 25–31. |
| Dependency execution | Express constructs a topological plan, waits for direct dependencies, resolves configuration references from resource outputs, and dispatches SDK create/update operations. It provisions sequentially within the request. | [Infrastructure controller](../../../../server/src/controllers/infrastructureController.ts), `deploySketch`, line 856, source readiness lines 940–955; [deployment graph](../../../../server/src/services/aws/graph.ts), `resolveConfigReferences`; [readiness helper](../../../../server/src/services/aws/readiness.ts), lines 3–16. |
| Recorded state | PostgreSQL/Prisma models separately persist sketches, nodes, edges, connections, AWS resources, deployment requests/results/errors, and per-sketch conversation/messages. Resource records separate `desiredConfig` from `actualState` and retain `managed`, status, external IDs and last errors. | [Prisma schema](../../../../server/prisma/schema.prisma), models `Sketch` line 67, `AwsConnection` line 125, `AwsResource` line 147, `Deployment` line 176, `SketchConversation` line 196, `ChatMessage` line 212. |
| Status observation | Browser editor invokes resource refresh on load and a timer (default 30 seconds). Server refresh describes resources and records their returned state. This is not a background drift-detection or reconciliation system comparing every desired field with live configuration. | [Editor](../../../../client/src/components/graph/GraphEditor.tsx), lines 131–147; [interval config](../../../../client/src/lib/config.ts), line 6; [refresh controller](../../../../server/src/controllers/infrastructureController.ts), `refreshResourceRecord`, lines 141–180. |
| Managed versus adopted cleanup | Existing EC2/key-pair/security-group resources can be adopted. Unmanaged records are terminated/detached locally without an AWS delete call. Managed cleanup calls AWS; bulk/sketch cleanup uses reverse graph order and stops at a pending/failed result. S3 bucket deletion clears contents/versions, and ECR deletion is forced. | [Infrastructure controller](../../../../server/src/controllers/infrastructureController.ts), `isAdoptedResource`, `deleteResourceRecord`, lines 80–125, `deleteSketchResourceRecords`, lines 127–138; [S3 deletion](../../../../server/src/services/aws/resources/s3.ts), `deleteBucket`; [ECR deletion](../../../../server/src/services/aws/resources/ecr.ts), `deleteRepository`. |
| S3/CloudFront path | Managed frontend delivery creates private S3-origin CloudFront infrastructure with OAC and a scoped bucket policy. CloudFront setup records identifiers before final policy setup. Deletion disables first and is completed through subsequent refresh after propagation. Managed running S3 buckets have a direct browser upload path through scoped forms (600-second expiry, 100-MiB bound). | [CloudFront service](../../../../server/src/services/aws/resources/cloudfront.ts), `create`, `delete`, lines 81–103 and 129–162; [bucket object service](../../../../server/src/services/aws/resources/objects.ts), lines 4 and 48–52; [bucket API](../../../../server/src/controllers/bucketObjectsController.ts). |
| Credential handling and ownership | AWS secrets use AES-256-GCM with random 12-byte IVs; the key is SHA-256-derived from `AWS_ENCRYPTION_KEY`. Express JWT middleware protects AWS/sketch routes, and controllers scope owned data. This alone is not a complete security qualification. | [Crypto implementation](../../../../server/src/services/aws/crypto.ts), lines 3–23; [Express entry](../../../../server/src/index.ts), lines 40–42; [JWT middleware](../../../../server/src/middlewares/authenticate.ts); [owned-sketch query](../../../../server/src/controllers/infrastructureController.ts), lines 861–864. |
| Local reproducibility | Docker Compose defines PostgreSQL, client, API and AI containers, folder-specific env loading, health checks, a database volume, migration startup and internal service URLs. Node image builds compile the sibling contracts package and server Prisma client. This packages CloudCanvas itself; it is not a user-facing Docker image deployment pipeline. | [Compose](../../../../docker-compose.yml); [client Dockerfile](../../../../docker/Dockerfile.client), lines 4–15; [server Dockerfile](../../../../docker/Dockerfile.server), lines 3–13. |

Material limitations to retain in the main report:

- The public Express Google exchange consumes caller-supplied profile fields and
  can issue an API JWT without independently verifying a Google token. The
  NextAuth Google flow does not remove that separate API trust-boundary weakness.
  Evidence: [Google handler](../../../../server/src/controllers/authController.ts),
  `googleAuthHandler`, lines 147–195; [auth route](../../../../server/src/routes/authRouter.ts),
  line 7; [public auth mount](../../../../server/src/index.ts), line 40.
- The FastAPI query endpoint currently has no service authentication guard. The
  Docker network limits exposure in this Compose configuration but is not a
  replacement for API-level authentication. Evidence: [query route](../../../../service/routers/agent.py),
  lines 11–38; [Compose internal AI service](../../../../docker-compose.yml), lines 16–31.
- Publish preflight checks resource states, but the reservation is not atomic.
  Two callers can pass the check before provisioning records are written. No
  durable background job, idempotency key or automatic rollback is implemented in
  this controller. Evidence: [deploySketch](../../../../server/src/controllers/infrastructureController.ts),
  preflight lines 908–925, deployment creation lines 929–936, loop lines 940 onward.
- Some conflicts and update failures after `Deployment` creation return without
  finalizing its default `PENDING` record. Evidence: [update branch](../../../../server/src/controllers/infrastructureController.ts),
  lines 958–977; [default deployment status](../../../../server/prisma/schema.prisma), model `Deployment`.
- The server has supported update handlers, but normal live-resource configuration
  edits are blocked by `updateSketchNode`; do not imply a proven end-to-end mutable
  update journey from editable form fields. Evidence: [node PATCH guard](../../../../server/src/controllers/infrastructureController.ts),
  lines 655–666 versus update branch lines 968–977.
- Most successful creation returns are initially marked `RUNNING`; CloudFront
  remains `PROVISIONING`. Source readiness waits happen before dependent creation,
  and later refresh updates status, but neither application status nor a successful
  publish receipt establishes workload/application health. Evidence:
  [creation state](../../../../server/src/controllers/infrastructureController.ts), lines 1020–1033;
  [readiness helper](../../../../server/src/services/aws/readiness.ts).

### Inferences

- **Defensible implementation contribution:** an AWS-focused, bounded graph as a
  common intermediate representation between visual editing, AI drafting,
  persistence and SDK execution. This is an integration/design contribution, not
  a novel graph algorithm or newly trained foundation model. Its evidence is the
  contract, AI adapter and deployment controller linked above.
- **Conditional advantage versus a text-only infrastructure answer:** this code
  provides a hard rejection path for unsupported graph structure and a visible
  review step before cloud changes. This says what the software enforces; it does
  not prove improved task accuracy, security, cost or user speed in an experiment.
- **Possible usability focus:** resource outputs, credentialed account choices and
  S3 content delivery remain in the same sketch workflow. Whether this reduces
  context switching is an empirical question, not an established research result.
- **Trade-off:** direct SDK execution avoids requiring the user to author a
  Terraform/CloudFormation program for the supported subset, but the project must
  own lifecycle/recovery semantics and currently lacks the broad IaC ecosystem,
  state locking, plan/export workflow and policy controls of mature alternatives.

### Gaps

No new live AWS/model/Google tests or usability experiment was run in this research
lane. Earlier Docker/test counts from the prior task are historical receipts,
not new comparative evidence. There is no established first-in-world novelty,
measured improvement over the ten papers, multi-cloud implementation, formal
correctness proof, autonomous self-healing, cost optimizer, or production security
qualification in the inspected source. The corpus is a targeted related-work
sample, not an exhaustive novelty or patent search.

## Which companies and products are relevant comparators?

### Takeaway

Commercial prior art already combines visual design, typed infrastructure,
deployment workflows and/or AI. Massdriver and Brainboard are particularly close
to the visual-composition use case, AWS Infrastructure Composer is the native AWS
visual-IaC comparator, and Pulumi, Firefly and Spacelift illustrate the surrounding
AI and governance space. All pages were retrieved on 2026-10-29.

### Cited findings

| Company/product | Vendor-stated capabilities and dated status | CloudCanvas comparison (inference) |
| --- | --- | --- |
| AWS / Infrastructure Composer | Visual CloudFormation/SAM composition, canvas/template synchronization, import/export, and VS Code access. AWS announces standalone-console end of support on **2026-12-07**, while the VS Code experience remains; this is a future announcement as of this report date. [AWS documentation](https://docs.aws.amazon.com/infrastructure-composer/latest/dg/what-is-composer.html). | CloudCanvas executes its narrower graph with SDK handlers rather than generating CloudFormation/SAM. Visual AWS design is established prior art; its 11 nodes cannot be presented as broader resource coverage. |
| Brainboard | Drag-and-drop cloud-resource design, automatic Terraform code, cloud credentials, and Terraform/OpenTofu plan output from the design UI. [Official fast-track guide](https://docs.brainboard.co/getting-started/fast-track). | Close visual design-to-deployment comparator. CloudCanvas's reviewable graph/SDK path differs from Brainboard's IaC/plan surface; the smaller interface may suit a curated workflow, but simplicity and learning time require testing. |
| Massdriver | Visual composition/deployment of reusable IaC bundles, JSON Schema input/output contracts, dependency validation, pipeline execution, state management and compliance checks. [Official documentation](https://docs.massdriver.cloud/). | Closest rebuttal to broad novelty around a typed visual deployment graph. CloudCanvas is a narrower AWS resource-node workspace with built-in drafting; Massdriver demonstrates existing contract-driven composition and richer platform governance. |
| Pulumi / Neo | Pulumi describes Neo as a personal infrastructure agent that investigates infrastructure, previews changes and updates Pulumi code. Access derives from the user's Pulumi permissions and connected-tool credentials; approval settings control actions. [Current Neo documentation](https://www.pulumi.com/docs/ai/concepts/neo/). | AI assistance, state context and human approval are not unique to CloudCanvas. Its main distinction is the canvas-first bounded graph rather than a Pulumi-code task workflow; neither superiority nor comparable enterprise maturity is established. |
| Firefly | Vendor documentation describes desired-versus-live drift detection, notifications, side-by-side drift insight and generated remediation/PR workflows. [Official drift documentation](https://docs.firefly.ai/key-features/drift-detection). | CloudCanvas records resource observations but does not implement comparable continuous drift reconciliation. Firefly is a useful lesson for separating observed state, desired state, proposed correction and authorized execution. Do not repeat vendor speed claims as measured facts. |
| Spacelift | VCS-integrated multi-IaC runs on workers, proposed/tracked runs, optional approvals, OPA/Rego policy enforcement and scheduled drift checks/reconciliation. [Official platform description](https://spacelift.io/platform/how-it-works). | CloudCanvas currently lacks equivalent worker/run durability, VCS workflow and general policy engine. Spacelift is a governance/lifecycle comparator rather than a claim that its primary UI is the same kind of canvas. |

The source content for the current Neo page differs from some search snippets
that described more specific model/provider and PR behaviors. The table uses only
the conservative capabilities in the fetched official page (lines 984–994), not
the additional snippet detail. Product features can change and were not exercised
in a trial or independently benchmarked. Pricing, customer counts and marketing
claims about security/compliance or speed are deliberately not treated as evidence.

### Inferences

- No credible differentiator can be merely “visual cloud design + schemas + AI +
  deployment”: combinations of these already appear in official product material.
  Distinction should be scoped to this implementation's exact workflow, supported
  AWS subset, review representation and reproducible evaluation.
- A realistic target is a transparent educational/prototyping workspace where
  supported dependencies and provisioning outputs are inspectable. This is a
  proposed positioning, not a proven user preference or product-market result.
- Mature products suggest the most important next investments are controlled
  lifecycle execution, explicit plans, policy checks and drift interpretation,
  rather than more autonomous changes before trust boundaries are hardened.

### Gaps

No product trials, paid features, real deployment benchmarks, production-scale
reliability statistics or pricing comparisons were verified. Avoid a binary
feature matrix implying absence merely because one documentation page does not
mention a feature. This table compares positively documented capabilities only.

## What should be learned and evaluated next?

### Takeaway

The strongest potential research claim is a measured benefit of a bounded,
catalog-grounded intermediate graph and explicit user review. The strongest
engineering need is to establish safe execution and recovery before expanding
autonomy or resource breadth. These are proposed improvements, not features
already implemented.

### Cited findings

- Contract validation, credentialed catalog context and user review gates are
  present, but no automatic AWS-security proof follows from them. Source:
  [contract](../../../../contracts/src/index.ts), [catalog context](../../../../server/src/controllers/conversationController.ts),
  [AI adapter](../../../../server/src/services/aiService.ts), [publish UI](../../../../client/src/components/graph/PublishSketchButton.tsx).
- The absence of atomic operation reservation, guaranteed deployment finalization
  and a durable worker is visible in the current request-driven execution path.
  Source: [deployment controller](../../../../server/src/controllers/infrastructureController.ts), lines 908–1059.
- External products provide concrete patterns for typed module contracts,
  previews, permission-aware actions and policy/drift workflows. Sources:
  [Massdriver](https://docs.massdriver.cloud/), [Neo](https://www.pulumi.com/docs/ai/concepts/neo/),
  [Spacelift](https://spacelift.io/platform/how-it-works),
  [Firefly](https://docs.firefly.ai/key-features/drift-detection).

### Inferences

| Priority / learning | Proposed next step | Evidence that would support a claim |
| --- | --- | --- |
| P0: trust boundaries precede AI autonomy | Verify Google identity server-side; authenticate the AI service; explicitly restrict delegated tool privileges; test cross-user denial. | Negative authentication/ownership tests, failed forged-token/profile requests, scoped delegated-token tests. |
| P0: deployment is a durable state machine | Add atomic per-sketch operation reservation/idempotency and guarantee terminal deployment receipts; distinguish accepted work from verified readiness; recover interrupted operations. | Concurrent-publish, timeout/crash/restart and partial-create failure tests showing no duplicated resources and recoverable state. |
| P1: typed graphs constrain representational error | Compare text-only generation against structured graph generation on the same supported tasks. Include valid YAML/JSON but invalid dependencies and unsupported services. | Separate parse/schema/graph/semantic success rates; false accept/reject rates; no comparison of graph validation to Terraform validation alone as if they were identical tasks. |
| P1: catalog grounding must be measured | Run ablations with and without catalog context/tools, keeping model/version and task set fixed. | Invalid/invented identifier rate, selected-region compatibility, task success, token/API cost and latency, with failure categories and uncertainty. |
| P1: review should explain changes | Add an explicit plan/diff and destructive-operation summary before Publish; separate blueprint replacement from merge. | User study on review accuracy, configuration corrections, accidental destructive acceptance, time-to-completion and perceived workload. |
| P1: state observation is not reconciliation | Normalize comparable desired/live fields and classify drift without silently rewriting desired configuration; require approval for corrections. | Injected-drift detection precision/recall, stale-state handling and repair outcome tests. |
| P2: evaluate actual execution | Use isolated AWS test accounts, quotas and teardown records; cover dependency readiness, adoption, failure cleanup and CloudFront propagation. | Deployment and cleanup success rates, unresolved/orphan resource counts, time-to-ready and residual spend, not merely API acceptance. |
| P2: make comparison reproducible | Pin evaluation model/provider versions, prompts, catalog snapshots, schemas, task corpus and budgets; report supported-subset restrictions. | Re-runnable artifacts, multiple trials, held-out tasks, baseline definitions and uncertainty intervals. |

Candidate ablations are: (A) plain text prompt, (B) structured graph generation,
(C) graph generation plus validation feedback, (D) catalog-grounded generation,
(E) catalog plus tools, (F) human-reviewed execution. Report each stage separately;
otherwise execution failures can be hidden behind a high syntax-validity score.
Do not mix vendor feature descriptions, paper benchmark results and CloudCanvas
test counts into one numeric performance ranking.

### Gaps

No numerical targets, superiority margins, user-study results or AWS reliability
figures can be supplied honestly without performing those experiments. None of
the proposed roadmap items should be moved into the “implemented” inventory until
the code and corresponding evidence exist.
