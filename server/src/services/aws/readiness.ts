import type { AwsResourceDetails } from "./types.js";

export async function waitForResourceReady(read: () => Promise<AwsResourceDetails>, timeoutMs: number, intervalMs: number): Promise<AwsResourceDetails> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
        let details: AwsResourceDetails | undefined;
        try { details = await read(); } catch (error) {
            if (!(error instanceof Error) || !/notfound|not found|nosuch/i.test(`${error.name} ${error.message}`)) throw error;
        }
        if (details?.status === "RUNNING") return details;
        if (details?.status === "FAILED" || details?.status === "TERMINATED" || details?.status === "DELETING") {
            throw new Error(`Dependency is ${details.status.toLowerCase()}.`);
        }
        if (Date.now() >= deadline) throw new Error("Dependency did not become ready before the deployment timeout.");
        await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, deadline - Date.now())));
    }
}
