# C:\PROJECT\api\cache.py
# ─────────────────────────────────────────────────────────────
# In-memory cache for expensive data loads (parquet, zarr files).
#
# HOW TO USE in any router:
#
#   from cache import get_cached, set_cached
#
#   data = get_cached("dashboard_summary")
#   if data is None:
#       data = load_expensive_data()   # only runs once
#       set_cached("dashboard_summary", data, ttl_seconds=300)
#   return data
#
# This means your parquet/zarr files are only read from disk
# ONCE every 5 minutes (300 seconds) instead of on every request.
# ─────────────────────────────────────────────────────────────

import time
from typing import Any, Optional

# { key: (value, expiry_timestamp) }
_store: dict[str, tuple[Any, float]] = {}


def get_cached(key: str) -> Optional[Any]:
    """Return cached value if it exists and hasn't expired. Otherwise None."""
    entry = _store.get(key)
    if entry is None:
        return None
    value, expiry = entry
    if time.time() > expiry:
        del _store[key]
        return None
    return value


def set_cached(key: str, value: Any, ttl_seconds: int = 300) -> None:
    """Store a value in the cache with a time-to-live in seconds.
    
    Default TTL is 300 seconds (5 minutes).
    Use longer TTL for data that rarely changes (trends: 3600s = 1 hour).
    Use shorter TTL for live status data (dashboard: 60s = 1 minute).
    """
    _store[key] = (value, time.time() + ttl_seconds)


def invalidate(key: str) -> None:
    """Remove a specific key from the cache (e.g. after an upload)."""
    _store.pop(key, None)


def invalidate_all() -> None:
    """Clear the entire cache (useful for debugging)."""
    _store.clear()


def cache_stats() -> dict:
    """Return info about what's currently cached (for the /health endpoint)."""
    now = time.time()
    alive = {k: round(exp - now, 1) for k, (_, exp) in _store.items() if exp > now}
    return {"cached_keys": list(alive.keys()), "ttl_remaining_seconds": alive}
