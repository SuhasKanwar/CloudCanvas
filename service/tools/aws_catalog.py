import json
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from langchain_core.tools import tool

from config import CLOUDCANVAS_SERVER_URL


_aws_request: ContextVar[tuple[str, str] | None] = ContextVar("aws_request", default=None)


@contextmanager
def aws_tool_context(connection_id: str | None, token: str | None) -> Iterator[None]:
    context_token = _aws_request.set((connection_id, token) if connection_id and token else None)
    try:
        yield
    finally:
        _aws_request.reset(context_token)


def _catalog() -> dict:
    context = _aws_request.get()
    if not context:
        raise RuntimeError("No AWS connection is available for this sketch.")
    connection_id, token = context
    request = Request(
        f"{CLOUDCANVAS_SERVER_URL.rstrip('/')}/api/aws/connections/{quote(connection_id, safe='')}/catalog",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"CloudCanvas AWS API returned HTTP {error.code}.") from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError("CloudCanvas AWS API is unavailable.") from error
    if not payload.get("success") or not isinstance(payload.get("data"), dict):
        raise RuntimeError("CloudCanvas AWS API returned an invalid catalog.")
    return payload["data"]


def _matches(item: object, query: str) -> bool:
    return not query or query.casefold() in json.dumps(item).casefold()


@tool
def get_aws_catalog(
    category: Literal["images", "instance_types", "networking", "ec2_dependencies"],
    query: str = "",
    os_family: Literal["amazon-linux", "windows", "any"] = "any",
    architecture: str = "",
) -> str:
    """Fetch live AWS choices for the sketch connection. Use images for AMIs/OS, instance_types for EC2 specs, networking for VPCs/subnets/security groups, or ec2_dependencies for key pairs/profiles/templates/instances. Optional query filters names and IDs."""
    try:
        catalog = _catalog()
        if category == "images":
            items = [
                item for item in catalog.get("images", [])
                if (os_family == "any" or item.get("category") == os_family)
                and (not architecture or item.get("architecture") == architecture)
                and _matches(item, query)
            ][:25]
            result: object = {"images": items, "warnings": catalog.get("warnings", [])}
        elif category == "instance_types":
            result = {"instanceTypes": [item for item in catalog.get("instanceTypes", []) if _matches(item, query)][:50]}
        elif category == "networking":
            result = {
                key: [item for item in catalog.get(key, []) if _matches(item, query)][:30]
                for key in ("vpcs", "subnets", "securityGroups")
            }
        else:
            result = {
                key: [item for item in catalog.get(key, []) if _matches(item, query)][:30]
                for key in ("keyPairs", "instanceProfiles", "launchTemplates", "instances")
            }
        return json.dumps(result)
    except RuntimeError as error:
        return json.dumps({"error": str(error)})

