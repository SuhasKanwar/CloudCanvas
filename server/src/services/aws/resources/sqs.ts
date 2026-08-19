import {
    CreateQueueCommand,
    DeleteQueueCommand,
    type CreateQueueCommandOutput,
    type DeleteQueueCommandOutput,
} from "@aws-sdk/client-sqs";

export type SqsQueueRequest = {
    queueName: string;
    visibilityTimeoutSeconds?: number;
    messageRetentionPeriodSeconds?: number;
};

export type SqsQueueResult = {
    region: string;
    queueName: string;
    queueUrl: string;
};

export type SqsDeleteResult = {
    region: string;
    queueUrl: string;
};

export type SqsCommandSender = {
    create: (command: CreateQueueCommand) => Promise<CreateQueueCommandOutput>;
    delete: (command: DeleteQueueCommand) => Promise<DeleteQueueCommandOutput>;
};

export class SqsService {
    constructor(private readonly send: SqsCommandSender, private readonly region: string) {}

    async createQueue(request: SqsQueueRequest): Promise<SqsQueueResult> {
        if (!request.queueName) throw new Error("queueName is required to create an SQS queue.");
        const attributes: Record<string, string> = {};
        if (request.visibilityTimeoutSeconds !== undefined) attributes.VisibilityTimeout = String(request.visibilityTimeoutSeconds);
        if (request.messageRetentionPeriodSeconds !== undefined) attributes.MessageRetentionPeriod = String(request.messageRetentionPeriodSeconds);
        const result = await this.send.create(new CreateQueueCommand({
            QueueName: request.queueName,
            ...(Object.keys(attributes).length && { Attributes: attributes }),
        }));
        if (!result.QueueUrl) throw new Error("AWS did not return an SQS queue URL.");
        return { region: this.region, queueName: request.queueName, queueUrl: result.QueueUrl };
    }

    async deleteQueue(queueUrl: string): Promise<SqsDeleteResult> {
        if (!queueUrl) throw new Error("queueUrl is required to delete an SQS queue.");
        await this.send.delete(new DeleteQueueCommand({ QueueUrl: queueUrl }));
        return { region: this.region, queueUrl };
    }
}
