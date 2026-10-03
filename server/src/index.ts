import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import type { ApiResponse } from './types/response.js';
import { ALLOWED_ORIGINS, PORT, TRUST_PROXY_HOPS, validateRuntimeConfig } from './lib/config.js';
import cors from 'cors';
import logger from './middlewares/logger.js';
import authRouter from './routes/authRouter.js';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authenticate from "./middlewares/authenticate.js";
import awsRouter from './routes/awsRouter.js';
import sketchRouter from './routes/sketchRouter.js';
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import prisma from "./lib/prisma.js";

dotenv.config();

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));
app.use(logger);
app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "2mb", parameterLimit: 100 }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again shortly." },
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many authentication attempts. Please try again later." },
});

app.get("/", (_req: Request, res: Response<ApiResponse>) => {
    res.json({
        success: true,
        message: "CloudCanvas server is running successfully."
    });
});

app.get("/health/live", (_req: Request, res: Response<ApiResponse>) => {
    res.json({
        success: true,
        message: "CloudCanvas process is live."
    });
});
app.get("/health", (_req: Request, res: Response<ApiResponse>) => {
    res.json({ success: true, message: "CloudCanvas process is live." });
});

app.get("/health/ready", async (_req: Request, res: Response<ApiResponse>) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ success: true, message: "CloudCanvas is ready." });
    } catch {
        res.status(503).json({ success: false, message: "CloudCanvas is not ready." });
    }
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/aws", authenticate, awsRouter);
app.use("/api/sketches", authenticate, sketchRouter);

app.use((_req: Request, res: Response<ApiResponse>) => {
    res.status(404).json({ success: false, message: "API route not found." });
});

const errorHandler: ErrorRequestHandler = (error, _req, res: Response<ApiResponse>, _next) => {
    const status = error?.type === "entity.too.large" ? 413 : error?.type === "entity.parse.failed" ? 400 : 500;
    if (status === 500) {
        console.error(JSON.stringify({
            level: "error",
            requestId: res.getHeader("X-Request-Id"),
            message: "Unhandled API error",
            error: error instanceof Error ? error.stack ?? error.message : String(error),
        }));
    }
    res.status(status).json({
        success: false,
        message: status === 413 ? "Request body is too large." : status === 400 ? "Request body contains invalid JSON." : "An unexpected server error occurred.",
    });
};
app.use(errorHandler);

async function start() {
    validateRuntimeConfig();
    await prisma.$connect();
    const server = app.listen(PORT, () => {
        console.log(`CloudCanvas server listening on port ${PORT}`);
    });
    const shutdown = (signal: string) => {
        console.log(`Received ${signal}; closing server.`);
        server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch(async (error: unknown) => {
    console.error("CloudCanvas failed to start:", error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exitCode = 1;
});
