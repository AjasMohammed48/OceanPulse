# routers/heatwaves.py
# GET /api/heatwaves/events

import os
import sys
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import RESULTS_DIR
from cache import get_cached, set_cached

router = APIRouter()

# ── Models ─────────────────────────────────────────────────────
class HeatwaveEvent(BaseModel):
    event_id: int
    start_date: str
    end_date: str
    duration_days: int
    peak_date: str
    peak_intensity: float
    mean_intensity: float
    peak_coverage: float
    accumulated_heat: float
    peak_category: int
    dominant_enso: str
    dominant_iod: str
    mean_confidence: float

class YearlySummary(BaseModel):
    year: int
    count: int
    avg_duration: float

class HeatwaveEventsResponse(BaseModel):
    events: List[HeatwaveEvent]
    total: int
    yearly_summary: List[YearlySummary]

# ── Helper ─────────────────────────────────────────────────────
def sf(val, default=0.0):
    try:
        v = float(val)
        return default if (np.isnan(v) or np.isinf(v)) else round(v, 4)
    except Exception:
        return default

# ── Endpoint ───────────────────────────────────────────────────
@router.get("/events", response_model=HeatwaveEventsResponse)
def get_heatwave_events(
    category:     Optional[int] = Query(None, description="Filter by Hobday category 1–4"),
    sort:         str           = Query("date", description="Sort by: date | intensity | duration"),
    min_duration: int           = Query(5, ge=1, description="Minimum event duration in days (default 5 — Hobday definition)"),
):
    """
    Returns all detected marine heatwave events.

    Events shorter than min_duration days are excluded because they do not
    meet the Hobday et al. 2016 scientific definition of a Marine Heatwave
    (SST above 90th percentile threshold for AT LEAST 5 consecutive days).
    """
    CACHE_KEY = f"heatwave_events_{category}_{sort}_{min_duration}"

    cached = get_cached(CACHE_KEY)
    if cached is not None:
        return cached

    try:
        events_path = os.path.join(RESULTS_DIR, "mhw_events.parquet")
        df = pd.read_parquet(events_path)

        # Normalise column names
        df["start_date"] = pd.to_datetime(df["start_date"])
        df["end_date"]   = pd.to_datetime(df["end_date"])
        df["peak_date"]  = pd.to_datetime(df["peak_date"])

        # ── ENFORCE MINIMUM DURATION ──────────────────────────
        # This is the scientific definition filter.
        # Even if the parquet contains short events from a previous
        # run of analysis.py, the API enforces the rule here too.
        before = len(df)
        df = df[df["duration_days"] >= min_duration]
        removed = before - len(df)
        if removed > 0:
            print(f"  [events] Filtered out {removed} event(s) with duration < {min_duration} days")

        # Optional category filter
        if category is not None:
            df = df[df["peak_category"] == category]

        # Sort
        if sort == "intensity":
            df = df.sort_values("peak_intensity", ascending=False)
        elif sort == "duration":
            df = df.sort_values("duration_days", ascending=False)
        else:
            df = df.sort_values("start_date", ascending=False)

        # Build event list
        events = []
        for _, row in df.iterrows():
            events.append(HeatwaveEvent(
                event_id        = int(row.get("event_id", 0)),
                start_date      = str(row["start_date"])[:10],
                end_date        = str(row["end_date"])[:10],
                peak_date       = str(row["peak_date"])[:10],
                duration_days   = int(row.get("duration_days", 0)),
                peak_intensity  = sf(row.get("peak_intensity", 0)),
                mean_intensity  = sf(row.get("mean_intensity", 0)),
                peak_coverage   = sf(row.get("peak_coverage", 0)),
                accumulated_heat= sf(row.get("accumulated_heat", 0)),
                peak_category   = int(row.get("peak_category", 0)),
                dominant_enso   = str(row.get("dominant_enso", "unknown")),
                dominant_iod    = str(row.get("dominant_iod", "unknown")),
                mean_confidence = sf(row.get("mean_confidence", 0)),
            ))

        # Year-by-year summary — use the FILTERED data so the chart
        # also reflects only valid (≥5 day) events
        df_all = pd.read_parquet(events_path)
        df_all = df_all[df_all["duration_days"] >= min_duration]  # ← same filter
        df_all["year"] = pd.to_datetime(df_all["start_date"]).dt.year
        yearly = (df_all.groupby("year")
                        .agg(count=("event_id", "count"),
                             avg_duration=("duration_days", "mean"))
                        .reset_index())
        yearly_summary = [
            YearlySummary(
                year=int(row["year"]),
                count=int(row["count"]),
                avg_duration=round(float(row["avg_duration"]), 1),
            )
            for _, row in yearly.iterrows()
        ]

        result = HeatwaveEventsResponse(
            events=events,
            total=len(events),
            yearly_summary=yearly_summary,
        )

        set_cached(CACHE_KEY, result, ttl_seconds=600)
        return result

    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Heatwave events file not found. Run segment_mhw_events() from analysis.py first."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatwave events failed: {str(e)}")
# ─────────────────────────────────────────────────────────────────────────────
# ADD THIS TO THE BOTTOM OF: api/routers/heatwaves.py
# No new imports needed — os, pd, np, Query, HTTPException,
# get_cached, set_cached, RESULTS_DIR are all already imported.
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/timeseries")
def get_heatwave_timeseries(
    days: int = Query(365, ge=30, le=730, description="Number of most-recent days to return"),
):
    """
    Day-by-day MHW status for the dashboard calendar widget.
    Reads mhw_timeseries.parquet which analysis.py saves alongside mhw_events.parquet.

    Response:
        {
            timeseries: [{ date, is_mhw, intensity, category }, ...],
            total_days, mhw_days, mhw_fraction
        }
    """
    CACHE_KEY = f"heatwave_timeseries_{days}"
    cached = get_cached(CACHE_KEY)
    if cached is not None:
        return cached

    try:
        ts_path = os.path.join(RESULTS_DIR, "mhw_timeseries.parquet")
        df = pd.read_parquet(ts_path)

        # ── Normalise date column ───────────────────────────────────────────
        if "date" in df.columns:
            df["_date"] = pd.to_datetime(df["date"]).dt.date.astype(str)
        elif "time" in df.columns:
            df["_date"] = pd.to_datetime(df["time"]).dt.date.astype(str)
        else:
            df["_date"] = pd.to_datetime(df.index).date.astype(str)

        # ── Normalise is_mhw ───────────────────────────────────────────────
        if "is_mhw" not in df.columns:
            if "category" in df.columns:
                df["is_mhw"] = df["category"] > 0
            elif "intensity" in df.columns:
                df["is_mhw"] = df["intensity"] > 0
            else:
                df["is_mhw"] = False
        df["is_mhw"] = df["is_mhw"].astype(bool)

        # ── Normalise intensity ────────────────────────────────────────────
        if "intensity" not in df.columns:
            for alt in ["mean_intensity", "peak_intensity", "mhw_intensity"]:
                if alt in df.columns:
                    df["intensity"] = df[alt]
                    break
            else:
                df["intensity"] = df["is_mhw"].astype(float)
        df["intensity"] = pd.to_numeric(df["intensity"], errors="coerce").fillna(0.0)

        # ── Slice to most-recent N days ────────────────────────────────────
        df = df.sort_values("_date").tail(days).reset_index(drop=True)

        def category_label(row) -> str:
            if not row["is_mhw"]:
                return "Normal"
            i = float(row["intensity"])
            if i >= 3:  return "Severe"
            if i >= 2:  return "Moderate"
            return "Mild MHW"

        timeseries = [
            {
                "date":      row["_date"],
                "is_mhw":   bool(row["is_mhw"]),
                "intensity": round(float(row["intensity"]), 3),
                "category":  category_label(row),
            }
            for _, row in df.iterrows()
        ]

        mhw_days = int(df["is_mhw"].sum())
        result = {
            "timeseries":   timeseries,
            "total_days":   len(df),
            "mhw_days":     mhw_days,
            "mhw_fraction": round(mhw_days / len(df), 3) if len(df) > 0 else 0,
        }

        set_cached(CACHE_KEY, result, ttl_seconds=600)
        return result

    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=(
                "mhw_timeseries.parquet not found in RESULTS_DIR. "
                "This is the daily is_mhw/intensity timeseries — different from mhw_events.parquet. "
                "Add a step in analysis.py to save daily MHW status to this file."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatwave timeseries failed: {str(e)}")    