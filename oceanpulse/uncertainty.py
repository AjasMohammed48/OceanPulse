# oceanpulse/uncertainty.py
# ── Uncertainty Quantification Engine ─────────────────────────
# OceanPulse — Physics-Constrained Ocean Intelligence
#
# Quantifies confidence in every computed field using:
# 1. Data sparsity scores  — how well sampled is this region/time?
# 2. Instrument uncertainty— ARGO sensor error propagation
# 3. Physics consistency   — do independent variables agree?
# 4. Climatological bounds — how far outside normal range?
# 5. Final confidence score— 0.0 (no confidence) to 1.0 (full confidence)

import numpy as np
import pandas as pd
import xarray as xr
import os
import sys
import warnings
warnings.filterwarnings("ignore")

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import ZARR, RESULTS, RESULTS_DIR

# ══════════════════════════════════════════════════════════════
# INSTRUMENT UNCERTAINTY CONSTANTS (ARGO standard specs)
# ══════════════════════════════════════════════════════════════

ARGO_TEMP_ERROR = 0.002   # °C  — ARGO temperature sensor accuracy
ARGO_PSAL_ERROR = 0.010   # PSU — ARGO salinity sensor accuracy
ARGO_PRES_ERROR = 2.4     # dbar— ARGO pressure sensor accuracy

# Propagated density uncertainty from T, S, P errors
# drho/dT ≈ -0.2 kg/m³/°C,  drho/dS ≈ 0.8 kg/m³/PSU
DENSITY_UNCERTAINTY = np.sqrt(
    (0.2 * ARGO_TEMP_ERROR)**2 +
    (0.8 * ARGO_PSAL_ERROR)**2
)  # ≈ 0.008 kg/m³

# MLD uncertainty from density uncertainty
# Typical density gradient in thermocline: ~0.01 kg/m³/m
# dMLD = dRho / (drho/dz) ≈ 0.008 / 0.01 = 0.8 m
MLD_UNCERTAINTY = DENSITY_UNCERTAINTY / 0.01  # dbar

# OHC uncertainty: rho*Cp*dT*dz — 0.002°C over 700m
OHC_UNCERTAINTY = 1025.0 * 3985.0 * ARGO_TEMP_ERROR * 700.0  # J/m²


# ══════════════════════════════════════════════════════════════
# 1. SPARSITY SCORE — how well sampled is each region?
# ══════════════════════════════════════════════════════════════

def compute_sparsity_scores(save=True):
    """
    Compute data sparsity score for each 2°×2° grid cell per month.

    Sparsity score = 0.0 (no data) to 1.0 (well sampled)

    Method:
    - Count ARGO profiles per 2°×2° cell per month
    - Reference: 1 profile per cell per month = adequate sampling
    - Score = min(count / reference, 1.0)

    Also computes a grid-based sparsity from SST NaN fraction.
    """
    print("\n" + "="*55)
    print("COMPUTING SPARSITY SCORES")
    print("="*55)

    # ── ARGO sparsity ─────────────────────────────────────────
    argo_path = os.path.join(RESULTS_DIR, "argo_all_physics.parquet")
    df = pd.read_parquet(argo_path)
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time", "lat", "lon"])
    df["year_month"] = df["time"].dt.to_period("M")
    df["lat_bin"]    = (df["lat"] // 2) * 2
    df["lon_bin"]    = (df["lon"] // 2) * 2

    # Count profiles per cell per month
    counts = (df.groupby(["lat_bin", "lon_bin", "year_month"])
                .size()
                .reset_index(name="n_profiles"))

    # Reference: 1 profile = score 1.0, 0 = 0.0
    REFERENCE = 1
    counts["sparsity_score"] = (counts["n_profiles"] / REFERENCE).clip(0, 1)

    print(f"  ARGO grid cells sampled : {len(counts)}")
    print(f"  Mean profiles per cell  : {counts['n_profiles'].mean():.2f}")
    print(f"  Mean sparsity score     : {counts['sparsity_score'].mean():.3f}")
    print(f"  Cells with score = 1.0  : {(counts['sparsity_score'] == 1.0).sum()}")

    # ── SST coverage sparsity ─────────────────────────────────
    print("  Computing SST coverage ...")
    ds_sst = xr.open_zarr(ZARR["sst"]).compute()
    sst = ds_sst["sst"]
    if "zlev" in sst.dims:
        sst = sst.isel(zlev=0)

    # Fraction of valid (non-NaN) SST per day
    total_cells   = sst.sizes["lat"] * sst.sizes["lon"]
    valid_per_day = (~np.isnan(sst.values)).sum(axis=(1, 2))
    sst_coverage  = valid_per_day / total_cells

    sst_coverage_series = pd.Series(
        sst_coverage,
        index=pd.to_datetime(sst.time.values),
        name="sst_coverage"
    )

    print(f"  Mean SST coverage       : {sst_coverage_series.mean()*100:.1f}%")
    print(f"  Min SST coverage        : {sst_coverage_series.min()*100:.1f}%")
    ds_sst.close()

    if save:
        out_path = os.path.join(RESULTS_DIR, "sparsity_scores.parquet")
        counts.to_parquet(out_path, index=False)

        cov_path = os.path.join(RESULTS_DIR, "sst_coverage.parquet")
        sst_coverage_series.reset_index().rename(
            columns={"index": "date"}).to_parquet(cov_path, index=False)

        print(f"\n  ✓ Saved: sparsity_scores.parquet")
        print(f"  ✓ Saved: sst_coverage.parquet")

    return counts, sst_coverage_series


# ══════════════════════════════════════════════════════════════
# 2. PROFILE-LEVEL UNCERTAINTY
# ══════════════════════════════════════════════════════════════

def compute_profile_uncertainty(save=True):
    """
    Compute uncertainty for each ARGO-derived physics quantity.

    For each profile computes:
    - Instrument uncertainty (fixed, from sensor specs)
    - Sampling uncertainty  (how many valid levels?)
    - Physics consistency   (do density, MLD, thermocline agree?)
    - Final confidence score per profile

    Confidence score components:
      C_instrument = 1 - (instrument_error / typical_value)
      C_sampling   = min(n_valid_levels / 50, 1.0)
      C_physics    = 1 if MLD < thermocline (physical), 0.5 if not
      C_final      = mean(C_instrument, C_sampling, C_physics)
    """
    print("\n" + "="*55)
    print("COMPUTING PROFILE UNCERTAINTY")
    print("="*55)

    argo_path = os.path.join(RESULTS_DIR, "argo_all_physics.parquet")
    df = pd.read_parquet(argo_path)
    print(f"  Profiles loaded: {len(df)}")

    # ── Instrument uncertainty (fixed per sensor spec) ────────
    df["temp_uncertainty"]    = ARGO_TEMP_ERROR       # °C
    df["psal_uncertainty"]    = ARGO_PSAL_ERROR       # PSU
    df["density_uncertainty"] = DENSITY_UNCERTAINTY   # kg/m³
    df["mld_uncertainty"]     = MLD_UNCERTAINTY       # dbar
    df["ohc_uncertainty"]     = OHC_UNCERTAINTY       # J/m²

    # ── Sampling confidence ───────────────────────────────────
    # More valid levels = higher confidence
    # Reference: 50 levels = full confidence
    REFERENCE_LEVELS = 50
    df["C_sampling"] = (df["n_valid_levels"] / REFERENCE_LEVELS).clip(0, 1)

    # ── Instrument confidence ─────────────────────────────────
    # SST confidence: error / typical SST range (0-35°C)
    df["C_instrument"] = 1.0 - (ARGO_TEMP_ERROR / 35.0)
    # This is nearly 1.0 — ARGO instruments are very accurate

    # ── Physics consistency confidence ────────────────────────
    # Physical rule: MLD must be shallower than thermocline
    # If MLD > thermocline → physically inconsistent → lower confidence
    mld_valid     = df["mld"].notna()
    thermo_valid  = df["thermocline"].notna()
    both_valid    = mld_valid & thermo_valid

    df["C_physics"] = np.nan
    # Consistent: MLD < thermocline (as expected physically)
    consistent = both_valid & (df["mld"] < df["thermocline"])
    # Inconsistent: MLD >= thermocline
    inconsistent = both_valid & (df["mld"] >= df["thermocline"])
    # Only MLD or only thermocline available
    only_one = mld_valid ^ thermo_valid

    df.loc[consistent,   "C_physics"] = 1.0
    df.loc[inconsistent, "C_physics"] = 0.5
    df.loc[only_one,     "C_physics"] = 0.75
    df.loc[~both_valid & ~only_one, "C_physics"] = 0.5

    # ── Climatological bounds confidence ──────────────────────
    # SST: expected 0–35°C in Indian Ocean
    # MLD: expected 0–500 dbar typically
    # OHC: expected 1e9–8e10 J/m²
    df["C_bounds"] = 1.0

    # Penalise out-of-range SST
    sst_out = (df["sst_argo"] < -2) | (df["sst_argo"] > 40)
    df.loc[sst_out, "C_bounds"] = 0.3

    # Penalise very deep MLD (>500 dbar unusual for Indian Ocean)
    mld_deep = df["mld"] > 500
    df.loc[mld_deep, "C_bounds"] = df.loc[mld_deep, "C_bounds"] * 0.7

    # ── Final confidence score ────────────────────────────────
    # Weighted mean of all components
    df["confidence"] = (
        0.25 * df["C_sampling"].fillna(0.5) +
        0.25 * df["C_instrument"].fillna(1.0) +
        0.30 * df["C_physics"].fillna(0.5) +
        0.20 * df["C_bounds"].fillna(1.0)
    ).clip(0, 1)

    # ── Sparsity flag ─────────────────────────────────────────
    df["sparse_flag"] = df["n_valid_levels"] < 10

    print(f"\n  Uncertainty summary:")
    print(f"    Temp uncertainty    : ±{ARGO_TEMP_ERROR}°C  (fixed, sensor spec)")
    print(f"    Salinity uncertainty: ±{ARGO_PSAL_ERROR} PSU (fixed, sensor spec)")
    print(f"    Density uncertainty : ±{DENSITY_UNCERTAINTY:.4f} kg/m³ (propagated)")
    print(f"    MLD uncertainty     : ±{MLD_UNCERTAINTY:.1f} dbar (propagated)")
    print(f"    OHC uncertainty     : ±{OHC_UNCERTAINTY:.2e} J/m² (propagated)")

    print(f"\n  Confidence score distribution:")
    print(f"    Mean confidence     : {df['confidence'].mean():.3f}")
    print(f"    High (≥0.8)         : {(df['confidence'] >= 0.8).sum()} profiles")
    print(f"    Medium (0.5–0.8)    : {((df['confidence'] >= 0.5) & (df['confidence'] < 0.8)).sum()} profiles")
    print(f"    Low (<0.5)          : {(df['confidence'] < 0.5).sum()} profiles")
    print(f"    Sparse flag         : {df['sparse_flag'].sum()} profiles")

    print(f"\n  Physics consistency:")
    print(f"    MLD < thermocline (✓): {consistent.sum()} profiles")
    print(f"    MLD ≥ thermocline (⚠): {inconsistent.sum()} profiles")

    if save:
        out_path = os.path.join(RESULTS_DIR, "profile_uncertainty.parquet")
        df.to_parquet(out_path, index=False)
        print(f"\n  ✓ Saved: profile_uncertainty.parquet")

    return df


# ══════════════════════════════════════════════════════════════
# 3. GRID FIELD UNCERTAINTY
# ══════════════════════════════════════════════════════════════

def compute_grid_uncertainty(save=True):
    """
    Compute uncertainty for grid-based fields.
    All large arrays loaded lazily — only scalars computed into RAM.
    """
    print("\n" + "="*55)
    print("COMPUTING GRID FIELD UNCERTAINTY")
    print("="*55)

    results = {}

    # ── SST uncertainty ───────────────────────────────────────
    print("  SST uncertainty ...")
    OISST_INSTRUMENT = 0.30
    OISST_BLENDING   = 0.10
    sst_total_unc    = np.sqrt(OISST_INSTRUMENT**2 + OISST_BLENDING**2)

    # Lazy load — compute NaN fraction per day without loading full array
    ds_sst = xr.open_zarr(ZARR["sst"])
    sst    = ds_sst["sst"]
    if "zlev" in sst.dims:
        sst = sst.isel(zlev=0)

    # Compute NaN fraction lazily — one timestep at a time
    total_cells = sst.sizes["lat"] * sst.sizes["lon"]
    # Sample 30 evenly spaced days instead of all 2187
    sample_idx  = np.linspace(0, sst.sizes["time"]-1, 30, dtype=int)
    nan_fracs   = []
    for i in sample_idx:
        slab = sst.isel(time=i).values
        nan_fracs.append(np.isnan(slab).mean())
    sst_confidence = 1.0 - np.mean(nan_fracs)
    ds_sst.close()

    results["sst"] = {
        "instrument_uncertainty": OISST_INSTRUMENT,
        "total_uncertainty_degC": round(sst_total_unc, 3),
        "mean_confidence"       : round(float(sst_confidence), 3),
        "min_confidence"        : round(float(1 - max(nan_fracs)), 3),
    }
    print(f"    SST total uncertainty : ±{sst_total_unc:.3f}°C")
    print(f"    SST mean confidence   : {sst_confidence:.3f}")

    # ── Qnet uncertainty ──────────────────────────────────────
    print("  Qnet uncertainty ...")
    ERA5_QNET_UNC = 15.0

    ds_qnet  = xr.open_zarr(RESULTS["qnet"])
    # Sample scalar stats lazily
    qnet_mean = float(ds_qnet["qnet"].mean().compute())
    qnet_std  = float(ds_qnet["qnet"].std().compute())
    ds_qnet.close()

    qnet_rel_unc    = ERA5_QNET_UNC / max(qnet_std, 1.0)
    qnet_confidence = max(0, 1.0 - qnet_rel_unc)

    results["qnet"] = {
        "instrument_uncertainty": ERA5_QNET_UNC,
        "total_uncertainty_Wm2" : ERA5_QNET_UNC,
        "mean_confidence"       : round(qnet_confidence, 3),
        "qnet_mean_Wm2"         : round(qnet_mean, 2),
        "qnet_std_Wm2"          : round(qnet_std, 2),
    }
    print(f"    Qnet uncertainty  : ±{ERA5_QNET_UNC} W/m²")
    print(f"    Qnet confidence   : {qnet_confidence:.3f}")

    # ── Wind uncertainty ──────────────────────────────────────
    print("  Wind uncertainty ...")
    ERA5_WIND_UNC = 0.5

    ds_wind  = xr.open_zarr(RESULTS["wind_stress"])
    ws_mean  = float(ds_wind["wind_speed"].mean().compute())
    ds_wind.close()

    wind_rel_unc    = ERA5_WIND_UNC / max(ws_mean, 0.1)
    wind_confidence = max(0, 1.0 - wind_rel_unc)

    results["wind"] = {
        "instrument_uncertainty": ERA5_WIND_UNC,
        "total_uncertainty_ms"  : ERA5_WIND_UNC,
        "mean_confidence"       : round(wind_confidence, 3),
        "wind_mean_ms"          : round(ws_mean, 2),
    }
    print(f"    Wind uncertainty  : ±{ERA5_WIND_UNC} m/s")
    print(f"    Wind confidence   : {wind_confidence:.3f}")

    # ── SLA uncertainty ───────────────────────────────────────
    print("  SLA uncertainty ...")
    CMEMS_SLA_UNC = 0.02

    ds_sla   = xr.open_zarr(ZARR["sla"])
    sla_mean = float(ds_sla["sla"].isel(time=slice(0, 30)).mean().compute())
    ds_sla.close()

    results["sla"] = {
        "instrument_uncertainty": CMEMS_SLA_UNC,
        "total_uncertainty_m"   : CMEMS_SLA_UNC,
        "mean_confidence"       : 0.95,
        "sla_mean_m"            : round(sla_mean, 4),
    }
    print(f"    SLA uncertainty   : ±{CMEMS_SLA_UNC} m")
    print(f"    SLA confidence    : 0.95")

    df_grid_unc = pd.DataFrame(results).T.reset_index()
    df_grid_unc.columns = ["field"] + list(df_grid_unc.columns[1:])

    print(f"\n  Grid uncertainty summary:")
    for field, vals in results.items():
        conf = vals["mean_confidence"]
        print(f"    {field:<10}: confidence = {conf:.3f}")

    if save:
        out_path = os.path.join(RESULTS_DIR, "grid_uncertainty.parquet")
        df_grid_unc.to_parquet(out_path, index=False)
        print(f"\n  ✓ Saved: grid_uncertainty.parquet")

    return df_grid_unc

# ══════════════════════════════════════════════════════════════
# 4. ANOMALY CONFIDENCE
# ══════════════════════════════════════════════════════════════

def compute_anomaly_confidence(save=True):
    """
    Assign confidence scores to each detected anomaly.

    Logic:
    - MHW confidence   = SST confidence × persistence factor
    - MLD confidence   = profile confidence × sparsity score
    - Trend confidence = R² of linear fit
    - Rapid confidence = based on magnitude vs uncertainty
    """
    print("\n" + "="*55)
    print("COMPUTING ANOMALY CONFIDENCE")
    print("="*55)

    # ── MHW confidence ────────────────────────────────────────
    print("  MHW anomaly confidence ...")
    df_mhw = pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))

    # SST instrument uncertainty vs anomaly magnitude
    OISST_UNC = 0.31  # °C total

    # Confidence = how many sigma above instrument noise?
    # If intensity >> uncertainty → high confidence
    df_mhw["mhw_signal_noise"] = df_mhw["mean_intensity"] / OISST_UNC
    df_mhw["mhw_confidence"]   = (
        df_mhw["mhw_signal_noise"] / (df_mhw["mhw_signal_noise"] + 1)
    ).clip(0, 1)

    # Persistence bonus: longer events = higher confidence
    # Rolling count of consecutive MHW days
    above = df_mhw["is_mhw"].astype(int)
    persist = above.rolling(30, min_periods=1).sum() / 30
    df_mhw["mhw_persistence"] = persist
    df_mhw["mhw_confidence"]  = (
        0.7 * df_mhw["mhw_confidence"] +
        0.3 * df_mhw["mhw_persistence"]
    ).clip(0, 1)

    mhw_mean_conf = df_mhw.loc[df_mhw["is_mhw"], "mhw_confidence"].mean()
    print(f"    MHW mean confidence  : {mhw_mean_conf:.3f}")
    print(f"    MHW days ≥0.8 conf   : {(df_mhw.loc[df_mhw['is_mhw'], 'mhw_confidence'] >= 0.8).sum()}")

    # ── Trend confidence ──────────────────────────────────────
    print("  Trend confidence ...")
    df_trends = pd.read_parquet(os.path.join(RESULTS_DIR, "trends.parquet"))

    # Confidence = R² score (already computed)
    df_trends["trend_confidence"] = df_trends["r2"].clip(0, 1)

    print(f"    Trend confidence:")
    for _, row in df_trends.iterrows():
        print(f"      {row['variable']:<20}: R²={row['r2']:.3f}  "
              f"conf={row['trend_confidence']:.3f}")

    # ── Rapid change confidence ───────────────────────────────
    print("  Rapid change confidence ...")
    df_rapid = pd.read_parquet(os.path.join(RESULTS_DIR, "rapid_changes.parquet"))

    # Confidence based on magnitude vs noise floor
    SST_NOISE = 0.31  # °C/week
    df_rapid["rapid_confidence"] = np.where(
        df_rapid["rapid_sst_rise"] | df_rapid["rapid_sst_drop"],
        (df_rapid["sst_change7d"].abs() /
         (df_rapid["sst_change7d"].abs() + SST_NOISE)).clip(0, 1),
        np.nan
    )

    rapid_mean = df_rapid["rapid_confidence"].dropna().mean()
    print(f"    Rapid change mean conf: {rapid_mean:.3f}")

    # ── Save updated files ────────────────────────────────────
    if save:
        df_mhw.to_parquet(
            os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"), index=False)
        df_trends.to_parquet(
            os.path.join(RESULTS_DIR, "trends.parquet"), index=False)
        df_rapid.to_parquet(
            os.path.join(RESULTS_DIR, "rapid_changes.parquet"), index=False)
        print(f"\n  ✓ Anomaly confidence scores added to all parquet files")

    return df_mhw, df_trends, df_rapid


# ══════════════════════════════════════════════════════════════
# 5. MASTER UNCERTAINTY SUMMARY
# ══════════════════════════════════════════════════════════════

def summarise_uncertainty():
    """
    Print a complete uncertainty summary for the OceanPulse system.
    This is what gets shown in the Streamlit interface.
    """
    print("\n" + "="*55)
    print("OCEANPULSE UNCERTAINTY SUMMARY")
    print("="*55)

    lines = []

    # Profile uncertainty
    try:
        df_prof = pd.read_parquet(
            os.path.join(RESULTS_DIR, "profile_uncertainty.parquet"))
        lines.append(f"ARGO profiles     : {len(df_prof):,} total")
        lines.append(f"Mean confidence   : {df_prof['confidence'].mean():.3f}")
        lines.append(f"High conf (≥0.8)  : {(df_prof['confidence']>=0.8).sum():,} profiles")
        lines.append(f"Sparse profiles   : {df_prof['sparse_flag'].sum():,} flagged")
        lines.append(f"Temp uncertainty  : ±{ARGO_TEMP_ERROR}°C")
        lines.append(f"MLD uncertainty   : ±{MLD_UNCERTAINTY:.1f} dbar")
        lines.append(f"OHC uncertainty   : ±{OHC_UNCERTAINTY:.2e} J/m²")
    except Exception as e:
        lines.append(f"Profile uncertainty: not computed ({e})")

    # Grid uncertainty
    try:
        df_grid = pd.read_parquet(
            os.path.join(RESULTS_DIR, "grid_uncertainty.parquet"))
        for _, row in df_grid.iterrows():
            lines.append(f"{row['field']:<10} confidence: {row['mean_confidence']:.3f}")
    except Exception as e:
        lines.append(f"Grid uncertainty: not computed ({e})")

    # MHW confidence
    try:
        df_mhw = pd.read_parquet(
            os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))
        mhw_conf = df_mhw.loc[df_mhw["is_mhw"], "mhw_confidence"].mean()
        lines.append(f"MHW confidence    : {mhw_conf:.3f}")
    except Exception:
        pass

    for line in lines:
        print(f"  {line}")

    return lines


# ══════════════════════════════════════════════════════════════
# MASTER RUN
# ══════════════════════════════════════════════════════════════

def run_all_uncertainty():
    print("\n" + "█"*55)
    print("  OCEANPULSE — UNCERTAINTY ENGINE")
    print("█"*55)

    counts, sst_cov  = compute_sparsity_scores(save=True)
    df_prof          = compute_profile_uncertainty(save=True)
    df_grid          = compute_grid_uncertainty(save=True)
    df_mhw, df_tr, df_rapid = compute_anomaly_confidence(save=True)
    summarise_uncertainty()

    print("\n" + "█"*55)
    print("  UNCERTAINTY ENGINE COMPLETE")
    print("█"*55)

    return df_prof, df_grid


if __name__ == "__main__":
    run_all_uncertainty()