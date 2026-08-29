from enum import Enum
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field


class CloudCanvasModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Route(str, Enum):
    AWS = "aws"
    GENERAL = "general"


class RouteDecision(CloudCanvasModel):
    route: Route
    reasoning: str = Field(description="Brief reason for the route.")


class AwsService(str, Enum):
    EC2_INSTANCE = "EC2_INSTANCE"
    KEY_PAIR = "KEY_PAIR"
    SECURITY_GROUP = "SECURITY_GROUP"
    ECR_REPOSITORY = "ECR_REPOSITORY"
    S3_BUCKET = "S3_BUCKET"
    IAM_ROLE = "IAM_ROLE"
    LAMBDA_FUNCTION = "LAMBDA_FUNCTION"
    DYNAMODB_TABLE = "DYNAMODB_TABLE"
    SQS_QUEUE = "SQS_QUEUE"
    SNS_TOPIC = "SNS_TOPIC"


class KeyType(str, Enum):
    HASH = "HASH"
    RANGE = "RANGE"


class ScalarAttributeType(str, Enum):
    STRING = "S"
    NUMBER = "N"
    BINARY = "B"


class BillingMode(str, Enum):
    PAY_PER_REQUEST = "PAY_PER_REQUEST"
    PROVISIONED = "PROVISIONED"


class Ec2Config(CloudCanvasModel):
    mode: Literal["create", "existing"] | None = None
    imageId: str | None = None
    imageFamily: Literal["amazon-linux", "windows"] | None = None
    launchTemplateId: str | None = None
    instanceId: str | None = None
    instanceType: str | None = None
    instanceCount: int | None = None
    keyName: str | None = None
    securityGroupIds: list[str] | None = None
    subnetId: str | None = None
    rootDeviceName: str | None = None
    rootVolumeSizeGiB: int | None = None
    rootVolumeType: Literal["gp3", "gp2"] | None = None
    deleteRootVolumeOnTermination: bool | None = None
    iamInstanceProfile: str | None = None
    name: str | None = None
    userData: str | None = None
    monitoring: bool | None = None
    ebsOptimized: bool | None = None
    disableApiTermination: bool | None = None
    shutdownBehavior: Literal["stop", "terminate"] | None = None
    metadataHttpTokens: Literal["optional", "required"] | None = None
    dryRun: bool | None = None


class KeyPairConfig(CloudCanvasModel):
    mode: Literal["existing", "import"] | None = None
    keyName: str | None = None
    publicKeyMaterial: str | None = None


class SecurityGroupIngressRule(CloudCanvasModel):
    protocol: Literal["tcp", "udp", "icmp", "-1"]
    fromPort: int | None = None
    toPort: int | None = None
    cidrIpv4: str
    description: str | None = None


class SecurityGroupConfig(CloudCanvasModel):
    mode: Literal["create", "existing"] | None = None
    groupId: str | None = None
    groupName: str | None = None
    description: str | None = None
    vpcId: str | None = None
    ingressRules: list[SecurityGroupIngressRule] | None = None


class EcrConfig(CloudCanvasModel):
    repositoryName: str
    imageTagMutability: Literal["MUTABLE", "IMMUTABLE"] | None = None
    scanOnPush: bool | None = None


class S3Config(CloudCanvasModel):
    bucketName: str
    versioning: bool | None = None
    blockPublicAccess: bool | None = None
    encryption: Literal["SSE-S3", "SSE-KMS"] | None = None
    kmsKeyArn: str | None = None
    enforceHttps: bool | None = None


class IamConfig(CloudCanvasModel):
    roleName: str
    trustedService: Literal["ec2.amazonaws.com", "lambda.amazonaws.com", "ecs-tasks.amazonaws.com"] | None = None
    assumeRolePolicyDocument: str | None = None
    managedPolicyArns: list[str] | None = None
    description: str | None = None
    path: str | None = None
    maxSessionDuration: int | None = None
    permissionsBoundaryArn: str | None = None


class LambdaConfig(CloudCanvasModel):
    functionName: str
    roleArn: str
    handler: str
    runtime: str
    codeZipBase64: str
    description: str | None = None
    memorySize: int | None = None
    timeout: int | None = None


class KeySchemaElement(CloudCanvasModel):
    attributeName: str = Field(alias="AttributeName")
    keyType: KeyType = Field(alias="KeyType")


class AttributeDefinition(CloudCanvasModel):
    attributeName: str = Field(alias="AttributeName")
    attributeType: ScalarAttributeType = Field(alias="AttributeType")


class DynamoDbConfig(CloudCanvasModel):
    tableName: str
    keySchema: list[KeySchemaElement]
    attributeDefinitions: list[AttributeDefinition]
    billingMode: BillingMode | None = None
    readCapacityUnits: int | None = None
    writeCapacityUnits: int | None = None


class SqsConfig(CloudCanvasModel):
    queueName: str
    visibilityTimeoutSeconds: int | None = None
    messageRetentionPeriodSeconds: int | None = None


class SnsConfig(CloudCanvasModel):
    topicName: str
    fifoTopic: bool | None = None


class Ec2Node(CloudCanvasModel):
    type: Literal[AwsService.EC2_INSTANCE] = AwsService.EC2_INSTANCE
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: Ec2Config


class KeyPairNode(CloudCanvasModel):
    type: Literal[AwsService.KEY_PAIR] = AwsService.KEY_PAIR
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: KeyPairConfig


class SecurityGroupNode(CloudCanvasModel):
    type: Literal[AwsService.SECURITY_GROUP] = AwsService.SECURITY_GROUP
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: SecurityGroupConfig


class EcrNode(CloudCanvasModel):
    type: Literal[AwsService.ECR_REPOSITORY] = AwsService.ECR_REPOSITORY
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: EcrConfig


class S3Node(CloudCanvasModel):
    type: Literal[AwsService.S3_BUCKET] = AwsService.S3_BUCKET
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: S3Config


class IamNode(CloudCanvasModel):
    type: Literal[AwsService.IAM_ROLE] = AwsService.IAM_ROLE
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: IamConfig


class LambdaNode(CloudCanvasModel):
    type: Literal[AwsService.LAMBDA_FUNCTION] = AwsService.LAMBDA_FUNCTION
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: LambdaConfig


class DynamoDbNode(CloudCanvasModel):
    type: Literal[AwsService.DYNAMODB_TABLE] = AwsService.DYNAMODB_TABLE
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: DynamoDbConfig


class SqsNode(CloudCanvasModel):
    type: Literal[AwsService.SQS_QUEUE] = AwsService.SQS_QUEUE
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: SqsConfig


class SnsNode(CloudCanvasModel):
    type: Literal[AwsService.SNS_TOPIC] = AwsService.SNS_TOPIC
    id: str
    label: str | None = None
    positionX: float = 0
    positionY: float = 0
    config: SnsConfig


AwsNode: TypeAlias = Annotated[
    Ec2Node | KeyPairNode | SecurityGroupNode | EcrNode | S3Node | IamNode | LambdaNode | DynamoDbNode | SqsNode | SnsNode,
    Field(discriminator="type"),
]


class SketchEdge(CloudCanvasModel):
    sourceNodeId: str
    targetNodeId: str
    sourceHandle: str | None = None
    targetHandle: str | None = None


class SketchSpec(CloudCanvasModel):
    name: str
    description: str | None = None
    nodes: list[AwsNode] = Field(min_length=1)
    edges: list[SketchEdge] = Field(default_factory=list)


class TextResponse(CloudCanvasModel):
    type: Literal["text"] = "text"
    message: str


class BuildResponse(CloudCanvasModel):
    type: Literal["build"] = "build"
    message: str
    build: SketchSpec


AgentResponse: TypeAlias = Annotated[TextResponse | BuildResponse, Field(discriminator="type")]


class ChatMessage(CloudCanvasModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class QueryRequest(CloudCanvasModel):
    query: str = Field(min_length=1)
    session_history: list[ChatMessage] = Field(default_factory=list)
    context: str = ""


class QueryResponse(CloudCanvasModel):
    success: bool
    data: AgentResponse
    message: str
