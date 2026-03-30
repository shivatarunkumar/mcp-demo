"""Async HTTP client for Ollama /api/generate."""

import json
import logging
from typing import AsyncGenerator

import httpx

from app.config import settings

logger = logging.getLogger("llm-api")

_TIMEOUT = httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0)


def _base() -> str:
    return settings.ollama_base_url.rstrip("/")


async def generate(prompt: str, model: str) -> dict:
    """Non-streaming generate — returns the full Ollama response dict."""
    url = f"{_base()}/api/generate"
    payload = {"model": model, "prompt": prompt, "stream": False}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


async def stream_generate(prompt: str, model: str) -> AsyncGenerator[bytes, None]:
    """Streaming generate — yields NDJSON chunks as Ollama sends them."""
    url = f"{_base()}/api/generate"
    payload = {"model": model, "prompt": prompt, "stream": True}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        async with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line:
                    logger.debug("chunk: %s", line)
                    yield (line + "\n").encode()
