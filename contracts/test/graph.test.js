import assert from "node:assert/strict";
import test from "node:test";

import { GraphValidationError, parseGraphYaml, validateGraphObject } from "../dist/index.js";

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
