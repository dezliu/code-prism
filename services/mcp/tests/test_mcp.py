"""MCP service tests."""

import os

import pytest
from fastapi.testclient import TestClient

from server.app import app


@pytest.fixture
def client() -> TestClient:
    os.environ["MCP_API_KEYS"] = "test-key"
    return TestClient(app)


def test_health_should_return_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_mcp_should_reject_request_without_api_key(client: TestClient) -> None:
    response = client.post(
        "/mcp",
        headers={"MCP-Protocol-Version": "2025-03-26"},
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
    )
    assert response.status_code == 401


def test_tools_list_should_return_echo_tool(client: TestClient) -> None:
    response = client.post(
        "/mcp",
        headers={
            "MCP-Protocol-Version": "2025-03-26",
            "X-API-Key": "test-key",
        },
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["result"]["tools"][0]["name"] == "echo"


def test_tools_call_echo_should_return_message(client: TestClient) -> None:
    response = client.post(
        "/mcp",
        headers={
            "MCP-Protocol-Version": "2025-03-26",
            "X-API-Key": "test-key",
        },
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "echo", "arguments": {"message": "hello"}},
        },
    )

    assert response.status_code == 200
    content = response.json()["result"]["content"]
    assert content[0]["text"] == "hello"


def test_initialize_should_declare_tools_capability(client: TestClient) -> None:
    response = client.post(
        "/mcp",
        headers={
            "MCP-Protocol-Version": "2025-03-26",
            "X-API-Key": "test-key",
        },
        json={"jsonrpc": "2.0", "id": 3, "method": "initialize", "params": {}},
    )

    assert response.status_code == 200
    result = response.json()["result"]
    assert result["capabilities"]["tools"]["listChanged"] is True
