import { randomUUID } from "node:crypto";
import {
    CloudFrontClient, CreateDistributionCommand, CreateOriginAccessControlCommand,
    DeleteDistributionCommand, DeleteOriginAccessControlCommand, GetDistributionCommand,
    GetOriginAccessControlCommand, ListCachePoliciesCommand, ListResponseHeadersPoliciesCommand,
    UpdateDistributionCommand, type Distribution,
} from "@aws-sdk/client-cloudfront";
import { S3Client, GetBucketPolicyCommand, PutBucketPolicyCommand, DeleteBucketPolicyCommand, GetBucketEncryptionCommand, PutPublicAccessBlockCommand } from "@aws-sdk/client-s3";
import { AwsService, type AwsResourceDetails } from "../types.js";

export type CloudFrontRequest = {
    bucketName: string;
    originPath?: string;
    defaultRootObject?: string;
    comment?: string;
    enabled?: boolean;
    spaFallback?: boolean;
    priceClass?: "PriceClass_All" | "PriceClass_200" | "PriceClass_100";
    cacheMode?: "disabled" | "optimized";
};

export function cloudFrontDetails(distribution: Distribution, region: string): AwsResourceDetails {
    return { service: AwsService.CLOUDFRONT_DISTRIBUTION, region, externalId: distribution.Id!,
        state: distribution.Status ?? "InProgress", status: distribution.Status === "Deployed" ? "RUNNING" : "PROVISIONING",
        data: { distributionId: distribution.Id, distributionArn: distribution.ARN, domainName: distribution.DomainName,
            url: distribution.DomainName ? `https://${distribution.DomainName}` : undefined,
            enabled: distribution.DistributionConfig?.Enabled, status: distribution.Status,
            lastModified: distribution.LastModifiedTime?.toISOString(), origins: distribution.DistributionConfig?.Origins?.Items,
            defaultRootObject: distribution.DistributionConfig?.DefaultRootObject, priceClass: distribution.DistributionConfig?.PriceClass,
            consoleUrl: `https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions/${distribution.Id}`,
        } };
}

export class CloudFrontService {
    constructor(private readonly client: CloudFrontClient, private readonly s3: S3Client, private readonly region: string) {}

    private async policy(bucketName: string, id: string, arn?: string) {
        let policy: { Version?: string; Statement?: Record<string, unknown> | Record<string, unknown>[] } = {};
        try {
            const result = await this.s3.send(new GetBucketPolicyCommand({ Bucket: bucketName }));
            if (result.Policy) policy = JSON.parse(result.Policy);
        } catch (error) {
            if (!(error instanceof Error) || error.name !== "NoSuchBucketPolicy") throw error;
        }
        const sid = `CloudCanvasCloudFront${id}`;
        const statements = (Array.isArray(policy.Statement) ? policy.Statement : policy.Statement ? [policy.Statement] : []).filter((item) => item.Sid !== sid);
        if (arn) statements.push({ Sid: sid, Effect: "Allow", Principal: { Service: "cloudfront.amazonaws.com" }, Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${bucketName}/*`, Condition: { StringEquals: { "AWS:SourceArn": arn, "AWS:SourceAccount": arn.split(":")[4] } } });
        if (statements.length) await this.s3.send(new PutBucketPolicyCommand({ Bucket: bucketName, Policy: JSON.stringify({ ...policy, Version: policy.Version ?? "2012-10-17", Statement: statements }) }));
        else if (policy.Statement) await this.s3.send(new DeleteBucketPolicyCommand({ Bucket: bucketName }));
    }

    private async cachePolicy(mode: CloudFrontRequest["cacheMode"]) {
        const name = mode === "optimized" ? "Managed-CachingOptimized" : "Managed-CachingDisabled";
        let Marker: string | undefined;
        do {
            const result = await this.client.send(new ListCachePoliciesCommand({ Type: "managed", ...(Marker && { Marker }) }));
            const policy = result.CachePolicyList?.Items?.find((item) => item.CachePolicy?.CachePolicyConfig?.Name === name)?.CachePolicy;
            if (policy?.Id) return policy.Id;
            Marker = result.CachePolicyList?.NextMarker;
        } while (Marker);
        throw new Error(`CloudFront cache policy ${name} is unavailable.`);
    }

    private async settings(request: CloudFrontRequest) {
        return { Comment: request.comment ?? "Managed by CloudCanvas", Enabled: request.enabled ?? true,
            DefaultRootObject: request.defaultRootObject ?? "index.html", PriceClass: request.priceClass ?? "PriceClass_All",
            CustomErrorResponses: request.spaFallback ? { Quantity: 2, Items: [403, 404].map((ErrorCode) => ({ ErrorCode, ResponseCode: "200", ResponsePagePath: `/${request.defaultRootObject ?? "index.html"}`, ErrorCachingMinTTL: 0 })) } : { Quantity: 0 },
        };
    }

    async create(request: CloudFrontRequest, onCreated: (details: AwsResourceDetails) => Promise<void>, callerReference: string = randomUUID()) {
        const encryption = await this.s3.send(new GetBucketEncryptionCommand({ Bucket: request.bucketName }));
        if (encryption.ServerSideEncryptionConfiguration?.Rules?.some((rule) => rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm !== "AES256")) {
            throw new Error("This CloudFront frontend integration requires an SSE-S3 origin. KMS origins need a separate key policy.");
        }
        const cachePolicyId = await this.cachePolicy(request.cacheMode);
        const headers = await this.client.send(new ListResponseHeadersPoliciesCommand({ Type: "managed" }));
        const headersId = headers.ResponseHeadersPolicyList?.Items?.find((item) => item.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name === "Managed-SecurityHeadersPolicy")?.ResponseHeadersPolicy?.Id;
        if (!headersId) throw new Error("CloudFront managed security headers policy is unavailable.");
        await this.s3.send(new PutPublicAccessBlockCommand({ Bucket: request.bucketName, PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } }));
        const oac = await this.client.send(new CreateOriginAccessControlCommand({ OriginAccessControlConfig: {
            Name: `cloudcanvas-${callerReference}`, OriginAccessControlOriginType: "s3", SigningBehavior: "always", SigningProtocol: "sigv4",
        } }));
        const oacId = oac.OriginAccessControl?.Id;
        if (!oacId) throw new Error("CloudFront did not return an origin access control ID.");
        let distribution: Distribution | undefined;
        try {
            const result = await this.client.send(new CreateDistributionCommand({ DistributionConfig: {
                CallerReference: callerReference, ...await this.settings(request),
                Origins: { Quantity: 1, Items: [{ Id: "frontend", DomainName: `${request.bucketName}.s3.${this.region}.amazonaws.com`, OriginPath: request.originPath ?? "", OriginAccessControlId: oacId, S3OriginConfig: { OriginAccessIdentity: "" } }] },
                DefaultCacheBehavior: { TargetOriginId: "frontend", ViewerProtocolPolicy: "redirect-to-https", CachePolicyId: cachePolicyId, ResponseHeadersPolicyId: headersId, Compress: true, AllowedMethods: { Quantity: 2, Items: ["GET", "HEAD"], CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] } } },
                ViewerCertificate: { CloudFrontDefaultCertificate: true }, IsIPV6Enabled: true, HttpVersion: "http2and3",
            } }));
            distribution = result.Distribution;
            if (!distribution?.Id || !distribution.ARN) throw new Error("CloudFront did not return a distribution ID and ARN.");
            // Persist the ID before bucket-policy setup so a partial failure remains recoverable.
            await onCreated(cloudFrontDetails(distribution, this.region));
            await this.policy(request.bucketName, distribution.Id, distribution.ARN);
            return cloudFrontDetails(distribution, this.region);
        } catch (error) {
            if (!distribution) await this.deleteOac(oacId);
            throw error;
        }
    }

    async update(id: string, request: CloudFrontRequest) {
        const current = await this.client.send(new GetDistributionCommand({ Id: id }));
        const config = current.Distribution?.DistributionConfig;
        if (!config?.Origins?.Items || !config.DefaultCacheBehavior || !current.ETag) throw new Error("CloudFront configuration is unavailable.");
        const domain = `${request.bucketName}.s3.${this.region}.amazonaws.com`;
        if (config.Origins.Items?.[0]?.DomainName !== domain) throw new Error("Changing the CloudFront origin bucket requires a replacement distribution.");
        const origins = config.Origins.Items.map((origin) => ({ ...origin, OriginPath: request.originPath ?? "" }));
        const result = await this.client.send(new UpdateDistributionCommand({ Id: id, IfMatch: current.ETag, DistributionConfig: {
            ...config, ...await this.settings(request), Origins: { Quantity: origins.length, Items: origins },
            DefaultCacheBehavior: { ...config.DefaultCacheBehavior, CachePolicyId: await this.cachePolicy(request.cacheMode) },
        } }));
        if (!result.Distribution) throw new Error("CloudFront did not return the updated distribution.");
        return cloudFrontDetails(result.Distribution, this.region);
    }

    private async deleteOac(id: string) {
        try {
            const current = await this.client.send(new GetOriginAccessControlCommand({ Id: id }));
            await this.client.send(new DeleteOriginAccessControlCommand({ Id: id, IfMatch: current.ETag }));
        } catch (error) {
            if (!(error instanceof Error) || error.name !== "NoSuchOriginAccessControl") throw error;
        }
    }

    async delete(id: string, previousState?: unknown) {
        let current;
        try {
            current = await this.client.send(new GetDistributionCommand({ Id: id }));
        } catch (error) {
            if (!(error instanceof Error) || error.name !== "NoSuchDistribution") throw error;
            // The distribution may be gone while its OAC cleanup still needs retrying.
            if (previousState && typeof previousState === "object" && "origins" in previousState && Array.isArray(previousState.origins)) {
                for (const origin of previousState.origins) {
                    if (origin && typeof origin.OriginAccessControlId === "string") await this.deleteOac(origin.OriginAccessControlId);
                }
            }
            return { distributionId: id, pending: false };
        }
        const config = current.Distribution?.DistributionConfig;
        if (!config || !current.ETag) throw new Error("CloudFront configuration is unavailable.");
        if (config.Enabled) {
            await this.client.send(new UpdateDistributionCommand({ Id: id, IfMatch: current.ETag, DistributionConfig: { ...config, Enabled: false } }));
            return { distributionId: id, pending: true };
        }
        if (current.Distribution?.Status !== "Deployed") return { distributionId: id, pending: true };
        // Remove only our bucket grant, preserving all unrelated policy statements.
        const origin = config.Origins?.Items?.[0];
        const bucket = origin?.DomainName?.split(".s3.")[0];
        if (bucket) {
            try { await this.policy(bucket, id); } catch (error) {
                if (!(error instanceof Error) || error.name !== "NoSuchBucket") throw error;
            }
        }
        await this.client.send(new DeleteDistributionCommand({ Id: id, IfMatch: current.ETag }));
        if (origin?.OriginAccessControlId) await this.deleteOac(origin.OriginAccessControlId);
        return { distributionId: id, pending: false };
    }
}
