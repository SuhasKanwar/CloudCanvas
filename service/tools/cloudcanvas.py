from langchain_core.tools import tool

from schemas.agent import AwsService


@tool
def get_cloudcanvas_resource_support(resource: str = "") -> str:
    """Return CloudCanvas AWS node support and configuration guidance without accessing AWS credentials."""
    supported = ", ".join(service.value for service in AwsService)
    guidance = {
        "EC2_INSTANCE": "Use a catalog AMI or launch template before deployment. Connect KEY_PAIR and SECURITY_GROUP nodes to supply keyName and securityGroupId.",
        "KEY_PAIR": "Use an existing catalog key pair, or provide public key material to import one.",
        "SECURITY_GROUP": "Use an existing catalog group or select a VPC before creating one.",
        "IAM_ROLE": "Set a trusted service or an explicit trust policy, then optional managed policy ARNs.",
        "LAMBDA_FUNCTION": "Requires a role ARN, handler, runtime, and deployment package.",
    }
    if resource:
        return guidance.get(resource.upper(), f"Supported resources: {supported}")
    return f"Supported resources: {supported}. Use get_cloudcanvas_resource_support with a resource name for setup guidance."
