"""Parse user queries into symbol lookup parameters."""

from __future__ import annotations

import re
from dataclasses import dataclass

from chains.rag_retrieval import extract_keywords

_QUALIFIED_HASH = re.compile(
    r"(?P<package>(?:[A-Za-z_][\w.]*\.)+[A-Za-z_]\w*)#(?P<method>[A-Za-z_]\w*)"
)
_CLASS_METHOD = re.compile(r"(?P<class>[A-Z][A-Za-z0-9_]*)\.(?P<method>[a-zA-Z_]\w*)")
_LOCATION_HINT = re.compile(
    r"(在哪|哪里|位置|哪一行|哪个文件|代码位置|定义在哪|实现在哪| locate | where is )",
    re.IGNORECASE,
)
_REPO_HINT = re.compile(
    r"(?:在|于)\s*([A-Za-z0-9_-]+(?:-service|-repo)?)\s*(?:仓库|服务|里|中|的)?",
)


@dataclass
class ParsedSymbolQuery:
    raw_query: str
    semantic_query: str
    class_name: str | None = None
    method_name: str | None = None
    package_name: str | None = None
    repo_hint: str | None = None
    is_location_intent: bool = False


def is_code_location_query(message: str) -> bool:
    text = message.strip()
    if not text:
        return False
    if _LOCATION_HINT.search(text):
        return True
    if _CLASS_METHOD.search(text) or _QUALIFIED_HASH.search(text):
        return True
    keywords = extract_keywords(text)
    english = [k for k in keywords if re.match(r"^[A-Za-z]", k)]
    return bool(english) and bool(re.search(r"(代码|函数|方法|类|接口)", text))


def parse_symbol_query(message: str) -> ParsedSymbolQuery:
    text = message.strip()
    parsed = ParsedSymbolQuery(
        raw_query=text,
        semantic_query=text,
        is_location_intent=is_code_location_query(text),
    )

    repo_match = _REPO_HINT.search(text)
    if repo_match:
        parsed.repo_hint = repo_match.group(1)

    hash_match = _QUALIFIED_HASH.search(text)
    if hash_match:
        parsed.package_name = hash_match.group("package")
        parsed.method_name = hash_match.group("method")
        parts = parsed.package_name.rsplit(".", 1)
        if len(parts) == 2:
            parsed.package_name = parts[0]
            parsed.class_name = parts[1]
        return parsed

    cm_match = _CLASS_METHOD.search(text)
    if cm_match:
        parsed.class_name = cm_match.group("class")
        parsed.method_name = cm_match.group("method")
        return parsed

    keywords = extract_keywords(text)
    english = sorted([k for k in keywords if re.match(r"^[A-Za-z]", k)], key=len, reverse=True)
    if english:
        if len(english) >= 2 and english[0][0].isupper() and english[1][0].islower():
            parsed.class_name = english[0]
            parsed.method_name = english[1]
        elif english[0][0].isupper():
            parsed.class_name = english[0]
        else:
            parsed.method_name = english[0]

    return parsed
