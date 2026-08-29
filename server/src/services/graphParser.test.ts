import assert from "node:assert/strict";
import test from "node:test";

import { parseGraphDefinition, prepareGraphForPersistence, validateGraphDefinition } from "./graphParser.js";

test("parses YAML before it reaches a sketch controller", () => {
    const graph = parseGraphDefinition(`schemaVersion: 1
name: assets
nodes:
  - id: bucket
    type: S3_BUCKET
    config:
      bucketName: cloudcanvas-assets
edges: []`);
    assert.equal(graph.name, "assets");
});

test("validates AI graph objects with the same contract", () => {
    assert.throws(() => validateGraphDefinition({
        schemaVersion: 1,
        name: "invalid",
        nodes: [{ id: "bucket", type: "S3_BUCKET", config: {} }],
        edges: [],
    }));
});

test("accepts an EC2 key pair graph node", () => {
    const graph = validateGraphDefinition({
        schemaVersion: 1,
        name: "key-pair",
        nodes: [{
            id: "ssh-key",
            type: "KEY_PAIR",
            config: { mode: "existing", keyName: "cloudcanvas" },
        }],
        edges: [],
    });
    assert.equal(graph.nodes[0]?.type, "KEY_PAIR");
});

test("persists incomplete AI resource drafts before deployment configuration", () => {
    const graph = validateGraphDefinition({
        schemaVersion: 1,
        name: "web server",
        nodes: [
            { id: "key", type: "KEY_PAIR", config: {} },
            { id: "security", type: "SECURITY_GROUP", config: { mode: "create" } },
            { id: "instance", type: "EC2_INSTANCE", config: { imageFamily: "amazon-linux", keyName: "${key.keyName}", securityGroupIds: ["${security.securityGroupId}"] } },
        ],
        edges: [
            { sourceNodeId: "key", targetNodeId: "instance" },
            { sourceNodeId: "security", targetNodeId: "instance" },
        ],
    });

    const prepared = prepareGraphForPersistence(graph);
    assert.deepEqual(prepared.map((node) => node.config), graph.nodes.map((node) => node.config));
});
