"""MCP tool definitions."""

from tools.echo import ECHO_TOOL, call_echo

REGISTERED_TOOLS = {
    "echo": {
        "definition": ECHO_TOOL,
        "handler": call_echo,
    },
}
