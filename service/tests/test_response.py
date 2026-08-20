import json
import unittest

from models.llama import Llama
from schemas.response import BuildResponse, ResponseType, TextResponse


class ResponseTests(unittest.TestCase):
    def test_text_json_is_typed(self) -> None:
        response = Llama.parse_response('{"type":"text","message":"done"}')
        self.assertIsInstance(response, TextResponse)
        self.assertEqual(response.type, ResponseType.TEXT)

    def test_build_json_keeps_machine_data(self) -> None:
        response = Llama.parse_response(
            json.dumps(
                {
                    "type": "build",
                    "message": "Create an S3 bucket",
                    "build": {"service": "s3", "name": "assets"},
                }
            )
        )
        self.assertIsInstance(response, BuildResponse)
        self.assertEqual(response.type, ResponseType.BUILD)
        self.assertEqual(response.build["service"], "s3")


if __name__ == "__main__":
    unittest.main()
