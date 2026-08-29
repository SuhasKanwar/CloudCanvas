from langchain_core.tools import tool

from schemas.agent import AwsService


RESOURCE_GUIDANCE = {
    "EC2_INSTANCE": "Use a catalog AMI or launch template before deployment. Connect KEY_PAIR and SECURITY_GROUP nodes to supply keyName and securityGroupId.",
    "KEY_PAIR": "Use an existing catalog key pair, or provide public key material to import one.",
    "SECURITY_GROUP": "Use an existing catalog group or select a VPC before creating one.",
    "ECR_REPOSITORY": "Set a repositoryName, then optionally configure imageTagMutability and scanOnPush.",
    "S3_BUCKET": "Set a globally unique bucketName, then optionally configure versioning, public-access blocking, SSE-S3 or SSE-KMS encryption, and HTTPS enforcement.",
    "IAM_ROLE": "Set a trusted service or an explicit trust policy, then optional managed policy ARNs.",
    "LAMBDA_FUNCTION": "Requires a functionName, roleArn, handler, runtime, and base64 deployment package; memory, timeout, and description are optional.",
    "DYNAMODB_TABLE": "Requires a tableName, key schema, and matching attribute definitions. Billing defaults to on-demand; provision read and write capacity only for PROVISIONED mode.",
    "SQS_QUEUE": "Set a queueName, then optionally configure visibility timeout and message retention in seconds.",
    "SNS_TOPIC": "Set a topicName and enable fifoTopic when ordering and deduplication are required; FIFO names receive the .fifo suffix.",
}


@tool
def get_cloudcanvas_resource_support(resource: str = "") -> str:
    """Return CloudCanvas AWS node support and configuration guidance without accessing AWS credentials."""
    supported = ", ".join(service.value for service in AwsService)
    if resource:
        name = resource.strip().upper()
        guidance = RESOURCE_GUIDANCE.get(name)
        return f"{name}: {guidance}" if guidance else f"Unknown resource '{resource}'. Supported resources: {supported}"
    return f"Supported resources: {supported}. Use get_cloudcanvas_resource_support with a resource name for setup guidance."
