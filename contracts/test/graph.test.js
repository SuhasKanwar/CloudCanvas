import assert from "node:assert/strict";
import test from "node:test";

import { GraphValidationError, layoutOverlappingGraphNodes, parseGraphYaml, validateGraphObject } from "../dist/index.js";

test("parses a valid YAML graph", () => {
    const graph = parseGraphYaml(`schemaVersion: 1
name: assets
nodes:
  - id: bucket
    type: S3_BUCKET
    config:
      bucketName: cloudcanvas-assets
edges: []`);
    assert.equal(graph.nodes[0].positionX, 0);
});

test("rejects cyclic and unsupported graphs", () => {
    assert.throws(() => validateGraphObject({
        schemaVersion: 1,
        name: "bad",
        nodes: [
            { id: "a", type: "S3_BUCKET", config: { bucketName: "a" } },
            { id: "b", type: "S3_BUCKET", config: { bucketName: "b" } },
        ],
        edges: [
            { sourceNodeId: "a", targetNodeId: "b" },
            { sourceNodeId: "b", targetNodeId: "a" },
        ],
    }), GraphValidationError);
});

test("lays out overlapping nodes by dependency depth", () => {
    const nodes = [
        { id: "key", type: "KEY_PAIR", positionX: 0, positionY: 0, config: {} },
        { id: "security", type: "SECURITY_GROUP", positionX: 0, positionY: 0, config: {} },
        { id: "instance", type: "EC2_INSTANCE", positionX: 0, positionY: 0, config: {} },
    ];
    const laidOut = layoutOverlappingGraphNodes(nodes, [
        { sourceNodeId: "key", targetNodeId: "instance" },
        { sourceNodeId: "security", targetNodeId: "instance" },
    ]);
    assert.equal(new Set(laidOut.map((node) => `${node.positionX}:${node.positionY}`)).size, 3);
    assert.ok(laidOut.find((node) => node.id === "instance").positionY > laidOut.find((node) => node.id === "key").positionY);
});
