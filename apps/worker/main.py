"""
Python AI Worker — FastAPI application entry point.

Responsibilities:
- Expose /health endpoint for Azure Container Apps liveness probes
- Start the background Azure Storage Queue polling loop (Story 2.2)

Local dev:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Production (via docker-compose / Azure Container Apps):
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from config import settings
from worker import start_queue_polling

# ── Structured JSON logging (stdout → Azure Monitor ingestion) ──
logging.basicConfig(
    level=settings.log_level,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Application lifespan — startup and shutdown hooks."""
    logger.info("mint_personal worker starting", extra={"environment": settings.environment})
    # Start the queue polling loop as a background asyncio task.
    # The task runs indefinitely; cancellation on shutdown is handled by asyncio.
    polling_task = asyncio.create_task(start_queue_polling())
    yield
    polling_task.cancel()
    try:
        await polling_task
    except asyncio.CancelledError:
        pass
    logger.info("mint_personal worker shutting down")


app = FastAPI(
    title="mint_personal AI Worker",
    version="0.1.0",
    description="CSV parsing and AI categorization worker",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check() -> JSONResponse:
    """
    Liveness probe endpoint.
    Azure Container Apps checks this endpoint — must return HTTP 200.
    Response format matches web app: { "data": { "status": "ok" } }
    """
    return JSONResponse(content={"data": {"status": "ok"}}, status_code=200)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
