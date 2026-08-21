import type { GraphDefinition } from "@cloudcanvas/graph-contract";

declare module 'express' {
    interface Request {
        userId?: string;
        graph?: GraphDefinition;
    }
}

declare global {
    namespace Express {
        interface Request {
            userId?: string;
            graph?: GraphDefinition;
        }
    }
}
