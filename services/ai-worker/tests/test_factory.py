"""LLM factory tests."""

import os
from unittest.mock import MagicMock, patch

from infrastructure.llm.factory import (
    PlaceholderChatModel,
    PlaceholderEmbeddings,
    create_chat_model,
    create_embedding_model,
)


def test_create_chat_model_should_return_placeholder_without_api_key() -> None:
    os.environ.pop("ZHIPU_API_KEY", None)
    os.environ.pop("LLM_PROVIDER", None)
    model = create_chat_model("qa")
    assert isinstance(model, PlaceholderChatModel)
    response = model.invoke("hello")
    assert "placeholder" in response
    assert "zhipu" in response


@patch("langchain_openai.ChatOpenAI")
def test_create_chat_model_should_use_langchain_when_api_key_present(
    mock_chat_openai: MagicMock,
) -> None:
    os.environ["LLM_PROVIDER"] = "zhipu"
    os.environ["ZHIPU_API_KEY"] = "secret"
    try:
        mock_instance = MagicMock()
        mock_chat_openai.return_value = mock_instance

        model = create_chat_model("qa")

        assert model is mock_instance
        mock_chat_openai.assert_called_once()
        kwargs = mock_chat_openai.call_args.kwargs
        assert kwargs["model"] == "glm-4-plus"
        assert kwargs["api_key"] == "secret"
        assert kwargs["streaming"] is True
    finally:
        os.environ.pop("LLM_PROVIDER", None)
        os.environ.pop("ZHIPU_API_KEY", None)


def test_create_embedding_model_should_return_placeholder_without_api_key() -> None:
    os.environ.pop("ZHIPU_API_KEY", None)
    os.environ["ZHIPU_EMBEDDING_DIM"] = "1024"
    try:
        embedder = create_embedding_model()
        assert isinstance(embedder, PlaceholderEmbeddings)
        vector = embedder.embed_query("test")
        assert len(vector) == 1024
        assert vector[0] == 4.0
    finally:
        os.environ.pop("ZHIPU_EMBEDDING_DIM", None)


@patch("langchain_openai.OpenAIEmbeddings")
def test_create_embedding_model_should_use_langchain_when_api_key_present(
    mock_openai_embeddings: MagicMock,
) -> None:
    os.environ["EMBEDDING_PROVIDER"] = "zhipu"
    os.environ["ZHIPU_API_KEY"] = "secret"
    try:
        mock_instance = MagicMock()
        mock_openai_embeddings.return_value = mock_instance

        model = create_embedding_model()

        assert model is mock_instance
        mock_openai_embeddings.assert_called_once()
        kwargs = mock_openai_embeddings.call_args.kwargs
        assert kwargs["model"] == "embedding-3"
        assert kwargs["api_key"] == "secret"
    finally:
        os.environ.pop("EMBEDDING_PROVIDER", None)
        os.environ.pop("ZHIPU_API_KEY", None)
