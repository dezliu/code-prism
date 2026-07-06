"""Echo tool — Batch 1 scaffold example."""

from typing import Any


ECHO_TOOL = {
    "name": "echo",
    "description": "Echo back the input message (scaffold tool for Batch 1 verification)",
    "inputSchema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "Message to echo back",
            }
        },
        "required": ["message"],
    },
}


def call_echo(arguments: dict[str, Any]) -> dict[str, Any]:
    message = arguments.get("message", "")
    return {
        "content": [
            {
                "type": "text",
                "text": message,
            }
        ]
    }
