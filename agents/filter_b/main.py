import os
import time
import json
import hashlib

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ArcReflex Filter Agent B", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

AGENT_ID = "filter_b"


@app.get("/")
def root(): return {"status": "ok", "agent": AGENT_ID}


AGENT_WALLET = os.getenv("FILTER_B_WALLET", "0xFILTER_B")
PRICE_PER_ITEM = 0.00012
REPUTATION = 58
MODEL_API_URL = os.getenv("ARCREFLEX_MODEL_API_URL", "").strip()
MODEL_API_KEY = os.getenv("ARCREFLEX_MODEL_API_KEY", "").strip()
MODEL_NAME = os.getenv("ARCREFLEX_MODEL", "gpt-4o-mini").strip()
LIVE_INFERENCE = os.getenv("ARCREFLEX_LIVE_INFERENCE",
                           "false").lower() == "true"
MODEL_TIMEOUT_SECONDS = float(
    os.getenv("ARCREFLEX_MODEL_TIMEOUT_SECONDS", "12"))
FILTER_MODEL_SAMPLE_EVERY = max(
    1,
    int(os.getenv("ARCREFLEX_FILTER_MODEL_SAMPLE_EVERY", "4")),
)
FILTER_MODEL_MAX_ITEMS = max(
    1,
    int(os.getenv("ARCREFLEX_FILTER_MODEL_MAX_ITEMS", "80")),
)


def _extract_json_obj(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}
    try:
        value = json.loads(text[start:end + 1])
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def _heuristic_score(global_index: int, item: dict) -> tuple[float, float, bool, str]:
    title = str(item.get("title", ""))
    snippet = str(item.get("snippet", ""))
    richness = min(200, len(title) + len(snippet))
    relevance = min(0.92, 0.60 + richness / 700)
    quality = max(0.58, 0.84 - (global_index / 1500.0) +
                  (0.01 if richness > 90 else -0.01))
    keep = relevance >= 0.65 and quality >= 0.60
    reason = "heuristic: semantic richness and index decay"
    return round(relevance, 3), round(quality, 3), keep, reason


async def _model_score(item: dict, global_index: int) -> tuple[dict, dict]:
    if not (LIVE_INFERENCE and MODEL_API_URL and MODEL_API_KEY):
        return {}, {"live_inference": False, "reason": "disabled_or_unconfigured"}

    if global_index >= FILTER_MODEL_MAX_ITEMS:
        return {}, {"live_inference": False, "reason": "sample_cap_reached"}

    if (global_index % FILTER_MODEL_SAMPLE_EVERY) != 0:
        return {}, {"live_inference": False, "reason": "sampling_skip"}

    title = str(item.get("title", ""))
    snippet = str(item.get("snippet", ""))
    prompt = (
        "You are a quality evaluator for search results. "
        "Return ONLY JSON object with keys: relevance_score, quality_score, keep, reason. "
        "Scores are floats between 0 and 1.\n"
        f"item_index: {global_index}\n"
        f"title: {title}\n"
        f"snippet: {snippet}"
    )
    payload = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
    }

    started = time.time()
    async with httpx.AsyncClient(timeout=MODEL_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            MODEL_API_URL,
            headers={
                "Authorization": f"Bearer {MODEL_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    parsed = _extract_json_obj(content)
    meta = {
        "live_inference": True,
        "model": MODEL_NAME,
        "latency_ms": int((time.time() - started) * 1000),
        "prompt_hash": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "response_hash": hashlib.sha256(content.encode("utf-8")).hexdigest(),
    }
    return parsed, meta


@app.post("/filter")
async def filter_results(body: dict):
    items = body.get("items", [])
    start_index = body.get("start_index", 0)

    filtered = []
    for i, item in enumerate(items):
        global_index = start_index + i
        relevance_score, quality_score, keep, reason = _heuristic_score(
            global_index, item)
        provenance = {"live_inference": False, "reason": "heuristic_fallback"}
        try:
            model_values, meta = await _model_score(item, global_index)
            if model_values:
                relevance_score = round(
                    float(model_values.get("relevance_score", relevance_score)), 3)
                quality_score = round(
                    float(model_values.get("quality_score", quality_score)), 3)
                raw_keep = model_values.get("keep", keep)
                if isinstance(raw_keep, str):
                    raw_keep = raw_keep.strip().lower() in {
                        "true", "1", "yes", "y"}
                keep = bool(raw_keep)
                reason = str(model_values.get("reason", reason))
            provenance = meta
        except (httpx.HTTPError, ValueError, TypeError, KeyError):
            provenance = {"live_inference": False,
                          "reason": "model_request_failed"}

        filtered.append({
            "item_index": global_index,
            "relevance_score": relevance_score,
            "quality_score": quality_score,
            "keep": keep,
            "reason": reason,
            "item": item,
            "processed_at": time.time(),
            "provenance": provenance,
        })

    return {
        "agent_id": AGENT_ID,
        "agent_wallet": AGENT_WALLET,
        "price_per_item": PRICE_PER_ITEM,
        "reputation": REPUTATION,
        "n_input": len(items),
        "n_filtered": len(filtered),
        "filtered": filtered,
        "meta": {
            "live_inference": LIVE_INFERENCE,
            "model": MODEL_NAME,
            "strategy": "model_first_with_heuristic_fallback",
            "filter_model_sample_every": FILTER_MODEL_SAMPLE_EVERY,
            "filter_model_max_items": FILTER_MODEL_MAX_ITEMS,
            "model_timeout_seconds": MODEL_TIMEOUT_SECONDS,
        },
    }


@app.get("/health")
async def health():
    return {
        "agent": AGENT_ID,
        "reputation": REPUTATION,
        "price_per_item": PRICE_PER_ITEM,
        "wallet": AGENT_WALLET,
        "status": "standby",
        "live_inference": LIVE_INFERENCE,
        "model": MODEL_NAME,
        "filter_model_sample_every": FILTER_MODEL_SAMPLE_EVERY,
        "filter_model_max_items": FILTER_MODEL_MAX_ITEMS,
        "model_timeout_seconds": MODEL_TIMEOUT_SECONDS,
    }
