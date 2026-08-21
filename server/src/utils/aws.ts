import { AwsService } from "../services/aws/types.js";

export function isAwsService(value: unknown): value is AwsService {
    return typeof value === "string" && Object.values(AwsService).includes(value as AwsService);
}
