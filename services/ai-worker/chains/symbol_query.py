"""Parse user queries into symbol lookup parameters."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from chains.rag_retrieval import extract_keywords

_QUALIFIED_HASH = re.compile(
    r"(?P<package>(?:[A-Za-z_][\w.]*\.)+[A-Za-z_]\w*)#(?P<method>[A-Za-z_]\w*)"
)
_CLASS_METHOD = re.compile(r"(?P<class>[A-Z][A-Za-z0-9_]*)\.(?P<method>[a-zA-Z_]\w*)")
_LOCATION_HINT = re.compile(
    r"(在哪|哪里|位置|哪一行|哪个文件|代码位置|定义在哪|实现在哪| locate | where is )",
    re.IGNORECASE,
)
_API_CALL_HINT = re.compile(
    r"(调用.*接口|使用.*API|什么.*方法|怎么.*调用|如何.*实现|调用的什么)",
    re.IGNORECASE,
)
_REPO_HINT = re.compile(
    r"(?:在|于)\s*([A-Za-z0-9_-]+(?:-service|-repo)?)\s*(?:仓库|服务|里|中|的)?",
)

# 常见项目/产品名，不应被当作代码符号
_PROJECT_NAMES = frozenset({
    "codeprism", "lingprism", "prism", "codegraph",
    "github", "gitlab", "bitbucket",
})


@dataclass
class ParsedSymbolQuery:
    raw_query: str
    semantic_query: str
    class_name: str | None = None
    method_name: str | None = None
    package_name: str | None = None
    repo_hint: str | None = None
    is_location_intent: bool = False
    topic_keywords: list[str] = field(default_factory=list)  # 中文主题词（如 "llm编排"）


def is_code_location_query(message: str) -> bool:
    text = message.strip()
    if not text:
        return False
    if _LOCATION_HINT.search(text):
        return True
    if _API_CALL_HINT.search(text):
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
    english = sorted(
        [k for k in keywords if re.match(r"^[A-Za-z]", k) and k.lower() not in _PROJECT_NAMES],
        key=len,
        reverse=True,
    )
    if english:
        if len(english) >= 2 and english[0][0].isupper() and english[1][0].islower():
            parsed.class_name = english[0]
            parsed.method_name = english[1]
        elif english[0][0].isupper():
            parsed.class_name = english[0]
        else:
            # 仅当英文标识符看起来像代码符号（驼峰/下划线/足够短）时才设为 method_name
            candidate = english[0]
            if _looks_like_code_symbol(candidate):
                parsed.method_name = candidate

    # 提取中文主题词组（如 "llm编排" → 保留完整语义）
    topic_keywords = _extract_topic_keywords(text)
    parsed.topic_keywords = topic_keywords

    # 构建更好的语义查询：英文标识符 + 中文主题词组合
    if topic_keywords and not parsed.class_name and not parsed.method_name:
        # 纯自然语言查询：保留完整的语义表达
        parsed.semantic_query = text
    elif topic_keywords:
        # 有符号名也有主题词，拼接增强语义
        symbol_part = parsed.class_name or parsed.method_name or ""
        parsed.semantic_query = f"{symbol_part} {' '.join(topic_keywords)}"

    return parsed


def _looks_like_code_symbol(name: str) -> bool:
    """判断一个英文标识符是否像代码符号（而非普通项目名/产品名）。"""
    if name.lower() in _PROJECT_NAMES:
        return False
    # 驼峰命名（如 searchCode, resolveSymbols）
    if re.search(r"[a-z][A-Z]", name):
        return True
    # 含下划线/短横线（如 llm_worker, code-search）
    if "_" in name or "-" in name:
        return True
    # 较短的标识符（<=12字符）且看起来像动词/名词
    if len(name) <= 12:
        return True
    return False


def _extract_topic_keywords(text: str) -> list[str]:
    """提取中文主题词及其中英文混合前缀（如 'llm编排'）。"""
    topics: list[str] = []
    # 匹配英文前缀+中文主题（如 llm编排, api接口）
    mixed = re.findall(r"([A-Za-z][A-Za-z0-9_-]*[\u4e00-\u9fa5]{2,})", text)
    for m in mixed:
        topics.append(m)
    # 匹配纯中文主题词（2-6字）
    chinese = re.findall(r"([\u4e00-\u9fa5]{2,6})", text)
    # 过滤疑问词/停用词/通用词
    stop = {
        "在哪", "哪里", "哪个", "什么", "怎么", "如何", "为什么",
        "是否", "可以", "能够", "有没有", "请问", "代码", "入口",
        "管理", "功能", "项目", "系统", "平台", "相关", "核心",
    }
    for c in chinese:
        if c not in stop and c not in topics:
            topics.append(c)
    return topics
