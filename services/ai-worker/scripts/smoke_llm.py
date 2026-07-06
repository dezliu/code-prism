"""LLM smoke test — bootstraps ai-worker import path for ad-hoc runs."""

from __future__ import annotations

import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]


def _bootstrap_import_path() -> None:
    root = str(SERVICE_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


def main() -> int:
    _bootstrap_import_path()

    try:
        from infrastructure.config import load_env
        from infrastructure.llm.factory import create_chat_model
    except ModuleNotFoundError:
        print(
            "依赖未安装或解释器不正确。请先执行：\n"
            "  cd services/ai-worker\n"
            "  python3 -m venv .venv && source .venv/bin/activate\n"
            "  pip install -e '.[dev]'\n"
            "  python3 scripts/smoke_llm.py",
            file=sys.stderr,
        )
        return 1

    load_env()
    print(create_chat_model("qa").invoke("你好"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
