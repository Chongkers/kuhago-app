import pytest

from app import config


@pytest.fixture(autouse=True)
def no_background_prompts(monkeypatch):
    """The fake text encoders only read prompts like "axis:N", so the off-theme gate is off unless a test sets it."""
    monkeypatch.setattr(config, "BACKGROUND_PROMPTS", [])
