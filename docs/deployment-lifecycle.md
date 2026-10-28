# Deployment lifecycle

[Documentation map](README.md) · [User flow](user-flow.md)

Publish runs sequentially within the Express request. There is no external job
queue or transaction spanning AWS calls and PostgreSQL. Earlier successful
resources remain after a later failure; cleanup is explicit.

## Publish and readiness

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

## Supported dependency and output flow

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

## Cleanup and pending CloudFront deletion

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

## Source entry points

- [Deployment and cleanup controller](../server/src/controllers/infrastructureController.ts), [resource dispatcher](../server/src/services/aws/index.ts)
- [Deployment graph and reference resolution](../server/src/services/aws/graph.ts), [readiness helper](../server/src/services/aws/readiness.ts), [timing/concurrency settings](../server/src/lib/config.ts)
- [Contract graph rules](../contracts/src/index.ts), [resource schema](../contracts/graph.schema.json)
- [CloudFront lifecycle](../server/src/services/aws/resources/cloudfront.ts), [S3 cleanup](../server/src/services/aws/resources/s3.ts), [ECR cleanup](../server/src/services/aws/resources/ecr.ts)
- [Editor polling](../client/src/components/graph/GraphEditor.tsx), [poll interval](../client/src/lib/config.ts)
