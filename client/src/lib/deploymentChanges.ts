import type { AwsService } from "@cloudcanvas/graph-contract";

type ChangeField = { key: string; label: string };

const mutableFields: Partial<Record<AwsService, ChangeField[]>> = {
    EC2_INSTANCE: [
        { key: "securityGroupIds", label: "Security groups" },
        { key: "shutdownBehavior", label: "Shutdown behavior" },
        { key: "monitoring", label: "Detailed monitoring" },
        { key: "disableApiTermination", label: "Termination protection" },
    ],
    S3_BUCKET: [
        { key: "versioning", label: "Versioning" },
        { key: "blockPublicAccess", label: "Block public access" },
        { key: "encryption", label: "Encryption" },
        { key: "kmsKeyArn", label: "KMS key" },
        { key: "enforceHttps", label: "Require HTTPS" },
    ],
};

function valuesMatch(currentValue: unknown, deployedValue: unknown) {
    if (Array.isArray(currentValue) && Array.isArray(deployedValue) && currentValue.every((value) => typeof value === "string") && deployedValue.every((value) => typeof value === "string")) {
        if (currentValue.some((value) => value.startsWith("${"))) return true;
        return JSON.stringify([...currentValue].sort()) === JSON.stringify([...deployedValue].sort());
    }
    return JSON.stringify(currentValue) === JSON.stringify(deployedValue);
}

export function getPendingDeploymentChanges(service: AwsService, currentConfig: Record<string, unknown>, deployedConfig: Record<string, unknown>) {
    return (mutableFields[service] ?? []).filter(({ key }) => !valuesMatch(currentConfig[key], deployedConfig[key]));
}
