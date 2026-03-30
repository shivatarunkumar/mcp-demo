import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app import ollama_client
from app.config import settings
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger("llm-api")


@router.post("/completions")
async def chat_completions(request: ChatRequest):
    model = request.model or settings.default_model

    # ── Streaming ────────────────────────────────────────────────────────────
    if request.stream:
        logger.info("streaming request  model=%s", model)
        try:
            return StreamingResponse(
                ollama_client.stream_generate(request.prompt, model),
                media_type="application/x-ndjson",
                headers={
                    "X-Accel-Buffering": "no",   # disable nginx buffering
                    "Cache-Control": "no-cache",
                },
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Ollama error: {str(e)}")

    # ── Non-streaming ────────────────────────────────────────────────────────
    try:
        result = await ollama_client.generate(request.prompt, model)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {str(e)}")

    return ChatResponse(
        model=result.get("model", model),
        response=result.get("response", ""),
        done=result.get("done", True),
        prompt_eval_count=result.get("prompt_eval_count"),
        eval_count=result.get("eval_count"),
    )
