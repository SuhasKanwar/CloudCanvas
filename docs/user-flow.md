# User flow

[Documentation map](README.md) · [System architecture](system-architecture.md)

This flow follows the current browser UI. Import and direct AI sketch creation
also exist as API operations; the dashboard currently exposes New sketch and
Open sketch, without a standalone import or AI-create screen.

## Entry and workspace

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

## Design, review, and publish

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

## Source entry points

- [Dashboard guard](../client/src/app/dashboard/page.tsx), [sketch index](../client/src/components/dashboard/SketchIndex.tsx), [connection settings](../client/src/components/dashboard/AwsConnectionsPanel.tsx)
- [Editor and autosave](../client/src/components/graph/GraphEditor.tsx), [publish control](../client/src/components/graph/PublishSketchButton.tsx), [AI composer](../client/src/components/graph/AiComposer.tsx)
- [S3 object panel](../client/src/components/graph/BucketObjectsPanel.tsx), [invalid-session handler](../client/src/components/auth/InvalidSessionHandler.tsx)
- [Server lifecycle and edit guards](../server/src/controllers/infrastructureController.ts), [AI detail](ai-request-flow.md), [deployment detail](deployment-lifecycle.md)
