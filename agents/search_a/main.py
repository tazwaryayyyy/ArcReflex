import hashlib
import html
import json
import os
import re
import time
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ArcReflex Search Agent A", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

AGENT_ID = "search_a"
AGENT_WALLET = os.getenv("SEARCH_A_WALLET", "0xSEARCH_A")
PRICE_USDC = 0.0002
REPUTATION = 72
MODEL_API_URL = os.getenv("ARCREFLEX_MODEL_API_URL", "").strip()
MODEL_API_KEY = os.getenv("ARCREFLEX_MODEL_API_KEY", "").strip()
MODEL_NAME = os.getenv("ARCREFLEX_MODEL", "gpt-4o-mini").strip()
LIVE_INFERENCE = os.getenv("ARCREFLEX_LIVE_INFERENCE",
                           "false").lower() == "true"
MODEL_TIMEOUT_SECONDS = float(
    os.getenv("ARCREFLEX_MODEL_TIMEOUT_SECONDS", "12"))
ENABLE_WEB_SEARCH = os.getenv("ARCREFLEX_ENABLE_WEB_SEARCH",
                              "true").lower() == "true"
WEB_SEARCH_TIMEOUT_SECONDS = float(
    os.getenv("ARCREFLEX_WEB_SEARCH_TIMEOUT_SECONDS", "8"))
SEARCH_MODEL_MAX_RESULTS = max(
    1,
    min(25, int(os.getenv("ARCREFLEX_SEARCH_MODEL_MAX_RESULTS", "8"))),
)

RESULT_LINK_RE = re.compile(
    r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
    flags=re.IGNORECASE | re.DOTALL,
)
RESULT_SNIPPET_RE = re.compile(
    r'class="result__snippet"[^>]*>(.*?)</(?:a|div)>',
    flags=re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")

RESULT_TEMPLATES = [
    {"source": "arxiv.org", "type": "research", "authority": 0.92},
    {"source": "techcrunch.com", "type": "news", "authority": 0.78},
    {"source": "github.com", "type": "code", "authority": 0.88},
    {"source": "hbr.org", "type": "analysis", "authority": 0.85},
    {"source": "wired.com", "type": "news", "authority": 0.76},
    {"source": "venturebeat.com", "type": "news", "authority": 0.72},
    {"source": "nature.com", "type": "research", "authority": 0.96},
    {"source": "bloomberg.com", "type": "market", "authority": 0.89},
    {"source": "a16z.com", "type": "analysis", "authority": 0.82},
    {"source": "mit.edu", "type": "research", "authority": 0.94},
    {"source": "ft.com", "type": "market", "authority": 0.87},
    {"source": "hackernews.com", "type": "discussion", "authority": 0.65},
    {"source": "stanford.edu", "type": "research", "authority": 0.95},
    {"source": "theverge.com", "type": "news", "authority": 0.74},
    {"source": "mckinsey.com", "type": "analysis", "authority": 0.88},
    {"source": "ieee.org", "type": "research", "authority": 0.93},
    {"source": "economist.com", "type": "analysis", "authority": 0.90},
    {"source": "openai.com", "type": "research", "authority": 0.85},
    {"source": "anthropic.com", "type": "research", "authority": 0.87},
    {"source": "deepmind.google", "type": "research", "authority": 0.91},
    {"source": "semianalysis.com", "type": "analysis", "authority": 0.83},
    {"source": "stratechery.com", "type": "analysis", "authority": 0.80},
    {"source": "lesswrong.com", "type": "discussion", "authority": 0.70},
    {"source": "substack.com", "type": "analysis", "authority": 0.68},
    {"source": "wsj.com", "type": "market", "authority": 0.88},
]


def _extract_json_array(text: str) -> list[dict]:
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        value = json.loads(text[start:end + 1])
        return value if isinstance(value, list) else []
    except json.JSONDecodeError:
        return []


def _strip_html(raw: str) -> str:
    return html.unescape(TAG_RE.sub("", raw)).strip()


def _resolve_ddg_url(href: str) -> str:
    parsed = urlparse(href)
    if parsed.path.startswith("/l/"):
        query = parse_qs(parsed.query)
        encoded = query.get("uddg", [""])[0]
        if encoded:
            return unquote(encoded)
    return href


def _infer_type_from_host(host: str) -> str:
    host_l = host.lower()
    if host_l.endswith(".edu") or host_l.endswith(".gov"):
        return "research"
    if any(x in host_l for x in ["arxiv", "nature", "ieee", "acm", "scholar"]):
        return "research"
    if any(x in host_l for x in ["news", "reuters", "apnews", "bloomberg", "wsj", "ft", "cnbc"]):
        return "news"
    if any(x in host_l for x in ["github", "gitlab", "docs"]):
        return "code"
    return "web"


def _infer_authority(host: str) -> float:
    host_l = host.lower()
    if host_l.endswith(".edu") or host_l.endswith(".gov"):
        return 0.93
    if any(x in host_l for x in ["arxiv", "nature", "ieee", "acm", "reuters", "apnews"]):
        return 0.9
    if any(x in host_l for x in ["github", "bloomberg", "wsj", "ft"]):
        return 0.86
    return 0.78


async def _web_search(query: str, n: int) -> tuple[list[dict], dict]:
    if not ENABLE_WEB_SEARCH:
        return [], {"enabled": False, "reason": "web_search_disabled"}

    started = time.time()
    try:
        async with httpx.AsyncClient(timeout=WEB_SEARCH_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                "https://duckduckgo.com/html/",
                params={"q": query},
                headers={
                    "User-Agent": "ArcReflex/1.0 (+https://example.local)",
                },
            )
            resp.raise_for_status()
            page = resp.text
    except httpx.HTTPError:
        return [], {
            "enabled": True,
            "engine": "duckduckgo_html",
            "reason": "web_search_request_failed",
        }

    snippets = RESULT_SNIPPET_RE.findall(page)
    results = []
    seen = set()
    for i, match in enumerate(RESULT_LINK_RE.finditer(page)):
        if len(results) >= n:
            break
        href = match.group(1)
        title_html = match.group(2)
        url = _resolve_ddg_url(href)
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            continue
        if url in seen:
            continue
        seen.add(url)
        host = parsed.netloc.lower() or "unknown"
        snippet = _strip_html(snippets[i]) if i < len(
            snippets) else f"Web coverage about {query}."
        results.append({
            "rank": len(results) + 1,
            "title": _strip_html(title_html) or f"{query.title()} result",
            "url": url,
            "snippet": snippet,
            "source": host,
            "authority": _infer_authority(host),
            "type": _infer_type_from_host(host),
        })

    return results, {
        "enabled": True,
        "engine": "duckduckgo_html",
        "latency_ms": int((time.time() - started) * 1000),
        "response_hash": hashlib.sha256(page.encode("utf-8")).hexdigest(),
        "n_generated": len(results),
    }


async def _model_search(query: str, n: int) -> tuple[list[dict], dict]:
    if not (LIVE_INFERENCE and MODEL_API_URL and MODEL_API_KEY):
        return [], {"live_inference": False, "reason": "disabled_or_unconfigured"}

    prompt = (
        "Return ONLY a JSON array with exactly "
        f"{n} objects. Each object must include: title, url, snippet, source, authority, type. "
        f"Topic: {query}."
    )
    payload = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
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
    rows = _extract_json_array(content)

    cleaned = []
    for i, row in enumerate(rows[:n]):
        cleaned.append({
            "rank": i + 1,
            "title": str(row.get("title", f"{query.title()} Result #{i + 1}")),
            "url": str(row.get("url", f"https://example.com/{query.lower().replace(' ', '-')}-{i + 1}")),
            "snippet": str(row.get("snippet", f"Coverage about {query}.")),
            "source": str(row.get("source", "unknown")),
            "authority": float(row.get("authority", 0.75)),
            "type": str(row.get("type", "analysis")),
        })

    meta = {
        "live_inference": True,
        "model": MODEL_NAME,
        "latency_ms": int((time.time() - started) * 1000),
        "prompt_hash": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "response_hash": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        "n_generated": len(cleaned),
    }
    return cleaned, meta


def _template_search(query: str, n: int, rank_offset: int = 0) -> list[dict]:
    results = []
    for i in range(n):
        global_index = rank_offset + i
        tmpl = RESULT_TEMPLATES[global_index % len(RESULT_TEMPLATES)]
        results.append({
            "rank": global_index + 1,
            "title": f"{query.title()} - {tmpl['type'].capitalize()} Report #{global_index + 1}",
            "url": f"https://{tmpl['source']}/articles/{query.lower().replace(' ', '-')}-{global_index + 1}",
            "snippet": f"Comprehensive {tmpl['type']} on {query} from {tmpl['source']}. "
            f"Published with authority score {tmpl['authority']:.2f}.",
            "source": tmpl["source"],
            "authority": tmpl["authority"],
            "type": tmpl["type"],
        })
    return results


@app.post("/search")
async def search(body: dict):
    query = body.get("query", "")
    n = min(body.get("n", 25), 25)

    provenance = {"live_inference": False, "reason": "template_fallback"}
    results = _template_search(query, n)
    try:
        web_results, web_meta = await _web_search(query, n)
        if web_results:
            remaining_after_web = n - len(web_results)
            model_n = min(remaining_after_web, SEARCH_MODEL_MAX_RESULTS)
            model_results, model_meta = (
                (await _model_search(query, model_n))
                if model_n > 0
                else ([], {"live_inference": False, "reason": "model_not_needed"})
            )
            remaining_after_model = n - len(web_results) - len(model_results)
            tail = _template_search(query, remaining_after_model, rank_offset=len(
                web_results) + len(model_results)) if remaining_after_model > 0 else []
            results = web_results + model_results + tail
            provenance = {
                "strategy": "web_grounded_head_model_then_template_tail",
                "web": web_meta,
                "model": model_meta,
                "web_result_count": len(web_results),
                "model_requested_n": model_n,
                "model_result_count": len(model_results),
                "template_result_count": len(tail),
            }
        else:
            model_n = min(n, SEARCH_MODEL_MAX_RESULTS)
            model_results, meta = await _model_search(query, model_n)
            if model_results:
                remaining = n - len(model_results)
                tail = _template_search(query, remaining, rank_offset=len(
                    model_results)) if remaining > 0 else []
                results = model_results + tail
                provenance = {
                    **meta,
                    "web": web_meta,
                    "model_requested_n": model_n,
                    "model_result_count": len(model_results),
                    "template_result_count": len(tail),
                    "strategy": "model_head_template_tail",
                }
            else:
                provenance = {
                    **meta,
                    "web": web_meta,
                    "model_requested_n": min(n, SEARCH_MODEL_MAX_RESULTS),
                    "model_result_count": 0,
                    "template_result_count": n,
                    "strategy": "template_fallback",
                }
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        provenance = {
            "live_inference": False,
            "reason": "model_request_failed",
            "model_requested_n": min(n, SEARCH_MODEL_MAX_RESULTS),
            "model_result_count": 0,
            "template_result_count": n,
            "strategy": "template_fallback",
        }

    return {
        "agent_id": AGENT_ID,
        "agent_wallet": AGENT_WALLET,
        "price_usdc": PRICE_USDC,
        "reputation": REPUTATION,
        "query": query,
        "n_returned": len(results),
        "results": results,
        "provenance": provenance,
    }


@app.get("/health")
async def health():
    return {
        "agent": AGENT_ID,
        "reputation": REPUTATION,
        "price_usdc": PRICE_USDC,
        "wallet": AGENT_WALLET,
        "status": "active",
        "live_inference": LIVE_INFERENCE,
        "model": MODEL_NAME,
        "web_search_enabled": ENABLE_WEB_SEARCH,
        "web_search_timeout_seconds": WEB_SEARCH_TIMEOUT_SECONDS,
        "search_model_max_results": SEARCH_MODEL_MAX_RESULTS,
        "model_timeout_seconds": MODEL_TIMEOUT_SECONDS,
    }
