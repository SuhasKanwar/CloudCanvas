import { Buffer } from "node:buffer";
import {
    CreateFunctionCommand,
    DeleteFunctionCommand,
    type CreateFunctionCommandOutput,
    type DeleteFunctionCommandOutput,
    type Runtime,
} from "@aws-sdk/client-lambda";

export type LambdaFunctionRequest = {
    functionName: string;
    roleArn: string;
    handler: string;
    runtime: Runtime;
    codeZipBase64: string;
    description?: string;
    memorySize?: number;
    timeout?: number;
};

export type LambdaFunctionResult = {
    region: string;
    functionName: string;
    functionArn: string;
    version: string | undefined;
};

export type LambdaDeleteResult = {
    region: string;
    functionName: string;
};

export type LambdaCommandSender = {
    create: (command: CreateFunctionCommand) => Promise<CreateFunctionCommandOutput>;
    delete: (command: DeleteFunctionCommand) => Promise<DeleteFunctionCommandOutput>;
};

export class LambdaService {
    constructor(private readonly send: LambdaCommandSender, private readonly region: string) {}

    async createFunction(request: LambdaFunctionRequest): Promise<LambdaFunctionResult> {
        if (!request.functionName || !request.roleArn || !request.handler || !request.runtime || !request.codeZipBase64) {
            throw new Error("functionName, roleArn, handler, runtime, and codeZipBase64 are required to create a Lambda function.");
        }
        const result = await this.send.create(new CreateFunctionCommand({
            FunctionName: request.functionName,
            Role: request.roleArn,
            Handler: request.handler,
            Runtime: request.runtime,
            Code: { ZipFile: Buffer.from(request.codeZipBase64, "base64") },
            ...(request.description && { Description: request.description }),
            ...(request.memorySize !== undefined && { MemorySize: request.memorySize }),
            ...(request.timeout !== undefined && { Timeout: request.timeout }),
        }));
        if (!result.FunctionArn) throw new Error("AWS did not return a Lambda function ARN.");
        return {
            region: this.region,
            functionName: result.FunctionName ?? request.functionName,
            functionArn: result.FunctionArn,
            version: result.Version,
        };
    }

    async deleteFunction(functionName: string): Promise<LambdaDeleteResult> {
        if (!functionName) throw new Error("functionName is required to delete a Lambda function.");
        await this.send.delete(new DeleteFunctionCommand({ FunctionName: functionName }));
        return { region: this.region, functionName };
    }
}
