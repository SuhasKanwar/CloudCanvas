import {
    CreateBucketCommand,
    DeleteBucketCommand,
    type BucketLocationConstraint,
    type CreateBucketCommandOutput,
    type DeleteBucketCommandOutput,
} from "@aws-sdk/client-s3";

export type S3BucketRequest = {
    bucketName: string;
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
        return { region: this.region, bucketName: request.bucketName, location: result.Location };
    }

    async deleteBucket(bucketName: string): Promise<S3DeleteResult> {
        if (!bucketName) throw new Error("bucketName is required to delete an S3 bucket.");
        await this.send.delete(new DeleteBucketCommand({ Bucket: bucketName }));
        return { region: this.region, bucketName };
    }
}
