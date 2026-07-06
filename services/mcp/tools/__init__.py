"""MCP tool definitions."""

from tools.ask_question import ASK_QUESTION_TOOL, call_ask_question
from tools.echo import ECHO_TOOL, call_echo
from tools.get_architecture import GET_ARCHITECTURE_TOOL, call_get_architecture
from tools.search_code import SEARCH_CODE_TOOL, call_search_code
from tools.search_knowledge import SEARCH_KNOWLEDGE_TOOL, call_search_knowledge

REGISTERED_TOOLS = {
    "echo": {
        "definition": ECHO_TOOL,
        "handler": call_echo,
    },
    "search_code": {
        "definition": SEARCH_CODE_TOOL,
        "handler": call_search_code,
    },
    "search_knowledge": {
        "definition": SEARCH_KNOWLEDGE_TOOL,
        "handler": call_search_knowledge,
    },
    "get_architecture": {
        "definition": GET_ARCHITECTURE_TOOL,
        "handler": call_get_architecture,
    },
    "ask_question": {
        "definition": ASK_QUESTION_TOOL,
        "handler": call_ask_question,
    },
}
