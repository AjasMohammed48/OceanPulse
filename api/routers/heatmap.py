# routers/heatmap.py
# GET /api/heatmap/sst
# GET /api/heatmap/latest
# sst.zarr: variable=sst, coords=lat(280), lon(400), time(2187), zlev(scalar)

import os
import sys
import numpy as np
import pandas as pd
import xarray as xr
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import ZARR, RESULTS, RESULTS_DIR
from cache import get_cached, set_cached

router = APIRouter()


# ── Models ─────────────────────────────────────────────────────────────────
class HeatmapPoint(BaseModel):
    latitude: float
    longitude: float
    sst: float
    sst_anomaly: float


class HeatmapData(BaseModel):
    points: List[HeatmapPoint]
    date: str
    min_sst: float
    max_sst: float
    min_anomaly: float
    max_anomaly: float


# ── GET /api/heatmap/sst ───────────────────────────────────────────────────
@router.get("/sst", response_model=HeatmapData)
def get_sst_heatmap(
    date: Optional[str] = Query(None, description="Date YYYY-MM-DD. Defaults to latest."),
    stride: int = Query(4, description="Spatial stride. Higher = fewer points. Default 4."),
):
    CACHE_KEY = f"heatmap_sst_{date or 'latest'}_{stride}"

    cached = get_cached(CACHE_KEY)
    if cached is not None:
        return cached

    try:
        # ── Load sst.zarr ──────────────────────────────────────────────────
        ds_sst = xr.open_zarr(ZARR["sst"], consolidated=False)
        sst_var = ds_sst["sst"]   # dims: time, lat, lon

        times = pd.to_datetime(sst_var.time.values)
        if date:
            target = pd.Timestamp(date)
            t_idx = int(np.argmin(np.abs(times - target)))
        else:
            t_idx = len(times) - 1

        selected_date = str(times[t_idx])[:10]
        sst_slice = sst_var.isel(time=t_idx).compute()  # shape: (280, 400)

        lats = sst_slice["lat"].values
        lons = sst_slice["lon"].values
        sst_vals = sst_slice.values

        # ── Load sst_anomaly.zarr ──────────────────────────────────────────
        anom_vals = None
        try:
            ds_anom = xr.open_zarr(RESULTS["sst_anomaly"], consolidated=False)
            anom_candidates = [v for v in ds_anom.data_vars
                               if any(k in v.lower() for k in ["anom", "sst", "temp"])]
            if anom_candidates:
                anom_var = ds_anom[anom_candidates[0]]
                anom_times = pd.to_datetime(anom_var.time.values)
                a_idx = int(np.argmin(np.abs(anom_times - times[t_idx])))
                anom_slice = anom_var.isel(time=a_idx).compute()
                anom_vals = anom_slice.values
            ds_anom.close()
        except Exception:
            pass

        # ── Downsample ─────────────────────────────────────────────────────
        lats_s = lats[::stride]
        lons_s = lons[::stride]
        sst_s  = sst_vals[::stride, ::stride]
        anom_s = anom_vals[::stride, ::stride] if anom_vals is not None else None

        # ── Build points ───────────────────────────────────────────────────
        points = []
        for i, lat in enumerate(lats_s):
            for j, lon in enumerate(lons_s):
                if i >= sst_s.shape[0] or j >= sst_s.shape[1]:
                    continue
                s = float(sst_s[i, j])
                if np.isnan(s):
                    continue

                if anom_s is not None and i < anom_s.shape[0] and j < anom_s.shape[1]:
                    a = float(anom_s[i, j])
                    if np.isnan(a):
                        a = s - 28.0
                else:
                    a = s - 28.0

                points.append(HeatmapPoint(
                    latitude    = round(float(lat), 3),
                    longitude   = round(float(lon), 3),
                    sst         = round(s, 3),
                    sst_anomaly = round(a, 3),
                ))

        ds_sst.close()

        if not points:
            raise HTTPException(status_code=500,
                detail="No valid SST data points found after processing.")

        valid_sst  = [p.sst for p in points]
        valid_anom = [p.sst_anomaly for p in points]

        result = HeatmapData(
            points      = points,
            date        = selected_date,
            min_sst     = round(min(valid_sst),  2),
            max_sst     = round(max(valid_sst),  2),
            min_anomaly = round(min(valid_anom), 2),
            max_anomaly = round(max(valid_anom), 2),
        )

        set_cached(CACHE_KEY, result, ttl_seconds=300)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatmap SST failed: {str(e)}")


# ── GET /api/heatmap/latest ────────────────────────────────────────────────
@router.get("/latest")
def get_heatmap_latest(
    stride: int = Query(4, description="Spatial stride — same as /sst"),
):
    """
    Returns SST anomaly as a 2-D grid for the dashboard canvas heatmap widget.
    Reuses get_sst_heatmap() and converts the flat points list → grid[][].

    Response:
        {
            grid: (number | null)[][],   # [lat_row][lon_col]
            date: str,
            lat_values: float[],
            lon_values: float[],
            lat_min, lat_max, lon_min, lon_max,
            min_anomaly, max_anomaly,
            units: "°C anomaly"
        }
    """
    CACHE_KEY = f"heatmap_latest_{stride}"
    cached = get_cached(CACHE_KEY)
    if cached is not None:
        return cached

    try:
        # Reuse the /sst endpoint logic
        heatmap_data = get_sst_heatmap(date=None, stride=stride)

        # Build lookup: (rounded_lat, rounded_lon) → sst_anomaly
        lookup: dict = {}
        lats_set: set = set()
        lons_set: set = set()
        for p in heatmap_data.points:
            rlat = round(p.latitude, 1)
            rlon = round(p.longitude, 1)
            lookup[(rlat, rlon)] = p.sst_anomaly
            lats_set.add(rlat)
            lons_set.add(rlon)

        sorted_lats = sorted(lats_set)
        sorted_lons = sorted(lons_set)

        # Build 2-D grid — missing cells → None (JSON null)
        grid = []
        for lat in sorted_lats:
            row = []
            for lon in sorted_lons:
                val = lookup.get((lat, lon))
                row.append(round(val, 3) if val is not None else None)
            grid.append(row)

        result = {
            "grid":        grid,
            "date":        heatmap_data.date,
            "lat_values":  sorted_lats,
            "lon_values":  sorted_lons,
            "lat_min":     min(sorted_lats) if sorted_lats else None,
            "lat_max":     max(sorted_lats) if sorted_lats else None,
            "lon_min":     min(sorted_lons) if sorted_lons else None,
            "lon_max":     max(sorted_lons) if sorted_lons else None,
            "min_anomaly": heatmap_data.min_anomaly,
            "max_anomaly": heatmap_data.max_anomaly,
            "units":       "°C anomaly",
        }

        set_cached(CACHE_KEY, result, ttl_seconds=300)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatmap latest failed: {str(e)}")


# Add this route below /latest

@router.get("/grid")
def get_heatmap_by_date(
    date: str = Query(..., description="Date YYYY-MM-DD"),
    stride: int = Query(4),
):
    """
    Same as /latest but for a specific date.
    Returns the same grid[][] format the canvas widget expects.
    """
    CACHE_KEY = f"heatmap_grid_{date}_{stride}"
    cached = get_cached(CACHE_KEY)
    if cached is not None:
        return cached

    try:
        # Reuse existing /sst logic with a specific date
        heatmap_data = get_sst_heatmap(date=date, stride=stride)

        lookup: dict = {}
        lats_set: set = set()
        lons_set: set = set()
        for p in heatmap_data.points:
            rlat = round(p.latitude, 1)
            rlon = round(p.longitude, 1)
            lookup[(rlat, rlon)] = p.sst_anomaly
            lats_set.add(rlat)
            lons_set.add(rlon)

        sorted_lats = sorted(lats_set)
        sorted_lons = sorted(lons_set)

        grid = []
        for lat in sorted_lats:
            row = []
            for lon in sorted_lons:
                val = lookup.get((lat, lon))
                row.append(round(val, 3) if val is not None else None)
            grid.append(row)

        result = {
            "grid":        grid,
            "date":        heatmap_data.date,
            "lat_values":  sorted_lats,
            "lon_values":  sorted_lons,
            "min_anomaly": heatmap_data.min_anomaly,
            "max_anomaly": heatmap_data.max_anomaly,
            "units":       "°C anomaly",
        }

        set_cached(CACHE_KEY, result, ttl_seconds=300)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatmap grid failed: {str(e)}")


# Also add this helper so the frontend knows valid date bounds
@router.get("/date-range")
def get_date_range():
    """Returns min and max available dates from the zarr store."""
    try:
        ds = xr.open_zarr(ZARR["sst"], consolidated=False)
        times = pd.to_datetime(ds["sst"].time.values)
        ds.close()
        return {
            "min_date": str(times[0])[:10],
            "max_date": str(times[-1])[:10],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))





# Add this route below /latest

@router.get("/grid")
def get_heatmap_by_date(
    date: str = Query(..., description="Date YYYY-MM-DD"),
    stride: int = Query(4),
):
    """
    Same as /latest but for a specific date.
    Returns the same grid[][] format the canvas widget expects.
    """
    CACHE_KEY = f"heatmap_grid_{date}_{stride}"
    cached = get_cached(CACHE_KEY)
    if cached is not None:
        return cached

    try:
        # Reuse existing /sst logic with a specific date
        heatmap_data = get_sst_heatmap(date=date, stride=stride)

        lookup: dict = {}
        lats_set: set = set()
        lons_set: set = set()
        for p in heatmap_data.points:
            rlat = round(p.latitude, 1)
            rlon = round(p.longitude, 1)
            lookup[(rlat, rlon)] = p.sst_anomaly
            lats_set.add(rlat)
            lons_set.add(rlon)

        sorted_lats = sorted(lats_set)
        sorted_lons = sorted(lons_set)

        grid = []
        for lat in sorted_lats:
            row = []
            for lon in sorted_lons:
                val = lookup.get((lat, lon))
                row.append(round(val, 3) if val is not None else None)
            grid.append(row)

        result = {
            "grid":        grid,
            "date":        heatmap_data.date,
            "lat_values":  sorted_lats,
            "lon_values":  sorted_lons,
            "min_anomaly": heatmap_data.min_anomaly,
            "max_anomaly": heatmap_data.max_anomaly,
            "units":       "°C anomaly",
        }

        set_cached(CACHE_KEY, result, ttl_seconds=300)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatmap grid failed: {str(e)}")


# Also add this helper so the frontend knows valid date bounds
@router.get("/date-range")
def get_date_range():
    """Returns min and max available dates from the zarr store."""
    try:
        ds = xr.open_zarr(ZARR["sst"], consolidated=False)
        times = pd.to_datetime(ds["sst"].time.values)
        ds.close()
        return {
            "min_date": str(times[0])[:10],
            "max_date": str(times[-1])[:10],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
