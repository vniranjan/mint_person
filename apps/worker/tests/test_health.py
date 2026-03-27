"""
Tests for the worker health endpoint and application startup.
Uses httpx.AsyncClient with ASGITransport (compatible with httpx >= 0.23).
"""
import pytest
import httpx

from main import app


@pytest.mark.asyncio
async def test_health_endpoint_returns_200():
    """AC1: Worker /health returns HTTP 200."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/health")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_endpoint_response_shape():
    """AC1: /health response matches { data: { status: 'ok' } } format."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/health")
    data = response.json()
    assert "data" in data
    assert data["data"]["status"] == "ok"


@pytest.mark.asyncio
async def test_health_endpoint_matches_web_app_format():
    """
    Both web and worker /health endpoints use same response format.
    Ensures Azure Container Apps liveness probes work consistently.
    """
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/health")
    body = response.json()
    assert body == {"data": {"status": "ok"}}
