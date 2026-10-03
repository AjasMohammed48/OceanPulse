# oceanpulse/analysis.py
# ── OceanPulse Extended Analysis Layer ────────────────────────
# Implements all C-series new physics/analysis modules:
#
#   C1. MHW Event Segmentation        — event-level table with start/end/duration/heat
#   C2. Seasonal Climatology          — monthly baseline + anomalies relative to it
#   C3. Regional Basin Analysis       — metrics per Indian Ocean sub-basin
#   C4. MHW Probability Forecast      — conditional frequency score (next 30 days)
#   C5. Stratification Trend          — N² trend over time (climate change signal)
#
# Each function saves its output to RESULTS_DIR and returns a DataFrame/dict.

import numpy as np
import pandas as pd
import xarray as xr
import os
import sys
import warnings
warnings.filterwarnings("ignore")

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import ZARR, RESULTS, RESULTS_DIR, RHO_0, CP
from oceanpulse.anomaly import enso_phase, iod_phase, pdo_phase, load_indices


# ══════════════════════════════════════════════════════════════
# C1. MHW EVENT SEGMENTATION
# ══════════════════════════════════════════════════════════════

def segment_mhw_events(df_mhw: pd.DataFrame = None, save: bool = True) -> pd.DataFrame:
    """
    Convert the day-level MHW timeseries into an event-level table.
    Each row = one distinct MHW event.

    Output columns:
        event_id       : sequential integer ID
        start_date     : first day of the event
        end_date       : last day of the event
        duration_days  : end - start + 1
        peak_date      : day of maximum intensity
        peak_intensity : max SST above threshold on peak day (°C)
        mean_intensity : mean intensity over event duration
        peak_coverage  : maximum ocean fraction covered (%)
        accumulated_heat: sum of (mean_intensity × frac_mhw) over duration — proxy
                          for total heat anomaly in the event
        peak_category  : Hobday category on the peak day
        dominant_enso  : most common ENSO phase during the event
        dominant_iod   : most common IOD phase during the event
        mean_confidence: mean mhw_confidence score during the event

    Args:
        df_mhw : mhw_timeseries.parquet DataFrame. If None, loads from file.
        save   : save result to RESULTS_DIR/mhw_events.parquet

    Returns:
        DataFrame of MHW events
    """
    print("\n" + "=" * 55)
    print("SEGMENTING MHW EVENTS")
    print("=" * 55)

    if df_mhw is None:
        df_mhw = pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))

    df = df_mhw.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    # Build event segments using run-length encoding on is_mhw
    events = []
    in_event    = False
    event_start = None
    event_rows  = []

    for _, row in df.iterrows():
        if row["is_mhw"] and not in_event:
            in_event    = True
            event_start = row["date"]
            event_rows  = [row]
        elif row["is_mhw"] and in_event:
            event_rows.append(row)
        elif not row["is_mhw"] and in_event:
            # Event ended — summarise
            events.append(_summarise_event(event_rows))
            in_event   = False
            event_rows = []

    # Handle event that runs to end of data
    if in_event and event_rows:
        events.append(_summarise_event(event_rows))

    if not events:
        print("  No MHW events found.")
        return pd.DataFrame()

    df_events = pd.DataFrame(events)
    df_events.insert(0, "event_id", range(1, len(df_events) + 1))

    print(f"  Events detected       : {len(df_events)}")
    print(f"  Longest event         : {df_events['duration_days'].max()} days")
    print(f"  Most intense event    : {df_events['peak_intensity'].max():.2f}°C above threshold")
    print(f"  Mean event duration   : {df_events['duration_days'].mean():.1f} days")

    if save:
        out = os.path.join(RESULTS_DIR, "mhw_events.parquet")
        df_events.to_parquet(out, index=False)
        print(f"  ✓ Saved: mhw_events.parquet")

    return df_events


def _summarise_event(rows: list) -> dict:
    """Summarise a list of row-dicts (or Series) into one event record."""
    df_e = pd.DataFrame(rows)
    peak_idx = df_e["max_intensity"].idxmax()

    # Dominant climate phase (mode)
    def dominant(col):
        try:
            return df_e[col].mode().iloc[0]
        except Exception:
            return "unknown"

    accumulated_heat = float(
        (df_e["mean_intensity"] * df_e["frac_mhw"]).sum()
    )

    return {
        "start_date"      : df_e["date"].min(),
        "end_date"        : df_e["date"].max(),
        "duration_days"   : len(df_e),
        "peak_date"       : df_e.loc[peak_idx, "date"],
        "peak_intensity"  : float(df_e["max_intensity"].max()),
        "mean_intensity"  : float(df_e["mean_intensity"].mean()),
        "peak_coverage"   : float(df_e["frac_mhw"].max() * 100),
        "accumulated_heat": round(accumulated_heat, 4),
        "peak_category"   : int(df_e.loc[peak_idx, "mhw_category"]),
        "dominant_enso"   : dominant("enso_phase"),
        "dominant_iod"    : dominant("iod_phase"),
        "mean_confidence" : round(float(df_e.get("mhw_confidence",
                                                   pd.Series([0.5] * len(df_e))).mean()), 3),
    }


# ══════════════════════════════════════════════════════════════
# C2. SEASONAL CLIMATOLOGY MODULE
# ══════════════════════════════════════════════════════════════

def compute_seasonal_climatology(df_argo: pd.DataFrame = None,
                                  save: bool = True) -> dict:
    """
    Compute month-of-year climatology (mean ± std) for SST, MLD, OHC.
    Then compute anomaly of each profile relative to its monthly baseline.

    The key difference from the existing pipeline:
    - Existing: SST anomaly vs a global 90th percentile threshold (MHW detection)
    - This:     profile-level anomaly vs the monthly mean (e.g. January mean SST)
                → reveals seasonality and deviations from seasonal norms

    Outputs:
        climatology   : dict {variable: {month: {"mean": float, "std": float}}}
        df_with_anom  : df_argo with added columns:
                          sst_seasonal_anom, mld_seasonal_anom, ohc_seasonal_anom

    Saves:
        seasonal_climatology.parquet  — monthly means/stds
        argo_with_seasonal_anom.parquet — profiles with anomaly columns

    Returns:
        dict {"climatology": ..., "df": ...}
    """
    print("\n" + "=" * 55)
    print("COMPUTING SEASONAL CLIMATOLOGY")
    print("=" * 55)

    if df_argo is None:
        df_argo = pd.read_parquet(os.path.join(RESULTS_DIR, "profile_uncertainty.parquet"))

    df = df_argo.copy()
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time"])
    df["month"] = df["time"].dt.month

    variables = {
        "sst_argo": "sst_seasonal_anom",
        "mld":      "mld_seasonal_anom",
        "ohc_700m": "ohc_seasonal_anom",
    }

    climatology = {}
    clim_rows   = []

    for var, anom_col in variables.items():
        if var not in df.columns:
            continue

        print(f"  Computing climatology: {var}")
        monthly_clim = (df.groupby("month")[var]
                          .agg(["mean", "std", "count"])
                          .rename(columns={"mean": f"{var}_mean",
                                           "std":  f"{var}_std",
                                           "count": f"{var}_n"}))

        climatology[var] = monthly_clim.to_dict()

        # Add anomaly column
        df[anom_col] = df.apply(
            lambda row: (row[var] - monthly_clim.loc[row["month"], f"{var}_mean"])
                        if not pd.isna(row[var]) and row["month"] in monthly_clim.index
                        else np.nan,
            axis=1,
        )

        for month in range(1, 13):
            if month in monthly_clim.index:
                clim_rows.append({
                    "variable": var,
                    "month":    month,
                    "mean":     round(float(monthly_clim.loc[month, f"{var}_mean"]), 4),
                    "std":      round(float(monthly_clim.loc[month, f"{var}_std"]), 4),
                    "n":        int(monthly_clim.loc[month, f"{var}_n"]),
                })

        mean_anom = df[anom_col].mean()
        std_anom  = df[anom_col].std()
        print(f"    Mean seasonal anomaly : {mean_anom:.4f}")
        print(f"    Std seasonal anomaly  : {std_anom:.4f}")

    df_clim = pd.DataFrame(clim_rows)

    if save:
        p1 = os.path.join(RESULTS_DIR, "seasonal_climatology.parquet")
        p2 = os.path.join(RESULTS_DIR, "argo_with_seasonal_anom.parquet")
        df_clim.to_parquet(p1, index=False)
        df.to_parquet(p2, index=False)
        print(f"  ✓ Saved: seasonal_climatology.parquet")
        print(f"  ✓ Saved: argo_with_seasonal_anom.parquet")

    return {"climatology": climatology, "df": df, "clim_table": df_clim}


# ══════════════════════════════════════════════════════════════
# C3. REGIONAL BASIN ANALYSIS
# ══════════════════════════════════════════════════════════════

# Indian Ocean sub-basin definitions
BASINS = {
    "Arabian Sea":      {"lat": (5,  25),  "lon": (55,  80)},
    "Bay of Bengal":    {"lat": (5,  25),  "lon": (80, 100)},
    "Equatorial IO":    {"lat": (-5,  5),  "lon": (45, 100)},
    "Southern IO":      {"lat": (-40, -15),"lon": (40, 100)},
    "Western IO":       {"lat": (-15, 15), "lon": (40,  65)},
    "Eastern IO":       {"lat": (-15, 15), "lon": (95, 120)},
}


def compute_basin_metrics(df_argo: pd.DataFrame = None,
                           df_mhw_full: pd.DataFrame = None,
                           save: bool = True) -> pd.DataFrame:
    """
    Compute key metrics per Indian Ocean sub-basin.

    For each basin:
        - ARGO profile count
        - Mean SST, MLD, OHC, confidence
        - Seasonal SST range (max monthly mean - min monthly mean)
        - SST trend (simple linear slope °C/yr)

    Also computes basin-level MHW statistics from the SST anomaly
    Zarr store (spatial subset per basin).

    Args:
        df_argo    : profile_uncertainty parquet
        df_mhw_full: mhw_timeseries parquet (for basin-level coverage)
        save       : save to RESULTS_DIR/basin_metrics.parquet

    Returns:
        DataFrame with one row per basin
    """
    print("\n" + "=" * 55)
    print("COMPUTING REGIONAL BASIN METRICS")
    print("=" * 55)

    if df_argo is None:
        df_argo = pd.read_parquet(os.path.join(RESULTS_DIR, "profile_uncertainty.parquet"))

    df = df_argo.copy()
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df["month"] = df["time"].dt.month

    rows = []

    for basin_name, bounds in BASINS.items():
        lat_min, lat_max = bounds["lat"]
        lon_min, lon_max = bounds["lon"]

        mask = (
            (df["lat"] >= lat_min) & (df["lat"] <= lat_max) &
            (df["lon"] >= lon_min) & (df["lon"] <= lon_max)
        )
        sub = df[mask]
        n   = len(sub)
        print(f"  {basin_name:<20}: {n:,} profiles")

        if n == 0:
            rows.append({"basin": basin_name, "n_profiles": 0})
            continue

        # SST trend (linear)
        sst_monthly = (sub.dropna(subset=["sst_argo", "time"])
                          .set_index("time")["sst_argo"]
                          .resample("ME").mean()
                          .dropna())
        sst_trend = np.nan
        if len(sst_monthly) >= 4:
            x = np.arange(len(sst_monthly), dtype=float)
            coeffs = np.polyfit(x, sst_monthly.values, 1)
            sst_trend = round(float(coeffs[0]) * 12, 4)  # per year

        # Seasonal range
        monthly_means = sub.groupby("month")["sst_argo"].mean().dropna()
        sst_seasonal_range = round(float(monthly_means.max() - monthly_means.min()), 3) \
                             if len(monthly_means) >= 6 else np.nan

        # Basin-level MHW coverage from SST anomaly Zarr
        basin_mhw_days = np.nan
        basin_peak_intensity = np.nan
        try:
            ds_anom = xr.open_zarr(RESULTS["sst_anomaly"])
            sst_basin = ds_anom["sst_anomaly"].sel(
                lat=slice(lat_min, lat_max),
                lon=slice(lon_min, lon_max),
            )
            thresh_basin = sst_basin.quantile(0.90, dim="time").drop_vars("quantile",
                                                                           errors="ignore")
            intensity_basin = sst_basin - thresh_basin
            # Fraction of basin above threshold per day
            valid = ~np.isnan(intensity_basin)
            above = intensity_basin > 0
            n_valid_b = valid.sum(dim=["lat", "lon"]).values.astype(float)
            n_above_b = (above & valid).sum(dim=["lat", "lon"]).values.astype(float)
            frac_b    = np.where(n_valid_b > 0, n_above_b / np.maximum(n_valid_b, 1), np.nan)
            # 5-day persistence filter
            frac_s = pd.Series(frac_b)
            is_mhw_b = (frac_s > 0.05).astype(int).rolling(5, min_periods=5).sum() == 5
            basin_mhw_days = int(is_mhw_b.sum())
            max_i_b = float(intensity_basin.values.reshape(len(intensity_basin.time), -1)
                                           .max(axis=1, initial=np.nan))
            basin_peak_intensity = round(float(np.nanmax(max_i_b)), 3)
            ds_anom.close()
        except Exception as e:
            print(f"    ⚠ Basin MHW computation skipped: {e}")

        rows.append({
            "basin"               : basin_name,
            "lat_min"             : lat_min,
            "lat_max"             : lat_max,
            "lon_min"             : lon_min,
            "lon_max"             : lon_max,
            "n_profiles"          : n,
            "mean_sst"            : round(float(sub["sst_argo"].mean()), 3)
                                    if sub["sst_argo"].notna().any() else np.nan,
            "mean_mld"            : round(float(sub["mld"].mean()), 2)
                                    if sub["mld"].notna().any() else np.nan,
            "mean_ohc_700m"       : float(f"{sub['ohc_700m'].mean():.3e}")
                                    if sub["ohc_700m"].notna().any() else np.nan,
            "mean_confidence"     : round(float(sub["confidence"].mean()), 3)
                                    if sub["confidence"].notna().any() else np.nan,
            "sst_trend_per_yr"    : sst_trend,
            "sst_seasonal_range"  : sst_seasonal_range,
            "mhw_days"            : basin_mhw_days,
            "peak_mhw_intensity"  : basin_peak_intensity,
        })

    df_basins = pd.DataFrame(rows)

    # Rank basins by warming rate
    df_basins_ranked = df_basins.sort_values("sst_trend_per_yr",
                                              ascending=False,
                                              na_position="last")

    print(f"\n  Basin ranking by SST trend:")
    for _, r in df_basins_ranked.iterrows():
        trend_str = f"{r['sst_trend_per_yr']:+.4f}°C/yr" \
                    if not pd.isna(r.get("sst_trend_per_yr", np.nan)) else "N/A"
        print(f"    {r['basin']:<20}: {trend_str}")

    if save:
        out = os.path.join(RESULTS_DIR, "basin_metrics.parquet")
        df_basins.to_parquet(out, index=False)
        print(f"  ✓ Saved: basin_metrics.parquet")

    return df_basins


# ══════════════════════════════════════════════════════════════
# C4. MHW PROBABILITY FORECAST INDICATOR
# ══════════════════════════════════════════════════════════════

def compute_mhw_forecast_indicator(df_mhw: pd.DataFrame = None,
                                    save: bool = True) -> dict:
    """
    Compute a physics-based MHW probability score for the NEXT 30 DAYS
    using conditional historical frequencies.

    Method:
        1. Get current ENSO phase, IOD phase, PDO phase, and recent SST trend
        2. Look up historical MHW frequency when those same conditions existed
        3. Weight by:
               - 50% base rate given climate phase combination
               - 30% recent SST trend direction (warming → higher prob)
               - 20% recent rapid change events (onset flag)
        4. Output a probability score 0-1 with a verbal risk level

    This is NOT a predictive ML model — it is a conditional frequency
    estimator based on observed data. Cite as such.

    Args:
        df_mhw : mhw_timeseries.parquet. If None, loads from file.
        save   : save result to RESULTS_DIR/mhw_forecast.json

    Returns:
        dict with keys:
            probability      : float 0-1
            risk_level       : "Low" | "Moderate" | "Elevated" | "High"
            current_phase    : {enso, iod, pdo}
            phase_frequency  : historical MHW fraction in this phase combo
            trend_factor     : contribution from SST trend
            onset_factor     : contribution from rapid changes
            n_historical_days: how many days with this phase combination
            interpretation   : plain-text explanation
    """
    print("\n" + "=" * 55)
    print("COMPUTING MHW FORECAST INDICATOR")
    print("=" * 55)

    if df_mhw is None:
        df_mhw = pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))

    df = df_mhw.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")

    # ── Current climate phase ─────────────────────────────────
    latest = df.iloc[-1]
    current_enso = str(latest.get("enso_phase", "unknown"))
    current_iod  = str(latest.get("iod_phase",  "unknown"))
    current_pdo  = str(latest.get("pdo_phase",  "unknown"))

    print(f"  Current state: ENSO={current_enso} | IOD={current_iod} | PDO={current_pdo}")

    # ── Phase combination historical frequency ────────────────
    phase_mask = (
        (df["enso_phase"] == current_enso) &
        (df["iod_phase"]  == current_iod)
    )
    phase_days = df[phase_mask]
    n_hist = len(phase_days)

    if n_hist > 0:
        phase_freq = float(phase_days["is_mhw"].mean())
    else:
        # Fall back to ENSO-only
        enso_mask   = df["enso_phase"] == current_enso
        phase_days  = df[enso_mask]
        n_hist      = len(phase_days)
        phase_freq  = float(phase_days["is_mhw"].mean()) if n_hist > 0 else 0.3

    print(f"  Phase combination: {n_hist} historical days, "
          f"MHW freq = {phase_freq:.3f}")

    # ── Recent SST trend factor (last 30 days) ────────────────
    recent_30 = df.tail(30)
    sst_change_30 = float(recent_30["mean_intensity"].diff().mean())
    # Normalise: +0.1°C/day change → max trend boost of 0.2
    trend_factor = float(np.clip(sst_change_30 / 0.05, -0.2, 0.2))
    print(f"  30-day SST trend  : {sst_change_30:+.4f}°C/day → factor={trend_factor:+.3f}")

    # ── Rapid onset factor ────────────────────────────────────
    onset_factor = 0.0
    try:
        df_rapid = pd.read_parquet(os.path.join(RESULTS_DIR, "rapid_changes.parquet"))
        df_rapid["date"] = pd.to_datetime(df_rapid["date"])
        recent_rapid = df_rapid.tail(14)
        n_rises = int(recent_rapid["rapid_sst_rise"].sum())
        # Each rapid rise in last 14 days adds 0.05, capped at 0.15
        onset_factor = float(min(n_rises * 0.05, 0.15))
        print(f"  Rapid SST rises (14d): {n_rises} → onset factor={onset_factor:.3f}")
    except Exception:
        pass

    # ── Composite probability ─────────────────────────────────
    probability = float(np.clip(
        0.50 * phase_freq +
        0.30 * (0.5 + trend_factor) +    # centre trend around 0.5
        0.20 * (0.5 + onset_factor),     # centre onset around 0.5
        0.0, 1.0,
    ))

    # ── Risk level ────────────────────────────────────────────
    if probability >= 0.70:
        risk_level = "High"
    elif probability >= 0.50:
        risk_level = "Elevated"
    elif probability >= 0.30:
        risk_level = "Moderate"
    else:
        risk_level = "Low"

    # ── Interpretation ────────────────────────────────────────
    interpretation = (
        f"Based on {n_hist} historical days with {current_enso} + {current_iod} conditions, "
        f"the Indian Ocean was in MHW state {phase_freq*100:.0f}% of the time. "
        f"The 30-day SST trend is {'warming' if trend_factor > 0 else 'cooling'} "
        f"({'+' if sst_change_30 >= 0 else ''}{sst_change_30:.4f}°C/day), "
        f"and there {'were' if onset_factor > 0 else 'were no'} recent rapid onset events. "
        f"Combined probability score: {probability:.2f} → {risk_level} risk."
    )

    result = {
        "probability"       : round(probability, 3),
        "risk_level"        : risk_level,
        "current_phase"     : {"enso": current_enso,
                                "iod":  current_iod,
                                "pdo":  current_pdo},
        "phase_frequency"   : round(phase_freq, 3),
        "trend_factor"      : round(trend_factor, 4),
        "onset_factor"      : round(onset_factor, 4),
        "n_historical_days" : n_hist,
        "as_of_date"        : str(latest["date"])[:10],
        "interpretation"    : interpretation,
    }

    print(f"\n  ── Forecast Result ──")
    print(f"  Probability  : {probability:.3f}")
    print(f"  Risk level   : {risk_level}")
    print(f"  {interpretation}")

    if save:
        import json
        out = os.path.join(RESULTS_DIR, "mhw_forecast.json")
        with open(out, "w") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"  ✓ Saved: mhw_forecast.json")

    return result


# ══════════════════════════════════════════════════════════════
# C5. STRATIFICATION TREND
# ══════════════════════════════════════════════════════════════

def compute_stratification_trend(df_argo: pd.DataFrame = None,
                                  save: bool = True) -> pd.DataFrame:
    """
    Track N² (Brunt-Väisälä frequency) over time as a stratification metric.
    A rising N² trend means the ocean is becoming MORE stratified — a key
    climate change signal that reduces vertical mixing and nutrient supply.

    Also computes the stratification index trend.

    Method:
        1. Monthly-mean N² and stratification index from ARGO profiles
        2. Linear trend fit (same as detect_trends)
        3. Cross-reference with ENSO/PDO (both modulate stratification)

    Output columns in saved parquet:
        time, mean_N2, std_N2, mean_strat, n_profiles,
        enso, dmi, pdo, enso_phase, iod_phase

    And in returned dict:
        df_monthly   : monthly timeseries
        n2_trend     : slope of N² per year
        strat_trend  : slope of stratification index per year
        r2           : R² of the fit
        interpretation: text summary

    Args:
        df_argo : profile_uncertainty parquet (must contain mean_N2, strat_index)
        save    : save to RESULTS_DIR/stratification_trend.parquet

    Returns:
        dict {"df_monthly": df, "n2_trend": ..., "strat_trend": ...,
              "r2": ..., "interpretation": ...}
    """
    print("\n" + "=" * 55)
    print("COMPUTING STRATIFICATION TREND (N²)")
    print("=" * 55)

    if df_argo is None:
        df_argo = pd.read_parquet(os.path.join(RESULTS_DIR, "profile_uncertainty.parquet"))

    df = df_argo.copy()
    df["time"] = pd.to_datetime(df["time"], errors="coerce")

    # Check for N² column
    has_n2    = "mean_N2" in df.columns
    has_strat = "strat_index" in df.columns

    if not has_n2 and not has_strat:
        print("  ⚠ Neither mean_N2 nor strat_index found in ARGO parquet.")
        print("    These are computed in physics.py — re-run the physics pipeline.")
        return {}

    # ── Monthly aggregation ────────────────────────────────────
    agg_cols = {"lat": "mean", "lon": "mean"}
    if has_n2:
        agg_cols["mean_N2"]     = ["mean", "std", "count"]
    if has_strat:
        agg_cols["strat_index"] = ["mean", "std"]

    df_clean = df.dropna(subset=["time"])
    df_clean = df_clean.set_index("time")

    monthly_agg = df_clean.resample("ME").agg(
        {k: v for k, v in [
            ("mean_N2",    ["mean", "std"]) if has_n2    else ("lat", "mean"),
            ("strat_index",["mean", "std"]) if has_strat else ("lon", "mean"),
            ("lat",        "count"),
        ]}
    )
    # Flatten multi-level columns
    monthly_agg.columns = ["_".join(c).strip("_") for c in monthly_agg.columns]
    monthly_agg = monthly_agg.reset_index().rename(columns={"lat_count": "n_profiles"})

    # Rename for clarity
    if has_n2:
        monthly_agg = monthly_agg.rename(columns={
            "mean_N2_mean": "mean_N2",
            "mean_N2_std":  "std_N2",
        })
    if has_strat:
        monthly_agg = monthly_agg.rename(columns={
            "strat_index_mean": "mean_strat",
            "strat_index_std":  "std_strat",
        })

    # ── Add climate index context ──────────────────────────────
    try:
        idx = load_indices()
        idx.index = pd.DatetimeIndex(idx.index).to_period("M").to_timestamp()
        monthly_agg["time"] = pd.to_datetime(monthly_agg["time"]).dt.to_period("M").dt.to_timestamp()
        monthly_agg = monthly_agg.merge(
            idx.reset_index().rename(columns={"index": "time"}),
            on="time", how="left"
        )
        monthly_agg["enso_phase"] = monthly_agg["enso"].apply(
            lambda x: enso_phase(x) if not pd.isna(x) else "unknown")
        monthly_agg["iod_phase"] = monthly_agg["dmi"].apply(
            lambda x: iod_phase(x) if not pd.isna(x) else "unknown")
        monthly_agg["pdo_phase"] = monthly_agg["pdo"].apply(
            lambda x: pdo_phase(x) if not pd.isna(x) else "unknown")
    except Exception as e:
        print(f"  ⚠ Climate index merge failed: {e}")

    # ── Linear trend fits ──────────────────────────────────────
    results = {}

    for col, label in [("mean_N2", "N²"), ("mean_strat", "Stratification Index")]:
        if col not in monthly_agg.columns:
            continue

        series = monthly_agg[col].dropna()
        if len(series) < 4:
            continue

        x = np.arange(len(series), dtype=float)
        coeffs   = np.polyfit(x, series.values, 1)
        fitted   = np.polyval(coeffs, x)
        ss_res   = np.sum((series.values - fitted) ** 2)
        ss_tot   = np.sum((series.values - series.mean()) ** 2)
        r2       = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
        slope_yr = float(coeffs[0]) * 12  # per year

        direction = "increasing" if slope_yr > 0 else "decreasing"
        physical_meaning = (
            "The ocean is becoming MORE stratified (less vertical mixing, "
            "consistent with surface warming)."
            if slope_yr > 0 else
            "The ocean is becoming LESS stratified (more vertical mixing, "
            "possible deepening of the mixed layer)."
        )

        results[col] = {
            "slope_per_year": round(slope_yr, 6),
            "r2":             round(r2, 3),
            "direction":      direction,
            "n_months":       len(series),
            "mean":           round(float(series.mean()), 6),
            "interpretation": physical_meaning,
        }

        print(f"  {label} trend: {slope_yr:+.6f}/yr  R²={r2:.3f}  → {direction}")
        print(f"    {physical_meaning}")

    # ── Seasonal stratification (monthly mean N²) ──────────────
    if "mean_N2" in monthly_agg.columns and "time" in monthly_agg.columns:
        monthly_agg["month"] = pd.to_datetime(monthly_agg["time"]).dt.month
        seasonal = monthly_agg.groupby("month")["mean_N2"].mean()
        peak_month = int(seasonal.idxmax()) if len(seasonal) > 0 else None
        print(f"  Peak stratification month : {peak_month} "
              f"(N² max in {'DJF' if peak_month in [12,1,2] else 'other season'})")

    if save:
        out = os.path.join(RESULTS_DIR, "stratification_trend.parquet")
        monthly_agg.to_parquet(out, index=False)
        print(f"  ✓ Saved: stratification_trend.parquet")

    return {
        "df_monthly"  : monthly_agg,
        "trends"      : results,
        "n2_trend"    : results.get("mean_N2", {}).get("slope_per_year"),
        "strat_trend" : results.get("mean_strat", {}).get("slope_per_year"),
        "r2"          : results.get("mean_N2", {}).get("r2"),
    }


# ══════════════════════════════════════════════════════════════
# MASTER RUN
# ══════════════════════════════════════════════════════════════

def run_all_analysis():
    """
    Run all C-series analysis modules in order.
    Call this AFTER anomaly.run_all_anomaly_detection() and
    uncertainty.run_all_uncertainty() have completed.
    """
    print("\n" + "█" * 55)
    print("  OCEANPULSE — EXTENDED ANALYSIS")
    print("█" * 55)

    # C1: MHW event segmentation
    df_events = segment_mhw_events(save=True)

    # C2: Seasonal climatology
    clim_result = compute_seasonal_climatology(save=True)

    # C3: Basin metrics
    df_basins = compute_basin_metrics(save=True)

    # C4: Forecast indicator
    forecast = compute_mhw_forecast_indicator(save=True)

    # C5: Stratification trend
    strat = compute_stratification_trend(save=True)

    print("\n" + "█" * 55)
    print("  EXTENDED ANALYSIS COMPLETE")
    print("█" * 55)
    print(f"  MHW events identified    : {len(df_events)}")
    print(f"  Basins analysed          : {len(df_basins)}")
    print(f"  MHW probability (30d)    : {forecast.get('probability', '?')} "
          f"→ {forecast.get('risk_level', '?')}")
    if strat.get("n2_trend") is not None:
        direction = "increasing" if strat["n2_trend"] > 0 else "decreasing"
        print(f"  Stratification trend     : {strat['n2_trend']:+.6f}/yr ({direction})")

    return {
        "events":   df_events,
        "clim":     clim_result,
        "basins":   df_basins,
        "forecast": forecast,
        "strat":    strat,
    }


if __name__ == "__main__":
    run_all_analysis()
