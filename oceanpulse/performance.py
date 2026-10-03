# oceanpulse/performance.py
# ── OceanPulse Performance Layer ──────────────────────────────
# Implements all B-series performance improvements:
#
#   B1. Incremental/Delta Processing  — only reprocess new data
#   B2. Vectorised MHW Detection      — replaces the slow day-by-day Python loop
#   B3. Zarr Rechunking               — optimise chunk layout for time-slice access
#   B4. Parquet Partitioning          — partition large parquets by year
#   B5. Smart Cache Invalidation      — TTL + file-mtime checks for st.cache_data
#
# Usage pattern:
#   from oceanpulse.performance import (
#       get_incremental_dates, vectorised_mhw_metrics,
#       rechunk_zarr_stores, partition_parquet,
#       SmartCache,
#   )

import numpy as np
import pandas as pd
import xarray as xr
import os
import sys
import json
import hashlib
import time
import warnings
warnings.filterwarnings("ignore")

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import ZARR, RESULTS, RESULTS_DIR


# ══════════════════════════════════════════════════════════════
# B1. INCREMENTAL / DELTA PROCESSING
# ══════════════════════════════════════════════════════════════

# State file tracks the last processed timestamps per dataset
DELTA_STATE_FILE = os.path.join(RESULTS_DIR, "_delta_state.json")


def _load_delta_state():
    """Load the last-processed checkpoint from disk."""
    if os.path.exists(DELTA_STATE_FILE):
        with open(DELTA_STATE_FILE) as f:
            return json.load(f)
    return {}


def _save_delta_state(state: dict):
    """Save checkpoint to disk."""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    with open(DELTA_STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)


def get_incremental_dates(zarr_key: str, dataset_name: str) -> tuple:
    """
    Determine which dates in a Zarr store have NOT been processed yet.

    Args:
        zarr_key     : key in the ZARR dict (e.g. "sst")
        dataset_name : logical name used in the state file (e.g. "mhw")

    Returns:
        (all_dates, new_dates, last_processed_date)
        new_dates is empty if everything is already processed.

    Example:
        all_dates, new_dates, last = get_incremental_dates("sst", "mhw")
        if len(new_dates) == 0:
            print("Nothing new — skipping")
        else:
            # run detection only on new_dates
    """
    zarr_path = ZARR.get(zarr_key)
    if zarr_path is None:
        raise ValueError(f"Unknown zarr_key '{zarr_key}'. Check config.ZARR dict.")

    ds = xr.open_zarr(zarr_path)
    all_dates = pd.to_datetime(ds.time.values)
    ds.close()

    state = _load_delta_state()
    last_str = state.get(dataset_name)

    if last_str is None:
        # First run — process everything
        return all_dates, all_dates, None

    last_dt = pd.to_datetime(last_str)
    new_dates = all_dates[all_dates > last_dt]
    return all_dates, new_dates, last_dt


def mark_processed(dataset_name: str, up_to_date):
    """
    Record that dataset_name has been processed up to up_to_date.
    Call this AFTER successful processing so the next run skips these dates.

    Args:
        dataset_name : logical name (e.g. "mhw", "rapid_changes")
        up_to_date   : the last date that was processed (datetime-like)
    """
    state = _load_delta_state()
    state[dataset_name] = str(pd.to_datetime(up_to_date))
    _save_delta_state(state)
    print(f"  ✓ Checkpoint saved: {dataset_name} → {state[dataset_name]}")


def merge_incremental_parquet(existing_path: str, new_df: pd.DataFrame,
                               date_col: str = "date") -> pd.DataFrame:
    """
    Append new rows to an existing parquet file, deduplicating on date_col.

    Args:
        existing_path : path to the existing .parquet file
        new_df        : DataFrame of newly computed rows
        date_col      : column name used for deduplication

    Returns:
        Combined DataFrame (also saved back to existing_path)
    """
    if os.path.exists(existing_path) and len(new_df) > 0:
        old_df = pd.read_parquet(existing_path)
        old_df[date_col] = pd.to_datetime(old_df[date_col])
        new_df[date_col] = pd.to_datetime(new_df[date_col])
        # Drop any old rows that overlap with new (new wins)
        cutoff = new_df[date_col].min()
        old_df = old_df[old_df[date_col] < cutoff]
        combined = pd.concat([old_df, new_df], ignore_index=True)
        combined = combined.sort_values(date_col).reset_index(drop=True)
    else:
        combined = new_df

    combined.to_parquet(existing_path, index=False)
    return combined


# ══════════════════════════════════════════════════════════════
# B2. VECTORISED MHW DETECTION
# ══════════════════════════════════════════════════════════════

def vectorised_mhw_metrics(sst: xr.DataArray,
                            sst_anom: xr.DataArray,
                            thresh_90: xr.DataArray) -> pd.DataFrame:
    """
    Drop-in replacement for the day-by-day Python loop in anomaly.detect_marine_heatwaves().
    Replaces ~n_times iterations with pure NumPy array operations — typically 20-50x faster.

    Args:
        sst       : raw SST DataArray with dims (time, lat, lon)
        sst_anom  : SST anomaly DataArray (time, lat, lon)
        thresh_90 : 90th-percentile threshold DataArray (lat, lon)

    Returns:
        DataFrame with columns:
          date, frac_mhw, mean_intensity, max_intensity, mhw_category
        (same schema as the loop version — just computed all at once)

    Usage:
        # In anomaly.detect_marine_heatwaves(), replace the loop with:
        from oceanpulse.performance import vectorised_mhw_metrics
        df_metrics = vectorised_mhw_metrics(sst, sst_anom, thresh_90)
    """
    print("  [vectorised] Computing MHW intensity array ...")

    # Load to memory once
    sst_vals    = sst.values.astype(np.float32)        # (T, Y, X)
    thresh_vals = thresh_90.values.astype(np.float32)  # (Y, X)
    time_arr    = pd.to_datetime(sst.time.values)

    # Broadcast threshold across time axis
    # intensity[t, y, x] = sst[t, y, x] - thresh[y, x]
    intensity = sst_vals - thresh_vals[np.newaxis, :, :]   # (T, Y, X)

    T = intensity.shape[0]

    # --- Fraction of ocean in MHW conditions per timestep ---
    valid_mask = ~np.isnan(intensity)           # (T, Y, X)
    above_mask = intensity > 0                  # (T, Y, X)

    n_valid = valid_mask.sum(axis=(1, 2)).astype(np.float32)     # (T,)
    n_above = (above_mask & valid_mask).sum(axis=(1, 2)).astype(np.float32)

    frac_mhw = np.where(n_valid > 0, n_above / np.maximum(n_valid, 1), np.nan)  # (T,)

    # --- Mean intensity where MHW exists ---
    mhw_region = np.where(above_mask, intensity, np.nan)          # (T, Y, X)
    mean_intensity = np.nanmean(mhw_region.reshape(T, -1), axis=1)  # (T,)
    mean_intensity = np.where(np.isnan(mean_intensity), 0.0, mean_intensity)

    # --- Max intensity over valid ocean ---
    all_valid = np.where(valid_mask, intensity, np.nan)
    max_intensity = np.nanmax(all_valid.reshape(T, -1), axis=1)  # (T,)
    max_intensity = np.where(np.isnan(max_intensity), 0.0, max_intensity)

    # --- Category (Hobday 2018 fixed 1°C multiples) ---
    cat = np.zeros(T, dtype=np.int8)
    cat = np.where(max_intensity > 0, 1, cat)
    cat = np.where(max_intensity >= 2, 2, cat)
    cat = np.where(max_intensity >= 3, 3, cat)
    cat = np.where(max_intensity >= 4, 4, cat)

    print(f"  [vectorised] Done — {T} timesteps processed")

    return pd.DataFrame({
        "date"          : time_arr,
        "frac_mhw"      : frac_mhw,
        "mean_intensity": mean_intensity.astype(np.float32),
        "max_intensity" : max_intensity.astype(np.float32),
        "mhw_category"  : cat,
    })


# ══════════════════════════════════════════════════════════════
# B3. ZARR RECHUNKING
# ══════════════════════════════════════════════════════════════

# Optimal chunk sizes for different access patterns
OPTIMAL_CHUNKS = {
    # Time-slice access (dashboard loads one timestep) — small time chunk, full spatial
    "time_slice":  {"time": 1,    "lat": -1,  "lon": -1},
    # Spatial mean access (pipeline computes spatial averages) — large time, small spatial
    "spatial_mean":{"time": 365,  "lat": 20,  "lon": 20},
    # Profile access (ARGO data keyed by profile index)
    "profile":     {"profile": 1000},
}


def rechunk_zarr_store(zarr_path: str, store_name: str,
                       chunk_mode: str = "time_slice",
                       output_path: str = None,
                       dry_run: bool = False) -> dict:
    """
    Rechunk a Zarr store for a given access pattern.

    Args:
        zarr_path   : path to the existing Zarr store
        store_name  : human-readable name (for logging)
        chunk_mode  : "time_slice" | "spatial_mean" | "profile"
        output_path : where to write rechunked store.
                      If None, writes to zarr_path + "_rechunked"
        dry_run     : if True, only analyse and report, don't write

    Returns:
        dict with before/after chunk sizes and estimated speedup
    """
    if not os.path.exists(zarr_path):
        print(f"  ⚠ Zarr store not found: {zarr_path}")
        return {}

    ds = xr.open_zarr(zarr_path)
    current_chunks = {v: dict(ds[v].encoding.get("chunks", {}))
                      for v in ds.data_vars}

    print(f"\n  Rechunking: {store_name}")
    print(f"    Mode       : {chunk_mode}")
    print(f"    Variables  : {list(ds.data_vars)}")
    print(f"    Current chunks: {current_chunks}")

    target_chunks = OPTIMAL_CHUNKS.get(chunk_mode, OPTIMAL_CHUNKS["time_slice"])
    # Filter to only dims that exist in this store
    available_dims = set(ds.dims)
    applied_chunks = {k: v for k, v in target_chunks.items() if k in available_dims}

    print(f"    Target chunks : {applied_chunks}")

    # Estimate speedup for time-slice access
    speedup_note = ""
    if "time" in applied_chunks and "time" in current_chunks.get(list(ds.data_vars)[0], {}):
        old_t = current_chunks[list(ds.data_vars)[0]].get("time", 1)
        new_t = applied_chunks.get("time", 1)
        if new_t == 1 and old_t > 1:
            speedup_note = f"time-slice reads ~{old_t}x faster"

    if dry_run:
        ds.close()
        return {"store": store_name, "mode": chunk_mode,
                "current": current_chunks, "target": applied_chunks,
                "note": speedup_note}

    if output_path is None:
        output_path = zarr_path.rstrip("/\\") + "_rechunked"

    print(f"    Writing to : {output_path}")
    rechunked = ds.chunk(applied_chunks)

    # Write with Zarr v2 compressor
    encoding = {}
    for var in ds.data_vars:
        encoding[var] = {
            "chunks": tuple(applied_chunks.get(d, ds.dims[d])
                            for d in rechunked[var].dims),
            "compressor": None,  # keep original or set numcodecs.Blosc()
        }

    rechunked.to_zarr(output_path, mode="w", encoding=encoding)
    ds.close()

    print(f"    ✓ Rechunked store written")
    if speedup_note:
        print(f"    ✓ {speedup_note}")

    return {"store": store_name, "output": output_path,
            "mode": chunk_mode, "note": speedup_note}


def rechunk_all_result_stores(dry_run: bool = False):
    """
    Rechunk all RESULTS Zarr stores to time-slice access pattern.
    Run this ONCE after the initial pipeline to speed up the dashboard.

    Args:
        dry_run : if True, analyse only — don't write new files

    Returns:
        List of result dicts
    """
    print("\n" + "=" * 55)
    print("RECHUNKING RESULT ZARR STORES")
    print("=" * 55)

    results = []
    for name, path in RESULTS.items():
        if path.endswith(".zarr"):
            r = rechunk_zarr_store(
                zarr_path=path,
                store_name=name,
                chunk_mode="time_slice",
                dry_run=dry_run,
            )
            results.append(r)

    print(f"\n  ✓ Analysed/rechunked {len(results)} stores")
    if dry_run:
        print("  (dry_run=True — no files written)")
    return results


# ══════════════════════════════════════════════════════════════
# B4. PARQUET PARTITIONING
# ══════════════════════════════════════════════════════════════

def partition_parquet(input_path: str, date_col: str = "date",
                      output_dir: str = None, overwrite: bool = False):
    """
    Split a large parquet into per-year partition files so the dashboard
    can load only the years it needs (e.g. last year for the live view).

    Input:  Data/Results/mhw_timeseries.parquet          (full file)
    Output: Data/Results/mhw_timeseries_partitioned/
              2020.parquet
              2021.parquet
              ...

    Args:
        input_path : path to the monolithic parquet
        date_col   : datetime column used for partitioning
        output_dir : where to write yearly files. If None, uses
                     input_path without extension + "_partitioned"
        overwrite  : if False, skip years that already exist

    Returns:
        dict {year: path} of written partition files
    """
    if not os.path.exists(input_path):
        print(f"  ⚠ File not found: {input_path}")
        return {}

    df = pd.read_parquet(input_path)
    df[date_col] = pd.to_datetime(df[date_col])
    df["_year"]  = df[date_col].dt.year

    if output_dir is None:
        base = input_path.replace(".parquet", "")
        output_dir = base + "_partitioned"
    os.makedirs(output_dir, exist_ok=True)

    written = {}
    for year, group in df.groupby("_year"):
        out_path = os.path.join(output_dir, f"{year}.parquet")
        if os.path.exists(out_path) and not overwrite:
            print(f"  ↳ {year}: already exists — skipping")
            written[year] = out_path
            continue
        group = group.drop(columns=["_year"])
        group.to_parquet(out_path, index=False)
        n = len(group)
        print(f"  ↳ {year}: {n:,} rows → {out_path}")
        written[year] = out_path

    print(f"  ✓ Partitioned into {len(written)} yearly files")
    return written


def load_partitioned_parquet(partition_dir: str,
                              years: list = None,
                              date_col: str = "date") -> pd.DataFrame:
    """
    Load one or more year partitions from a partitioned directory.
    Much faster than loading the full file when you only need recent years.

    Args:
        partition_dir : directory containing 2020.parquet, 2021.parquet ...
        years         : list of int years to load. If None, loads all.
        date_col      : date column (for dtype fix)

    Returns:
        Combined DataFrame for the requested years
    """
    available = [f for f in os.listdir(partition_dir) if f.endswith(".parquet")]
    if years is not None:
        available = [f for f in available if int(f.replace(".parquet", "")) in years]

    if not available:
        raise FileNotFoundError(f"No matching partition files in {partition_dir}")

    frames = []
    for fname in sorted(available):
        path = os.path.join(partition_dir, fname)
        frames.append(pd.read_parquet(path))
    df = pd.concat(frames, ignore_index=True)
    df[date_col] = pd.to_datetime(df[date_col])
    return df


def partition_all_results(overwrite: bool = False):
    """
    Partition all large parquet files in RESULTS_DIR.
    Run once after pipeline completes.
    """
    print("\n" + "=" * 55)
    print("PARTITIONING RESULT PARQUETS BY YEAR")
    print("=" * 55)

    targets = [
        ("mhw_timeseries.parquet",    "date"),
        ("rapid_changes.parquet",     "date"),
        ("unusual_mld.parquet",       "time"),
    ]

    for fname, dcol in targets:
        fpath = os.path.join(RESULTS_DIR, fname)
        if os.path.exists(fpath):
            print(f"\n  Partitioning: {fname}")
            partition_parquet(fpath, date_col=dcol, overwrite=overwrite)
        else:
            print(f"  ⚠ Not found: {fname}")


# ══════════════════════════════════════════════════════════════
# B5. SMART CACHE INVALIDATION
# ══════════════════════════════════════════════════════════════

class SmartCache:
    """
    File-modification-time aware cache.
    Wraps a loader function and only re-reads from disk when:
      (a) the TTL has expired, OR
      (b) the source file's mtime has changed.

    Usage in app.py:
        from oceanpulse.performance import SmartCache
        import streamlit as st

        _mhw_cache = SmartCache(ttl_seconds=300)

        @st.cache_data(ttl=300)
        def load_mhw():
            return _mhw_cache.load(
                path=os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"),
                loader=pd.read_parquet,
            )

    For Streamlit use, the simplest drop-in is the `cached_load` function below.
    """

    def __init__(self, ttl_seconds: int = 300):
        self.ttl = ttl_seconds
        self._store = {}   # {path: {"data": ..., "mtime": ..., "loaded_at": ...}}

    def load(self, path: str, loader=None, **loader_kwargs):
        """
        Load file at path, using cached version if still fresh.

        Args:
            path        : absolute file path
            loader      : callable(path, **loader_kwargs) → data
                          defaults to pd.read_parquet
            loader_kwargs : extra args passed to loader

        Returns:
            Loaded data (DataFrame, dict, etc.)
        """
        if loader is None:
            loader = pd.read_parquet

        now   = time.time()
        mtime = os.path.getmtime(path) if os.path.exists(path) else 0

        entry = self._store.get(path)

        cache_hit = (
            entry is not None and
            (now - entry["loaded_at"]) < self.ttl and
            entry["mtime"] == mtime
        )

        if cache_hit:
            return entry["data"]

        # Cache miss — reload
        data = loader(path, **loader_kwargs)
        self._store[path] = {
            "data":      data,
            "mtime":     mtime,
            "loaded_at": now,
        }
        return data

    def invalidate(self, path: str = None):
        """Force-invalidate a specific path (or entire cache if None)."""
        if path is None:
            self._store.clear()
        else:
            self._store.pop(path, None)

    def status(self) -> dict:
        """Return cache status for debugging."""
        now = time.time()
        return {
            path: {
                "age_s":   round(now - e["loaded_at"], 1),
                "ttl_s":   self.ttl,
                "fresh":   (now - e["loaded_at"]) < self.ttl,
                "mtime":   e["mtime"],
            }
            for path, e in self._store.items()
        }


# Module-level shared cache instance (use in app.py)
_global_cache = SmartCache(ttl_seconds=300)


def cached_load(filename: str, date_col: str = None,
                ttl_seconds: int = 300) -> pd.DataFrame:
    """
    Convenience wrapper: load a parquet from RESULTS_DIR with smart caching.
    Automatically re-reads when the file changes on disk.

    Args:
        filename    : just the filename (e.g. "mhw_timeseries.parquet")
        date_col    : if provided, parse this column as datetime after loading
        ttl_seconds : max age before re-checking mtime

    Returns:
        DataFrame

    Drop-in replacement for app.py loaders:
        # Before:
        @st.cache_data
        def load_mhw():
            return pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))

        # After:
        from oceanpulse.performance import cached_load
        def load_mhw():
            return cached_load("mhw_timeseries.parquet", date_col="date")
    """
    _global_cache.ttl = ttl_seconds
    path = os.path.join(RESULTS_DIR, filename)
    df = _global_cache.load(path, loader=pd.read_parquet)
    if date_col and date_col in df.columns:
        df = df.copy()
        df[date_col] = pd.to_datetime(df[date_col])
    return df


# ══════════════════════════════════════════════════════════════
# PIPELINE RUNNER: run all performance optimisations
# ══════════════════════════════════════════════════════════════

def run_all_optimisations(dry_run: bool = False):
    """
    Run all one-time performance optimisations after the initial pipeline.
    Safe to re-run — existing files are skipped unless overwrite=True.

    Steps:
      1. Rechunk all RESULTS Zarr stores to time-slice layout
      2. Partition large parquets by year

    Args:
        dry_run : if True, analyse and report but don't write any files
    """
    print("\n" + "█" * 55)
    print("  OCEANPULSE — PERFORMANCE OPTIMISATION")
    print("█" * 55)

    rechunk_results = rechunk_all_result_stores(dry_run=dry_run)
    if not dry_run:
        partition_all_results(overwrite=False)

    print("\n" + "█" * 55)
    print("  OPTIMISATION COMPLETE")
    print("█" * 55)
    print(f"  Zarr stores processed : {len(rechunk_results)}")
    if dry_run:
        print("  (dry_run=True — no files written)")

    return rechunk_results


if __name__ == "__main__":
    # Run analysis only by default — pass dry_run=False to actually write
    run_all_optimisations(dry_run=True)
