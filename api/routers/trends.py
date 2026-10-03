# routers/trends.py
# GET /api/trends

import os
import sys
import numpy as np
import pandas as pd
import xarray as xr
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import ZARR, RESULTS, RESULTS_DIR
from cache import get_cached, set_cached

router = APIRouter()

# ── Models ─────────────────────────────────────────────────────
class TrendVariable(BaseModel):
    variable: str
    slope_per_decade: float
    r2: float
    trend_confidence: float
    p_value: float
    direction: str

class YearlyPoint(BaseModel):
    year: int
    sst: Optional[float]
    sst_anomaly: Optional[float]
    ohc: Optional[float]
    mld: Optional[float]
    mhw_days: Optional[int]

class StratificationPoint(BaseModel):
    year: int
    n2_mean: Optional[float]
    n2_trend: Optional[float]

class SeasonalPoint(BaseModel):
    month: str
    sst_mean: float
    sst_std: float
    mld_mean: float
    ohc_mean: float

class TrendsData(BaseModel):
    trends: List[TrendVariable]
    yearly: List[YearlyPoint]
    stratification: List[StratificationPoint]
    seasonal: List[SeasonalPoint]

# ── Helpers ────────────────────────────────────────────────────
MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

def sf(val, default=None):
    try:
        v = float(val)
        return None if (np.isnan(v) or np.isinf(v)) else round(v, 5)
    except Exception:
        return default

def direction(slope):
    if slope is None:
        return "stable"
    if slope > 0.001:
        return "rising"
    if slope < -0.001:
        return "falling"
    return "stable"

def safe_col(grp, col):
    """Safely get mean of a column from a DataFrame group."""
    if col in grp.columns:
        v = grp[col].mean()
        return sf(v)
    return None

# ── Endpoint ───────────────────────────────────────────────────
@router.get("", response_model=TrendsData)
def get_trends():
    """
    Returns long-term trend data for the Indian Ocean including:
    - Trend statistics for SST anomaly, OHC, MLD, and Qnet
    - Year-by-year average values for each variable
    - Seasonal (month-by-month) averages
    - Ocean stratification trend if available
    """
    CACHE_KEY = "trends_data"

    cached = get_cached(CACHE_KEY)
    if cached is not None:
        return cached

    try:
        trends_out   = []
        yearly_dict  = {}
        seasonal_out = []
        strat_out    = []

        # ── 1. Trend statistics from trends.parquet ───────────
        trends_path = os.path.join(RESULTS_DIR, "trends.parquet")
        df_trends = pd.read_parquet(trends_path)

        name_map = {
            "SST anomaly" : "sst",
            "OHC_700m"    : "ohc_700m",
            "MLD"         : "mld",
            "Qnet"        : "qnet",
        }

        for _, row in df_trends.iterrows():
            var_raw      = str(row["variable"])
            var_key      = name_map.get(var_raw, var_raw.lower().replace(" ", "_"))
            slope_yr     = sf(row.get("slope_per_year", row.get("slope_per_decade", 0)))
            slope_decade = round(slope_yr * 10, 6) if slope_yr is not None else 0.0
            r2_val       = sf(row.get("r2", 0)) or 0.0
            conf         = round(min(max(r2_val, 0), 1), 4)
            p_val        = sf(row.get("p_value", 0.05)) or 0.05

            trends_out.append(TrendVariable(
                variable         = var_key,
                slope_per_decade = slope_decade,
                r2               = r2_val,
                trend_confidence = conf,
                p_value          = p_val,
                direction        = direction(slope_decade),
            ))

        # ── 2. Year-by-year values ────────────────────────────
        # SST anomaly from zarr
        try:
            ds_anom     = xr.open_zarr(RESULTS["sst_anomaly"]).compute()
            sst_anom    = ds_anom["sst_anomaly"]
            sst_mean_ts = sst_anom.mean(
                dim=[d for d in sst_anom.dims if d != "time"], skipna=True
            )
            sst_series  = pd.Series(
                sst_mean_ts.values,
                index=pd.to_datetime(sst_mean_ts.time.values)
            )
            sst_yearly  = sst_series.resample("YE").mean()
            for date, val in sst_yearly.items():
                yr = int(date.year)
                if yr not in yearly_dict:
                    yearly_dict[yr] = {}
                yearly_dict[yr]["sst_anomaly"] = sf(val)
            ds_anom.close()
        except Exception as e:
            print(f"  SST anomaly zarr failed: {e}")

        # SST raw for absolute temperature
        try:
            ds_sst    = xr.open_zarr(ZARR["sst"]).compute()
            sst_var   = ds_sst["sst"]
            if "zlev" in sst_var.dims:
                sst_var = sst_var.isel(zlev=0)
            sst_raw_ts = sst_var.mean(
                dim=[d for d in sst_var.dims if d != "time"], skipna=True
            )
            sst_raw_series = pd.Series(
                sst_raw_ts.values,
                index=pd.to_datetime(sst_raw_ts.time.values)
            )
            sst_raw_yearly = sst_raw_series.resample("YE").mean()
            for date, val in sst_raw_yearly.items():
                yr = int(date.year)
                if yr not in yearly_dict:
                    yearly_dict[yr] = {}
                yearly_dict[yr]["sst"] = sf(val)
            ds_sst.close()
        except Exception as e:
            print(f"  SST raw zarr failed: {e}")

        # OHC and MLD from argo parquet
        try:
            argo_path = os.path.join(RESULTS_DIR, "argo_all_physics.parquet")
            df_argo   = pd.read_parquet(argo_path)
            df_argo["time"] = pd.to_datetime(df_argo["time"], errors="coerce")
            df_argo   = df_argo.dropna(subset=["time"])
            df_argo["year"] = df_argo["time"].dt.year

            for yr, grp in df_argo.groupby("year"):
                if yr not in yearly_dict:
                    yearly_dict[yr] = {}
                if "ohc_700m" in grp.columns:
                    yearly_dict[yr]["ohc"] = sf(grp["ohc_700m"].mean())
                if "mld" in grp.columns:
                    yearly_dict[yr]["mld"] = sf(grp["mld"].mean())
        except Exception as e:
            print(f"  OHC/MLD from argo failed: {e}")

        # MHW days per year
        try:
            mhw_path = os.path.join(RESULTS_DIR, "mhw_timeseries.parquet")
            df_mhw   = pd.read_parquet(mhw_path)
            df_mhw["date"] = pd.to_datetime(df_mhw["date"])
            df_mhw["year"] = df_mhw["date"].dt.year
            mhw_days = df_mhw[df_mhw["is_mhw"] == True].groupby("year").size()
            for yr, days in mhw_days.items():
                if yr not in yearly_dict:
                    yearly_dict[yr] = {}
                yearly_dict[yr]["mhw_days"] = int(days)
        except Exception as e:
            print(f"  MHW days failed: {e}")

        # Build yearly list
        yearly_list = []
        for yr in sorted(yearly_dict.keys()):
            d = yearly_dict[yr]
            yearly_list.append(YearlyPoint(
                year        = yr,
                sst         = d.get("sst"),
                sst_anomaly = d.get("sst_anomaly"),
                ohc         = d.get("ohc"),
                mld         = d.get("mld"),
                mhw_days    = d.get("mhw_days"),
            ))

        # ── 3. Seasonal patterns ──────────────────────────────
        # analysis.py saves seasonal_climatology.parquet in LONG format:
        # columns: variable, month, mean, std, n
        # We need to pivot to wide format before reading.
        try:
            seasonal_path = os.path.join(RESULTS_DIR, "seasonal_climatology.parquet")
            df_seas       = pd.read_parquet(seasonal_path)
            print(f"  seasonal_climatology columns: {list(df_seas.columns)}")
            print(f"  seasonal_climatology shape  : {df_seas.shape}")

            if "variable" in df_seas.columns and "mean" in df_seas.columns:
                # ── LONG FORMAT (from analysis.py C2) ─────────
                df_wide = df_seas.pivot_table(
                    index="month", columns="variable", values="mean"
                ).reset_index()
                df_std = df_seas.pivot_table(
                    index="month", columns="variable", values="std"
                ).reset_index()
                df_wide.columns.name = None
                df_std.columns.name  = None

                print(f"  Pivoted wide columns: {list(df_wide.columns)}")

                for m in range(1, 13):
                    row_w = df_wide[df_wide["month"] == m]
                    row_s = df_std[df_std["month"] == m]
                    if row_w.empty:
                        continue

                    def gw(col):
                        try:
                            v = float(row_w[col].values[0])
                            return None if (np.isnan(v) or np.isinf(v)) else v
                        except Exception:
                            return None

                    def gs(col):
                        try:
                            v = float(row_s[col].values[0])
                            return None if (np.isnan(v) or np.isinf(v)) else v
                        except Exception:
                            return None

                    seasonal_out.append(SeasonalPoint(
                        month    = MONTH_NAMES[m - 1],
                        sst_mean = gw("sst_argo") or 0.0,
                        sst_std  = gs("sst_argo") or 0.0,
                        mld_mean = gw("mld")      or 0.0,
                        ohc_mean = gw("ohc_700m") or 0.0,
                    ))

            else:
                # ── WIDE FORMAT (legacy) ───────────────────────
                for _, row in df_seas.iterrows():
                    m = int(row.get("month", 0))
                    if 1 <= m <= 12:
                        seasonal_out.append(SeasonalPoint(
                            month    = MONTH_NAMES[m - 1],
                            sst_mean = sf(row.get("sst_argo_mean", row.get("sst_mean", 0))) or 0.0,
                            sst_std  = sf(row.get("sst_argo_std",  row.get("sst_std",  0))) or 0.0,
                            mld_mean = sf(row.get("mld_mean", 0)) or 0.0,
                            ohc_mean = sf(row.get("ohc_700m_mean", row.get("ohc_mean", 0))) or 0.0,
                        ))

            print(f"  Seasonal points loaded: {len(seasonal_out)}")

        except Exception as e:
            print(f"  seasonal_climatology.parquet failed: {e} — falling back to argo_all_physics")
            # ── FALLBACK: compute directly from raw argo parquet ──
            try:
                argo_path = os.path.join(RESULTS_DIR, "argo_all_physics.parquet")
                df_argo   = pd.read_parquet(argo_path)
                df_argo["time"] = pd.to_datetime(df_argo["time"], errors="coerce")
                df_argo   = df_argo.dropna(subset=["time"])
                df_argo["month"] = df_argo["time"].dt.month

                for m in range(1, 13):
                    grp = df_argo[df_argo["month"] == m]

                    sst_mean = safe_col(grp, "sst_argo")
                    sst_std  = sf(grp["sst_argo"].std()) if "sst_argo" in grp.columns else None
                    mld_mean = safe_col(grp, "mld")
                    ohc_mean = safe_col(grp, "ohc_700m")

                    seasonal_out.append(SeasonalPoint(
                        month    = MONTH_NAMES[m - 1],
                        sst_mean = sst_mean or 0.0,
                        sst_std  = sst_std  or 0.0,
                        mld_mean = mld_mean or 0.0,
                        ohc_mean = ohc_mean or 0.0,
                    ))
                print(f"  Fallback seasonal points: {len(seasonal_out)}")
            except Exception as e2:
                print(f"  Fallback seasonal also failed: {e2}")

        # ── 4. Stratification trend ───────────────────────────
        # analysis.py saves: time, mean_N2, std_N2, mean_strat, n_profiles
        # Column names differ from what the old code expected (n2_mean, n2_trend)
        try:
            strat_path = os.path.join(RESULTS_DIR, "stratification_trend.parquet")
            df_strat   = pd.read_parquet(strat_path)
            print(f"  stratification columns: {list(df_strat.columns)}")

            # ── Resolve time column ────────────────────────────
            if "time" in df_strat.columns:
                df_strat["_time"] = pd.to_datetime(df_strat["time"], errors="coerce")
            elif "date" in df_strat.columns:
                df_strat["_time"] = pd.to_datetime(df_strat["date"], errors="coerce")
            else:
                df_strat["_time"] = pd.to_datetime(df_strat.index, errors="coerce")

            df_strat = df_strat.dropna(subset=["_time"])
            df_strat["year"] = df_strat["_time"].dt.year

            # ── Resolve N2 column ──────────────────────────────
            # analysis.py uses "mean_N2", old code expected "n2_mean"
            n2_col = (
                "mean_N2"     if "mean_N2"     in df_strat.columns else
                "n2_mean"     if "n2_mean"     in df_strat.columns else
                None
            )
            # Stratification index column
            strat_col = (
                "mean_strat"  if "mean_strat"  in df_strat.columns else
                "strat_index" if "strat_index" in df_strat.columns else
                "n2_trend"    if "n2_trend"    in df_strat.columns else
                None
            )

            print(f"  n2_col={n2_col}  strat_col={strat_col}")
            print(f"  Years: {sorted(df_strat['year'].unique().tolist())}")

            for yr, grp in df_strat.groupby("year"):
                n2_val    = sf(grp[n2_col].mean())    if n2_col    else None
                strat_val = sf(grp[strat_col].mean()) if strat_col else None
                strat_out.append(StratificationPoint(
                    year     = int(yr),
                    n2_mean  = n2_val,
                    n2_trend = strat_val,
                ))

            print(f"  Stratification points loaded: {len(strat_out)}")

        except Exception as e:
            print(f"  Stratification failed: {e}")

        result = TrendsData(
            trends         = trends_out,
            yearly         = yearly_list,
            stratification = strat_out,
            seasonal       = seasonal_out,
        )

        set_cached(CACHE_KEY, result, ttl_seconds=3600)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trends endpoint failed: {str(e)}")