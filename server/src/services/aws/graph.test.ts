import assert from "node:assert/strict";
import test from "node:test";

import { createGraphPlan, remapConfigReferences, resolveConfigReferences } from "./graph.js";

test("orders source nodes before targets and resolves direct references", () => {
    const plan = createGraphPlan(
        [{ id: "role" }, { id: "lambda" }],
        [{ sourceNodeId: "role", targetNodeId: "lambda" }],
    );
    assert.deepEqual(plan.order, ["role", "lambda"]);
    assert.deepEqual(plan.order.slice().reverse(), ["lambda", "role"]);
    assert.deepEqual(
        resolveConfigReferences("${role.roleArn}", "lambda", plan.sourcesByTarget, new Map([
            ["role", { roleArn: "arn:aws:iam::123:role/app" }],
        ])),
        "arn:aws:iam::123:role/app",
    );
});

test("rejects invalid edges and remaps AI node references", () => {
    assert.throws(() => createGraphPlan(
        [{ id: "a" }, { id: "b" }],
        [{ sourceNodeId: "a", targetNodeId: "b" }, { sourceNodeId: "b", targetNodeId: "a" }],
    ));
    assert.equal(
        remapConfigReferences("${role.roleArn}", new Map([["role", "db-role"]])),
        "${db-role.roleArn}",
    );
});
