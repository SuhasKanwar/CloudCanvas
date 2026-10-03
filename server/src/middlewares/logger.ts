import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export default function logger(req: Request, res: Response, next: NextFunction) {
    const requestId = randomUUID();
    const startedAt = Date.now();
    res.setHeader("X-Request-Id", requestId);
    res.once("finish", () => {
        process.stdout.write(`${JSON.stringify({
            level: res.statusCode >= 500 ? "error" : "info",
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Date.now() - startedAt,
        })}\n`);
    });
    next();
}
