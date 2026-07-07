"""Regex-based intent hints (fallback when LLM unavailable)."""

from __future__ import annotations

import re


def classify_intent(message: str) -> list[str]:
    intents: list[str] = []
    # 代码位置查询：明确询问位置
    if re.search(r"在哪|哪里|位置|哪一行|哪个文件|代码位置|定义在哪|实现在哪", message):
        intents.append("code_location")
    # 代码位置查询：询问调用关系/API使用
    elif re.search(r"调用.*接口|使用.*API|什么.*方法|怎么.*调用|如何.*实现", message):
        intents.append("code_location")
    
    if re.search(r"架构|依赖|调用链|模块|服务关系", message):
        intents.append("architecture")
    if re.search(r"函数|类|代码|接口|字段|表", message):
        intents.append("code")
    if re.search(r"文档|手册|ADR|培训", message):
        intents.append("doc")
    if re.search(r"负责人|谁负责|团队", message):
        intents.append("people")
    if not intents:
        intents.append("general")
    return intents
