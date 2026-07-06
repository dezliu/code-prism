"""Qdrant client helper tests."""

from unittest.mock import MagicMock

from infrastructure.clients.qdrant import ensure_collection


def test_ensure_collection_should_create_when_missing() -> None:
    client = MagicMock()
    client.get_collection.side_effect = Exception("not found")

    name = ensure_collection(client, collection_name="lingprism_v1_zhipu_1024", vector_size=1024)

    assert name == "lingprism_v1_zhipu_1024"
    client.create_collection.assert_called_once()
    params = client.create_collection.call_args.kwargs
    assert params["collection_name"] == "lingprism_v1_zhipu_1024"


def test_ensure_collection_should_skip_create_when_exists() -> None:
    client = MagicMock()
    client.get_collection.return_value = {"status": "green"}

    name = ensure_collection(client, collection_name="lingprism_v1_zhipu_1024", vector_size=1024)

    assert name == "lingprism_v1_zhipu_1024"
    client.create_collection.assert_not_called()
