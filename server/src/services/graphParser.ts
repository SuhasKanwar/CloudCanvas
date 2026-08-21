import type { NextFunction, Request, Response } from "express";
import {
    GraphValidationError,
    parseGraphYaml,
    validateGraphObject,
    type GraphDefinition,
} from "@cloudcanvas/graph-contract";

import type { ApiResponse } from "../types/response.js";

export function parseGraphDefinition(definition: string): GraphDefinition {
    return parseGraphYaml(definition);
}

export function validateGraphDefinition(graph: unknown): GraphDefinition {
    return validateGraphObject(graph);
}

export function graphParser(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
        req.graph = parseGraphDefinition(req.body?.definition);
        next();
    } catch (error) {
        if (error instanceof GraphValidationError) {
            return res.status(400).json({
                success: false,
                message: "Graph validation failed.",
                data: { diagnostics: error.diagnostics },
            });
        }
        return res.status(400).json({ success: false, message: "Graph parsing failed." });
    }
}
