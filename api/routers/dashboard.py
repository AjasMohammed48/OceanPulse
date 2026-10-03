# routers/dashboard.py
# GET /api/dashboard/summary

import os
import sys
import numpy as np
import pandas as pd
import xarray as xr
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import ZARR, RESULTS, RESULTS_DIR
from oceanpulse.anomaly import enso_phase, iod_phase, pdo_phase, load_indices
from cache import get_cached, set_cached

router = APIRouter()

class MHWStatus(BaseModel):
    is_active: bool
    category: int
    category_label: str
    mean_intensity: float
    max_intensity: float
    coverage_pct: float
    date: str
    confidence: float

class ClimateIndices(BaseModel):
    enso: float
    enso_phase: str
    dmi: float
    iod_phase: str
    pdo: float
    pdo_phase: str

class ArgoSummary(BaseModel):
    n_profiles: int
    mean_sst: float
    median_mld: float
    mean_ohc: float
    mean_confidence: float

class Trends(BaseModel):
    sst_slope: float
    ohc_slope: float
    mld_slope: float

class RapidChanges(BaseModel):
    sst_rises_30d: int
    sst_drops_30d: int

class DashboardSummary(BaseModel):
    mhw: MHWStatus
    climate_indices: ClimateIndices
    argo: ArgoSummary
    trends: Trends
    rapid_changes: RapidChanges

def sf(val, default=0.0):
    try:
        v = float(val)
        return default if (np.isnan(v) or np.isinf(v)) else round(v, 4)
    except Exception:
        return default

CAT_LABEL = {0: "None", 1: "Moderate", 2: "Strong", 3: "Severe", 4: "Extreme"}

@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary():
    CACHE_KEY = "dashboard_summary"

    cached = get_cached(CACHE_KEY)
    if cached is not None:
        return cached

    try:
        # ── 1. MHW timeseries ──────────────────────────────────
        df_mhw = pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))
        df_mhw["date"] = pd.to_datetime(df_mhw["date"])
        latest = df_mhw.sort_values("date").iloc[-1]

        is_active    = bool(latest.get("is_mhw", False))
        category     = int(latest.get("mhw_category", 0))
        coverage_pct = sf(latest.get("frac_mhw", 0.0) * 100)
        mean_int     = sf(latest.get("mean_intensity", 0.0))
        max_int      = sf(latest.get("max_intensity", mean_int))
        confidence   = sf(latest.get("mhw_confidence", 0.0))
        mhw_date     = str(latest["date"])[:10]

        mhw = MHWStatus(
            is_active      = is_active,
            category       = category,
            category_label = CAT_LABEL.get(category, "Unknown"),
            mean_intensity = mean_int,
            max_intensity  = max_int,
            coverage_pct   = coverage_pct,
            date           = mhw_date,
            confidence     = confidence,
        )

        # ── 2. Mean SST from sst.zarr ──────────────────────────
        # shape: (2187, 280, 400), coords: lat, lon, time, zlev
        mean_sst_zarr = 0.0
        try:
            ds_sst = xr.open_zarr(ZARR["sst"], consolidated=False)
            sst_var = ds_sst["sst"]
            # zlev is a scalar coord, not a dim — safe to just use as-is
            mean_sst_zarr = sf(float(
                sst_var.isel(time=-1).mean(dim=["lat", "lon"], skipna=True).compute().values
            ))
            ds_sst.close()
        except Exception:
            pass

        # ── 3. Climate indices ──────────────────────────────────
        enso_val = dmi_val = pdo_val = 0.0
        enso_ph = iod_ph = pdo_ph = "Neutral"
        try:
            idx = load_indices()
            last = idx.iloc[-1]
            enso_val = sf(last["enso"])
            dmi_val  = sf(last["dmi"])
            pdo_val  = sf(last["pdo"])
            enso_ph  = enso_phase(enso_val)
            iod_ph   = iod_phase(dmi_val)
            pdo_ph   = pdo_phase(pdo_val)
        except Exception:
            pass

        climate_indices = ClimateIndices(
            enso       = enso_val,
            enso_phase = enso_ph,
            dmi        = dmi_val,
            iod_phase  = iod_ph,
            pdo        = pdo_val,
            pdo_phase  = pdo_ph,
        )

        # ── 4. Argo summary (last 90 days) ──────────────────────
        # columns: sst_argo, mld, ohc_700m, time
        n_profiles = 0
        mean_sst = median_mld = mean_ohc = 0.0
        try:
            df_argo = pd.read_parquet(os.path.join(RESULTS_DIR, "argo_all_physics.parquet"))
            df_argo["time"] = pd.to_datetime(df_argo["time"], errors="coerce")
            cutoff = df_argo["time"].max() - timedelta(days=90)
            recent = df_argo[df_argo["time"] >= cutoff]
            n_profiles = len(recent)
            if n_profiles > 0:
                mean_sst   = sf(recent["sst_argo"].mean())
                median_mld = sf(recent["mld"].median())
                mean_ohc   = sf(recent["ohc_700m"].mean())
        except Exception:
            pass

        # Use zarr SST if argo SST is 0
        if mean_sst == 0.0 and mean_sst_zarr != 0.0:
            mean_sst = mean_sst_zarr

        argo = ArgoSummary(
            n_profiles      = n_profiles,
            mean_sst        = mean_sst,
            median_mld      = median_mld,
            mean_ohc        = mean_ohc,
            mean_confidence = confidence,
        )

        # ── 5. Trends ───────────────────────────────────────────
        sst_slope = ohc_slope = mld_slope = 0.0
        try:
            df_tr = pd.read_parquet(os.path.join(RESULTS_DIR, "trends.parquet"))
            def get_slope(keyword):
                row = df_tr[df_tr["variable"].str.contains(keyword, case=False)]
                if row.empty:
                    return 0.0
                col = "slope_per_year" if "slope_per_year" in row.columns else df_tr.columns[-1]
                return sf(row.iloc[0][col])
            sst_slope = get_slope("sst")
            ohc_slope = get_slope("ohc")
            mld_slope = get_slope("mld")
        except Exception:
            pass

        trends = Trends(
            sst_slope = sst_slope,
            ohc_slope = ohc_slope,
            mld_slope = mld_slope,
        )

        # ── 6. Rapid changes (last 30 days) ─────────────────────
        sst_rises = sst_drops = 0
        try:
            df_rc = pd.read_parquet(os.path.join(RESULTS_DIR, "rapid_changes.parquet"))
            df_rc["date"] = pd.to_datetime(df_rc["date"], errors="coerce")
            cutoff_30 = df_rc["date"].max() - timedelta(days=30)
            recent_rc = df_rc[df_rc["date"] >= cutoff_30]
            rise_col = next((c for c in recent_rc.columns
                             if any(k in c.lower() for k in ["rise", "positive", "warm"])), None)
            drop_col = next((c for c in recent_rc.columns
                             if any(k in c.lower() for k in ["drop", "negative", "cool"])), None)
            if rise_col:
                sst_rises = int((recent_rc[rise_col] > 0).sum())
            if drop_col:
                sst_drops = int((recent_rc[drop_col] > 0).sum())
        except Exception:
            pass

        result = DashboardSummary(
            mhw             = mhw,
            climate_indices = climate_indices,
            argo            = argo,
            trends          = trends,
            rapid_changes   = RapidChanges(
                sst_rises_30d = sst_rises,
                sst_drops_30d = sst_drops,
            ),
        )

        set_cached(CACHE_KEY, result, ttl_seconds=60)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard summary failed: {str(e)}")