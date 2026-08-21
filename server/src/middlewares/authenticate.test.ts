import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../lib/config.js";
import authenticate from "./authenticate.js";

test("authenticates a Bearer token", () => {
    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const req = {
        cookies: {},
        get: (name: string) => name === "Authorization" ? `Bearer ${token}` : undefined,
    } as never;
    const res = {
        status: () => res,
        json: () => res,
    } as never;
    let called = false;

    authenticate(req, res, () => {
        called = true;
    });

    assert.equal(called, true);
    assert.equal((req as { userId?: string }).userId, "user-1");
});
