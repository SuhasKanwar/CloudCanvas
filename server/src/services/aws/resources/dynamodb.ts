import {
    CreateTableCommand,
    DeleteTableCommand,
    type AttributeDefinition,
    type BillingMode,
    type CreateTableCommandOutput,
    type DeleteTableCommandOutput,
    type KeySchemaElement,
} from "@aws-sdk/client-dynamodb";

export type DynamoDbTableRequest = {
    tableName: string;
    keySchema: KeySchemaElement[];
    attributeDefinitions: AttributeDefinition[];
    billingMode?: BillingMode;
    readCapacityUnits?: number;
    writeCapacityUnits?: number;
};

export type DynamoDbTableResult = {
    region: string;
    tableName: string;
    tableArn: string | undefined;
    tableStatus: string | undefined;
};

export type DynamoDbDeleteResult = {
    region: string;
    tableName: string;
};

export type DynamoDbCommandSender = {
    create: (command: CreateTableCommand) => Promise<CreateTableCommandOutput>;
    delete: (command: DeleteTableCommand) => Promise<DeleteTableCommandOutput>;
};

export class DynamoDbService {
    constructor(private readonly send: DynamoDbCommandSender, private readonly region: string) {}

    async createTable(request: DynamoDbTableRequest): Promise<DynamoDbTableResult> {
        if (!request.tableName || !request.keySchema.length || !request.attributeDefinitions.length) {
            throw new Error("tableName, keySchema, and attributeDefinitions are required to create a DynamoDB table.");
        }
        const billingMode = request.billingMode ?? "PAY_PER_REQUEST";
        const result = await this.send.create(new CreateTableCommand({
            TableName: request.tableName,
            KeySchema: request.keySchema,
            AttributeDefinitions: request.attributeDefinitions,
            BillingMode: billingMode,
            ...(billingMode === "PROVISIONED" && {
                ProvisionedThroughput: {
                    ReadCapacityUnits: request.readCapacityUnits ?? 5,
                    WriteCapacityUnits: request.writeCapacityUnits ?? 5,
                },
            }),
        }));
        return {
            region: this.region,
            tableName: result.TableDescription?.TableName ?? request.tableName,
            tableArn: result.TableDescription?.TableArn,
            tableStatus: result.TableDescription?.TableStatus,
        };
    }

    async deleteTable(tableName: string): Promise<DynamoDbDeleteResult> {
        if (!tableName) throw new Error("tableName is required to delete a DynamoDB table.");
        await this.send.delete(new DeleteTableCommand({ TableName: tableName }));
        return { region: this.region, tableName };
    }
}
