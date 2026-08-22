import {
    CreateBucketCommand,
    DeleteBucketCommand,
    GetBucketPolicyCommand,
    PutBucketEncryptionCommand,
    PutBucketPolicyCommand,
    PutBucketVersioningCommand,
    PutPublicAccessBlockCommand,
    type BucketLocationConstraint,
    type CreateBucketCommandOutput,
    type DeleteBucketCommandOutput,
    type GetBucketPolicyCommandOutput,
    type PutBucketEncryptionCommandOutput,
    type PutBucketPolicyCommandOutput,
    type PutBucketVersioningCommandOutput,
    type PutPublicAccessBlockCommandOutput,
} from "@aws-sdk/client-s3";

export type S3BucketRequest = {
    bucketName: string;
    versioning?: boolean;
    blockPublicAccess?: boolean;
    encryption?: "SSE-S3" | "SSE-KMS";
    kmsKeyArn?: string;
    enforceHttps?: boolean;
};

export type S3BucketResult = {
    region: string;
    bucketName: string;
    location: string | undefined;
};

export type S3DeleteResult = {
    region: string;
    bucketName: string;
};

export type S3CommandSender = {
    create: (command: CreateBucketCommand) => Promise<CreateBucketCommandOutput>;
    delete: (command: DeleteBucketCommand) => Promise<DeleteBucketCommandOutput>;
    getPolicy: (command: GetBucketPolicyCommand) => Promise<GetBucketPolicyCommandOutput>;
    putPolicy: (command: PutBucketPolicyCommand) => Promise<PutBucketPolicyCommandOutput>;
    putEncryption: (command: PutBucketEncryptionCommand) => Promise<PutBucketEncryptionCommandOutput>;
    putVersioning: (command: PutBucketVersioningCommand) => Promise<PutBucketVersioningCommandOutput>;
    putPublicAccessBlock: (command: PutPublicAccessBlockCommand) => Promise<PutPublicAccessBlockCommandOutput>;
};

export class S3Service {
    constructor(private readonly send: S3CommandSender, private readonly region: string) {}

    async createBucket(request: S3BucketRequest): Promise<S3BucketResult> {
        if (!request.bucketName) throw new Error("bucketName is required to create an S3 bucket.");
        const result = await this.send.create(new CreateBucketCommand({
            Bucket: request.bucketName,
            ...(this.region !== "us-east-1" && {
                CreateBucketConfiguration: { LocationConstraint: this.region as BucketLocationConstraint },
            }),
        }));
        await this.configureBucket(request);
        return { region: this.region, bucketName: request.bucketName, location: result.Location };
    }

    async configureBucket(request: S3BucketRequest): Promise<S3BucketResult> {
        if (request.versioning !== undefined) await this.send.putVersioning(new PutBucketVersioningCommand({ Bucket: request.bucketName, VersioningConfiguration: { Status: request.versioning ? "Enabled" : "Suspended" } }));
        if (request.blockPublicAccess !== undefined) await this.send.putPublicAccessBlock(new PutPublicAccessBlockCommand({ Bucket: request.bucketName, PublicAccessBlockConfiguration: { BlockPublicAcls: request.blockPublicAccess, IgnorePublicAcls: request.blockPublicAccess, BlockPublicPolicy: request.blockPublicAccess, RestrictPublicBuckets: request.blockPublicAccess } }));
        if (request.encryption) {
            if (request.encryption === "SSE-KMS" && (!request.kmsKeyArn || !request.kmsKeyArn.startsWith("arn:"))) throw new Error("SSE-KMS requires a customer-managed KMS key ARN.");
            await this.send.putEncryption(new PutBucketEncryptionCommand({ Bucket: request.bucketName, ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: request.encryption === "SSE-KMS" ? { SSEAlgorithm: "aws:kms", KMSMasterKeyID: request.kmsKeyArn } : { SSEAlgorithm: "AES256" }, BucketKeyEnabled: true }] } }));
        }
        if (request.enforceHttps !== undefined) {
            let existing: { Version?: string; Statement?: unknown[] } = {};
            try { const policy = await this.send.getPolicy(new GetBucketPolicyCommand({ Bucket: request.bucketName })); existing = policy.Policy ? JSON.parse(policy.Policy) as { Version?: string; Statement?: unknown[] } : {}; } catch (error) { if (!(error instanceof Error) || error.name !== "NoSuchBucketPolicy") throw error; }
            const statements = (existing.Statement ?? []).filter((statement) => !(statement && typeof statement === "object" && (statement as { Sid?: unknown }).Sid === "CloudCanvasDenyInsecureTransport"));
            if (request.enforceHttps) statements.push({ Sid: "CloudCanvasDenyInsecureTransport", Effect: "Deny", Principal: "*", Action: "s3:*", Resource: [`arn:aws:s3:::${request.bucketName}`, `arn:aws:s3:::${request.bucketName}/*`], Condition: { Bool: { "aws:SecureTransport": "false" } } });
            if (statements.length) await this.send.putPolicy(new PutBucketPolicyCommand({ Bucket: request.bucketName, Policy: JSON.stringify({ Version: existing.Version ?? "2012-10-17", Statement: statements }) }));
        }
        return { region: this.region, bucketName: request.bucketName, location: undefined };
    }

    async deleteBucket(bucketName: string): Promise<S3DeleteResult> {
        if (!bucketName) throw new Error("bucketName is required to delete an S3 bucket.");
        await this.send.delete(new DeleteBucketCommand({ Bucket: bucketName }));
        return { region: this.region, bucketName };
    }
}
