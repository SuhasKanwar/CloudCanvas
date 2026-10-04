import dotenv from "dotenv";

dotenv.config();

export const PORT: number = Number(process.env.PORT) || 9000;
export const NODE_ENV: string = process.env.NODE_ENV || "development";
export const TRUST_PROXY_HOPS: number = Math.max(0, Math.floor(Number(process.env.TRUST_PROXY_HOPS) || 0));
export const DATABASE_URL: string = process.env.DATABASE_URL || "postgresql://postgres:dev@localhost:5432/cloudcanvas";
export const MICROSERVICE_BASE_URL: string = process.env.MICROSERVICE_BASE_URL || "http://localhost:8000";
export const AI_SERVICE_API_KEY: string = process.env.AI_SERVICE_API_KEY || "";
export const AI_SERVICE_TIMEOUT_MS: number = 120000;
export const JWT_SECRET: string = process.env.JWT_SECRET || "";
export const AWS_REGION: string = process.env.AWS_REGION || "ap-south-1";
export const AWS_ENCRYPTION_KEY: string = process.env.AWS_ENCRYPTION_KEY || "";
export const AWS_RESOURCE_STATUS_REFRESH_CONCURRENCY: number = Math.max(1, Math.min(10, Number(process.env.AWS_RESOURCE_STATUS_REFRESH_CONCURRENCY) || 4));
export const AWS_DEPENDENCY_READY_TIMEOUT_MS: number = Math.max(1000, Number(process.env.AWS_DEPENDENCY_READY_TIMEOUT_MS) || 90000);
export const AWS_DEPENDENCY_READY_INTERVAL_MS: number = Math.max(500, Number(process.env.AWS_DEPENDENCY_READY_INTERVAL_MS) || 3000);
export const AWS_DEPLOYMENT_STALE_AFTER_MS: number = Math.max(60 * 60 * 1000, Number(process.env.AWS_DEPLOYMENT_STALE_AFTER_MS) || 6 * 60 * 60 * 1000);

const FRONTEND_URL: string = process.env.FRONTEND_URL || process.env.FRONTED_URL || "http://localhost:3000";
export const ALLOWED_ORIGINS: string[] = [FRONTEND_URL];

export function validateRuntimeConfig() {
    if (!JWT_SECRET) {
        throw new Error("JWT_SECRET must be configured before the server can start.");
    }
    if (NODE_ENV === "production" && JWT_SECRET.length < 32) {
        throw new Error("Production JWT_SECRET must be a random value with at least 32 characters.");
    }
    if (NODE_ENV === "production" && AI_SERVICE_API_KEY.length < 32) {
        throw new Error("Production AI_SERVICE_API_KEY must be a random value with at least 32 characters.");
    }
    if (NODE_ENV === "production" && AWS_ENCRYPTION_KEY.length < 32) {
        throw new Error("Production AWS_ENCRYPTION_KEY must be a random value with at least 32 characters.");
    }
}
