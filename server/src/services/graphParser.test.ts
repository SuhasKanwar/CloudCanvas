import assert from "node:assert/strict";
import test from "node:test";

import { parseGraphDefinition, validateGraphDefinition } from "./graphParser.js";

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
