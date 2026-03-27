"""
Tests for pydantic-settings configuration.
"""
import pytest

from config import Settings


def test_settings_load_defaults():
    """Settings loads with default values when no env file present."""
    settings = Settings()
    assert settings.azure_queue_name == "statement-processing"
    assert settings.azure_blob_container_name == "statements"
    assert settings.confidence_threshold == 0.7
    assert settings.llm_batch_size == 50
    assert settings.llm_temperature == 0.1


def test_settings_llm_model_default():
    """Default LLM model is Claude Haiku (per architecture spec)."""
    settings = Settings()
    assert "claude-haiku" in settings.llm_model


def test_settings_confidence_threshold_range():
    """Confidence threshold must be between 0 and 1."""
    settings = Settings()
    assert 0.0 <= settings.confidence_threshold <= 1.0


def test_settings_environment_default():
    """Default environment is development."""
    settings = Settings()
    assert settings.environment == "development"
