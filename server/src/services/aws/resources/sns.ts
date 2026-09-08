import {
    CreateTopicCommand,
    DeleteTopicCommand,
    type CreateTopicCommandOutput,
    type DeleteTopicCommandOutput,
} from "@aws-sdk/client-sns";

export type SnsTopicRequest = {
    topicName: string;
    fifoTopic?: boolean;
    displayName?: string;
    contentBasedDeduplication?: boolean;
};

export type SnsTopicResult = {
    region: string;
    topicName: string;
    topicArn: string;
};

export type SnsDeleteResult = {
    region: string;
    topicArn: string;
};

export type SnsCommandSender = {
    create: (command: CreateTopicCommand) => Promise<CreateTopicCommandOutput>;
    delete: (command: DeleteTopicCommand) => Promise<DeleteTopicCommandOutput>;
};

export class SnsService {
    constructor(private readonly send: SnsCommandSender, private readonly region: string) {}

    async createTopic(request: SnsTopicRequest): Promise<SnsTopicResult> {
        if (!request.topicName) throw new Error("topicName is required to create an SNS topic.");
        const topicName = request.fifoTopic && !request.topicName.endsWith(".fifo") ? `${request.topicName}.fifo` : request.topicName;
        const result = await this.send.create(new CreateTopicCommand({
            Name: topicName,
            Attributes: {
                ...(request.fifoTopic && { FifoTopic: "true", ContentBasedDeduplication: String(request.contentBasedDeduplication ?? false) }),
                ...(request.displayName !== undefined && { DisplayName: request.displayName }),
            },
        }));
        if (!result.TopicArn) throw new Error("AWS did not return an SNS topic ARN.");
        return { region: this.region, topicName, topicArn: result.TopicArn };
    }

    async deleteTopic(topicArn: string): Promise<SnsDeleteResult> {
        if (!topicArn) throw new Error("topicArn is required to delete an SNS topic.");
        await this.send.delete(new DeleteTopicCommand({ TopicArn: topicArn }));
        return { region: this.region, topicArn };
    }
}
