import unittest
from unittest.mock import patch

from agents.graph import agent_app
from config.models import AWS_ROUTER_MODEL, NVIDIA, ROUTER_MODEL
from models.nvidia import Nvidia
from schemas.agent import AwsService, BuildResponse
from utils.exception import CloudCanvasException


class AgentShapeTests(unittest.TestCase):
    def test_graph_and_router_schemas_are_wired(self):
        self.assertTrue({"router", "aws_router", "nvidia", "tools"}.issubset(agent_app.get_graph().nodes))
        self.assertEqual(
            {service.value for service in AwsService},
            {
                "EC2_INSTANCE",
                "ECR_REPOSITORY",
                "S3_BUCKET",
                "IAM_ROLE",
                "LAMBDA_FUNCTION",
                "DYNAMODB_TABLE",
                "SQS_QUEUE",
                "SNS_TOPIC",
            },
        )
        self.assertEqual(ROUTER_MODEL["RESPONSE_FORMAT"]["json_schema"]["name"], "RouteDecision")
        self.assertEqual(AWS_ROUTER_MODEL["RESPONSE_FORMAT"]["json_schema"]["name"], "BuildResponse")
        self.assertEqual(NVIDIA["MODEL_NAME"], "meta/llama-3.3-70b-instruct")

    def test_nvidia_client_requires_an_api_key(self):
        with patch("models.nvidia.NVIDIA_API_KEY", ""):
            with self.assertRaises(CloudCanvasException):
                Nvidia()

    def test_build_response_matches_server_node_shape(self):
        response = BuildResponse.model_validate({
            "type": "build",
            "message": "Create an S3 bucket.",
            "build": {
                "name": "assets",
                "nodes": [{
                    "type": AwsService.S3_BUCKET,
                    "id": "node-1",
                    "config": {"bucketName": "cloudcanvas-assets"},
                }],
                "edges": [],
            },
        })
        self.assertEqual(response.build.nodes[0].type, AwsService.S3_BUCKET)


if __name__ == "__main__":
    unittest.main()
