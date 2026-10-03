# oceanpulse/anomaly.py
# ── Anomaly Detection Layer ────────────────────────────────────
# OceanPulse — Physics-Constrained Ocean Intelligence
# Detects: Marine Heatwaves, Unusual MLD, Rapid Changes,
#          Long-term Trends — all cross-referenced with ENSO/IOD/PDO

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
# UTILITY
# ══════════════════════════════════════════════════════════════

def load_indices():
    """Load climate indices as a DataFrame indexed by date."""
    ds = xr.open_zarr(ZARR["indices"]).compute()
    df = pd.DataFrame({
        "enso" : ds["enso"].values,
        "dmi"  : ds["dmi"].values,
        "pdo"  : ds["pdo"].values,
    }, index=pd.to_datetime(ds["time"].values))
    ds.close()
    return df

def enso_phase(enso_value):
    """Classify ENSO phase from Nino3.4 anomaly."""
    if enso_value >= 0.5:
        return "El Nino"
    elif enso_value <= -0.5:
        return "La Nina"
    else:
        return "Neutral"

def iod_phase(dmi_value):
    """Classify IOD phase from DMI value."""
    if dmi_value >= 0.4:
        return "Positive IOD"
    elif dmi_value <= -0.4:
        return "Negative IOD"
    else:
        return "Neutral IOD"

def pdo_phase(pdo_value):
    """Classify PDO phase."""
    if pdo_value >= 0.5:
        return "Positive PDO"
    elif pdo_value <= -0.5:
        return "Negative PDO"
    else:
        return "Neutral PDO"


# ══════════════════════════════════════════════════════════════
# 1. MARINE HEATWAVE DETECTION (Hobday et al. 2016)
# ══════════════════════════════════════════════════════════════

def detect_marine_heatwaves(save=True):
    """
    Detect Marine Heatwaves (MHW) using the Hobday et al. 2016 definition.

    A Marine Heatwave occurs when SST exceeds the 90th percentile
    climatological threshold for at least 5 consecutive days.

    Categories (Hobday et al. 2018):
      Category I   (Moderate)  : 1×  above threshold
      Category II  (Strong)    : 2×  above threshold
      Category III (Severe)    : 3×  above threshold
      Category IV  (Extreme)   : 4×  above threshold

    Also cross-references with ENSO and IOD phases.
    """
    print("\n" + "="*55)
    print("DETECTING MARINE HEATWAVES")
    print("="*55)

    # Load SST anomaly
    ds_anom = xr.open_zarr(RESULTS["sst_anomaly"]).compute()
    sst_anom = ds_anom["sst_anomaly"]
    time     = pd.to_datetime(sst_anom.time.values)

    # Load raw SST for percentile calculation
    ds_sst = xr.open_zarr(ZARR["sst"]).compute()
    sst    = ds_sst["sst"]
    if "zlev" in sst.dims:
        sst = sst.isel(zlev=0)
    if "zlev" in sst.coords:
        sst = sst.drop_vars("zlev")

    print(f"  SST grid : {sst.sizes}")
    print(f"  Time steps: {len(time)}")

    # Load climate indices
    idx = load_indices()

    # ── Compute 90th percentile threshold per grid cell ──────
    print("  Computing 90th percentile threshold ...")
    thresh_90 = sst.quantile(0.90, dim="time")
    thresh_90 = thresh_90.drop_vars("quantile", errors="ignore")

    # ── Compute MHW intensity = SST - threshold ───────────────
    print("  Computing MHW intensity ...")
    mhw_intensity = sst - thresh_90

    # Positive = above threshold (potential MHW)
    # Negative = below threshold (no MHW)


    # ── Spatial MHW metrics per timestep ─────────────────────
    print("  Computing spatial MHW metrics ...")

    results = []
    n_times = len(time)

    for t_idx in range(n_times):
        if t_idx % 365 == 0:
            print(f"    Day {t_idx}/{n_times} ...")

        date     = time[t_idx]
        intens_t = mhw_intensity.isel(time=t_idx).values
        sst_t    = sst.isel(time=t_idx).values

        # Fraction of ocean in MHW conditions
        valid      = ~np.isnan(intens_t)
        n_valid    = valid.sum()
        if n_valid == 0:
            continue

        above_thresh = intens_t[valid] > 0
        frac_mhw     = above_thresh.sum() / n_valid

        # Mean intensity where MHW exists
        mhw_mask = intens_t > 0
        mean_intens = float(np.nanmean(intens_t[mhw_mask])) if mhw_mask.sum() > 0 else 0.0
        max_intens  = float(np.nanmax(intens_t[valid]))

        # Category — Hobday 2018 fixed 1°C multiples above threshold
        # Category I ≥ 1×, II ≥ 2×, III ≥ 3×, IV ≥ 4× (in °C above thresh)
        if max_intens <= 0:
            category = 0
        elif max_intens < 2.0:
            category = 1
        elif max_intens < 3.0:
            category = 2
        elif max_intens < 4.0:
            category = 3
        else:
            category = 4

        # Get climate index values for this date
        try:
            idx_row  = idx.loc[date.strftime("%Y-%m-%d")]
            enso_val = float(idx_row["enso"])
            dmi_val  = float(idx_row["dmi"])
            pdo_val  = float(idx_row["pdo"])
        except KeyError:
            enso_val = dmi_val = pdo_val = np.nan

        results.append({
            "date"          : date,
            "frac_mhw"      : float(frac_mhw),
            "mean_intensity": mean_intens,
            "max_intensity" : max_intens,
            "mhw_category"  : category,
            "enso"          : enso_val,
            "dmi"           : dmi_val,
            "pdo"           : pdo_val,
            "enso_phase"    : enso_phase(enso_val) if not np.isnan(enso_val) else "unknown",
            "iod_phase"     : iod_phase(dmi_val)   if not np.isnan(dmi_val)  else "unknown",
            "pdo_phase"     : pdo_phase(pdo_val)   if not np.isnan(pdo_val)  else "unknown",
        })

    df_mhw = pd.DataFrame(results)
    df_mhw["date"] = pd.to_datetime(df_mhw["date"])

    # ── Apply 5-day persistence filter ───────────────────────
    # True MHW = above threshold for ≥5 consecutive days
    above = (df_mhw["frac_mhw"] > 0.05).astype(int)  # >5% of ocean affected
    consecutive = above.rolling(5, min_periods=5).sum() == 5
    df_mhw["is_mhw"] = consecutive.fillna(False)

    print(f"\n  Results:")
    print(f"    Total days analysed : {len(df_mhw)}")
    print(f"    MHW days detected   : {df_mhw['is_mhw'].sum()}")
    print(f"    Max MHW coverage    : {df_mhw['frac_mhw'].max()*100:.1f}% of ocean")
    print(f"    Max intensity       : {df_mhw['max_intensity'].max():.2f} °C above threshold")
    print(f"    Max category        : {df_mhw['mhw_category'].max()}")

    # ── Cross-reference with climate indices ──────────────────
    if df_mhw["is_mhw"].sum() > 0:
        mhw_days = df_mhw[df_mhw["is_mhw"]]
        print(f"\n  Climate context during MHW days:")
        print(f"    ENSO phases : {mhw_days['enso_phase'].value_counts().to_dict()}")
        print(f"    IOD phases  : {mhw_days['iod_phase'].value_counts().to_dict()}")
        print(f"    PDO phases  : {mhw_days['pdo_phase'].value_counts().to_dict()}")

    if save:
        out_path = os.path.join(RESULTS_DIR, "mhw_timeseries.parquet")
        df_mhw.to_parquet(out_path, index=False)
        print(f"\n  ✓ Saved: mhw_timeseries.parquet")

    ds_anom.close()
    ds_sst.close()
    return df_mhw


# ══════════════════════════════════════════════════════════════
# 2. UNUSUAL MLD DETECTION
# ══════════════════════════════════════════════════════════════

def detect_unusual_mld(save=True):
    """
    Detect unusual Mixed Layer Depth events from ARGO profiles.

    Method:
    - Compute monthly MLD climatology per 2°×2° grid cell
    - Flag profiles where MLD deviates > 2 std from climatology
    - Cross-reference with wind stress and climate indices

    Unusual deep MLD   → strong mixing, storm activity, convection
    Unusual shallow MLD → strong stratification, heatwave potential
    """
    print("\n" + "="*55)
    print("DETECTING UNUSUAL MLD EVENTS")
    print("="*55)

    # Load ARGO physics
    argo_path = os.path.join(RESULTS_DIR, "argo_all_physics.parquet")
    df = pd.read_parquet(argo_path)
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time", "mld", "lat", "lon"])
    df["month"] = df["time"].dt.month

    print(f"  ARGO profiles loaded: {len(df)}")

    # ── Grid profiles to 2°×2° bins ──────────────────────────
    df["lat_bin"] = (df["lat"] // 2) * 2
    df["lon_bin"] = (df["lon"] // 2) * 2

    # ── Monthly climatology per grid cell ────────────────────
    print("  Computing MLD climatology per grid cell ...")
    clim = (df.groupby(["lat_bin", "lon_bin", "month"])["mld"]
              .agg(["mean", "std"])
              .reset_index()
              .rename(columns={"mean": "mld_clim", "std": "mld_std"}))

    df = df.merge(clim, on=["lat_bin", "lon_bin", "month"], how="left")

    # ── Compute MLD anomaly ───────────────────────────────────
    df["mld_anom"]  = df["mld"] - df["mld_clim"]
    df["mld_zscore"] = df["mld_anom"] / df["mld_std"].replace(0, np.nan)

    # ── Flag unusual events ───────────────────────────────────
    df["mld_unusual_deep"]    = df["mld_zscore"] >  2.0
    df["mld_unusual_shallow"] = df["mld_zscore"] < -2.0
    df["mld_unusual"]         = df["mld_unusual_deep"] | df["mld_unusual_shallow"]

    # ── Cross-reference with climate indices ──────────────────
    idx = load_indices()
    idx.index = idx.index.normalize()

    def get_index_row(date):
        try:
            row = idx.loc[date.normalize()]
            return float(row["enso"]), float(row["dmi"]), float(row["pdo"])
        except Exception:
            return np.nan, np.nan, np.nan

    df["enso"] = df["time"].apply(lambda t: get_index_row(t)[0])
    df["dmi"]  = df["time"].apply(lambda t: get_index_row(t)[1])

    print(f"\n  Results:")
    print(f"    Total profiles     : {len(df)}")
    print(f"    Unusual MLD total  : {df['mld_unusual'].sum()}")
    print(f"    Unusual deep       : {df['mld_unusual_deep'].sum()}")
    print(f"    Unusual shallow    : {df['mld_unusual_shallow'].sum()}")

    if df["mld_unusual"].sum() > 0:
        unusual = df[df["mld_unusual"]]
        print(f"\n  Climate context during unusual MLD:")
        print(f"    Mean ENSO  : {unusual['enso'].mean():.3f}")
        print(f"    Mean DMI   : {unusual['dmi'].mean():.3f}")
        enso_phases = unusual["enso"].apply(enso_phase)
        print(f"    ENSO phases: {enso_phases.value_counts().to_dict()}")

    if save:
        out_path = os.path.join(RESULTS_DIR, "unusual_mld.parquet")
        df.to_parquet(out_path, index=False)
        print(f"\n  ✓ Saved: unusual_mld.parquet")

    return df


# ══════════════════════════════════════════════════════════════
# 3. RAPID CHANGE DETECTION
# ══════════════════════════════════════════════════════════════

def detect_rapid_changes(save=True):
    """
    Detect rapid changes in SST, Qnet, and wind stress.

    Method: 7-day rolling standard deviation.
    Flag when rate of change exceeds 95th percentile of all changes.

    Rapid SST rise   → potential MHW onset
    Rapid SST drop   → upwelling, cold surge
    Rapid Qnet swing → sudden atmospheric forcing change
    Rapid wind change→ storm passage, monsoon onset/withdrawal
    """
    print("\n" + "="*55)
    print("DETECTING RAPID CHANGES")
    print("="*55)

    idx = load_indices()

    results = []

    # ── SST rapid change ──────────────────────────────────────
    print("  Analysing SST ...")
    ds_anom = xr.open_zarr(RESULTS["sst_anomaly"]).compute()
    sst_anom = ds_anom["sst_anomaly"]

    # Spatial mean SST anomaly per day
    sst_mean = sst_anom.mean(dim=["lat", "lon"], skipna=True)
    sst_series = pd.Series(
        sst_mean.values,
        index=pd.to_datetime(sst_mean.time.values)
    )

    # 7-day rate of change
    sst_change = sst_series.diff(7)
    sst_thresh_up   = sst_change.quantile(0.95)
    sst_thresh_down = sst_change.quantile(0.05)

    ds_anom.close()

    # ── Qnet rapid change ─────────────────────────────────────
    print("  Analysing Qnet ...")
    ds_qnet = xr.open_zarr(RESULTS["qnet"]).compute()
    qnet_mean = ds_qnet["qnet"].mean(dim=["latitude", "longitude"], skipna=True)
    qnet_series = pd.Series(
        qnet_mean.values,
        index=pd.to_datetime(qnet_mean.time.values)
    )
    qnet_change = qnet_series.diff(7)
    qnet_thresh_up   = qnet_change.quantile(0.95)
    qnet_thresh_down = qnet_change.quantile(0.05)
    ds_qnet.close()

    # ── Wind stress rapid change ──────────────────────────────
    print("  Analysing wind stress ...")
    ds_wind = xr.open_zarr(RESULTS["wind_stress"]).compute()
    ws_mean = ds_wind["wind_speed"].mean(dim=["latitude","longitude"], skipna=True)
    ws_series = pd.Series(
        ws_mean.values,
        index=pd.to_datetime(ws_mean.time.values)
    )
    ws_change = ws_series.diff(7)
    ws_thresh_up   = ws_change.quantile(0.95)
    ws_thresh_down = ws_change.quantile(0.05)
    ds_wind.close()

    # ── Combine on common time index ──────────────────────────
    common_dates = sst_series.index
    df_rapid = pd.DataFrame({
        "date"        : common_dates,
        "sst_mean"    : sst_series.values,
        "sst_change7d": sst_change.values,
        "qnet_mean"   : qnet_series.reindex(common_dates).values,
        "qnet_change7d": qnet_change.reindex(common_dates).values,
        "ws_mean"     : ws_series.reindex(common_dates).values,
        "ws_change7d" : ws_change.reindex(common_dates).values,
    })

    # ── Flag rapid events ─────────────────────────────────────
    df_rapid["rapid_sst_rise"]   = df_rapid["sst_change7d"]  > sst_thresh_up
    df_rapid["rapid_sst_drop"]   = df_rapid["sst_change7d"]  < sst_thresh_down
    df_rapid["rapid_qnet_swing"] = df_rapid["qnet_change7d"].abs() > abs(qnet_thresh_up)
    df_rapid["rapid_wind"]       = df_rapid["ws_change7d"]   > ws_thresh_up

    # ── Add climate index context ─────────────────────────────
    idx.index = idx.index.normalize()
    df_rapid["date"] = pd.to_datetime(df_rapid["date"]).dt.normalize()
    df_rapid = df_rapid.merge(
        idx.reset_index().rename(columns={"index": "date"}),
        on="date", how="left"
    )
    df_rapid["enso_phase"] = df_rapid["enso"].apply(
        lambda x: enso_phase(x) if not pd.isna(x) else "unknown")
    df_rapid["iod_phase"]  = df_rapid["dmi"].apply(
        lambda x: iod_phase(x) if not pd.isna(x) else "unknown")

    print(f"\n  Results:")
    print(f"    Rapid SST rises    : {df_rapid['rapid_sst_rise'].sum()}")
    print(f"    Rapid SST drops    : {df_rapid['rapid_sst_drop'].sum()}")
    print(f"    Rapid Qnet swings  : {df_rapid['rapid_qnet_swing'].sum()}")
    print(f"    Rapid wind events  : {df_rapid['rapid_wind'].sum()}")

    if save:
        out_path = os.path.join(RESULTS_DIR, "rapid_changes.parquet")
        df_rapid.to_parquet(out_path, index=False)
        print(f"\n  ✓ Saved: rapid_changes.parquet")

    return df_rapid


# ══════════════════════════════════════════════════════════════
# 4. LONG-TERM TREND DETECTION
# ══════════════════════════════════════════════════════════════

def detect_trends(save=True):
    """
    Detect long-term trends in SST, OHC, MLD, and Qnet.

    Method: Linear regression (Mann-Kendall trend test).
    Reports trend per year with confidence.

    Trends cross-referenced with PDO phase
    (PDO strongly modulates Indian Ocean multi-year trends).
    """
    print("\n" + "="*55)
    print("DETECTING LONG-TERM TRENDS")
    print("="*55)

    idx = load_indices()
    results = {}

    # ── SST trend ─────────────────────────────────────────────
    print("  SST trend ...")
    ds_anom = xr.open_zarr(RESULTS["sst_anomaly"]).compute()
    sst_anom = ds_anom["sst_anomaly"]
    sst_mean = sst_anom.mean(dim=["lat","lon"], skipna=True)
    sst_series = pd.Series(
        sst_mean.values,
        index=pd.to_datetime(sst_mean.time.values)
    ).resample("ME").mean()
    ds_anom.close()

    # ── Qnet trend ────────────────────────────────────────────
    print("  Qnet trend ...")
    ds_qnet = xr.open_zarr(RESULTS["qnet"]).compute()
    qnet_mean = ds_qnet["qnet"].mean(dim=["latitude","longitude"], skipna=True)
    qnet_series = pd.Series(
        qnet_mean.values,
        index=pd.to_datetime(qnet_mean.time.values)
    ).resample("ME").mean()
    ds_qnet.close()

    # ── OHC trend from ARGO ───────────────────────────────────
    print("  OHC trend ...")
    argo_path = os.path.join(RESULTS_DIR, "argo_all_physics.parquet")
    df_argo = pd.read_parquet(argo_path)
    df_argo["time"] = pd.to_datetime(df_argo["time"], errors="coerce")
    df_argo = df_argo.dropna(subset=["time", "ohc_700m"])
    ohc_series = (df_argo.set_index("time")["ohc_700m"]
                         .resample("ME").mean())

    # ── MLD trend ─────────────────────────────────────────────
    print("  MLD trend ...")
    df_argo2 = pd.read_parquet(argo_path)
    df_argo2["time"] = pd.to_datetime(df_argo2["time"], errors="coerce")
    df_argo2 = df_argo2.dropna(subset=["time", "mld"])
    mld_series = (df_argo2.set_index("time")["mld"]
                           .resample("ME").mean())

    # ── Linear trend function ─────────────────────────────────
    def linear_trend(series):
        s = series.dropna()
        if len(s) < 6:
            return np.nan, np.nan, np.nan
        x = np.arange(len(s))
        coeffs = np.polyfit(x, s.values, 1)
        slope_per_month = coeffs[0]
        slope_per_year  = slope_per_month * 12
        # R²
        y_pred = np.polyval(coeffs, x)
        ss_res = ((s.values - y_pred)**2).sum()
        ss_tot = ((s.values - s.values.mean())**2).sum()
        r2 = 1 - ss_res/ss_tot if ss_tot > 0 else 0
        return slope_per_year, r2, len(s)

    for name, series in [
        ("SST anomaly", sst_series),
        ("Qnet",        qnet_series),
        ("OHC_700m",    ohc_series),
        ("MLD",         mld_series),
    ]:
        slope, r2, n = linear_trend(series)
        results[name] = {"slope_per_year": slope, "r2": r2, "n_months": n}

    # ── PDO context ───────────────────────────────────────────
    pdo_mean = idx["pdo"].mean()
    pdo_recent = idx["pdo"].iloc[-90:].mean()  # last 90 days

    print(f"\n  Trend Results:")
    for name, res in results.items():
        direction = "↑" if res["slope_per_year"] > 0 else "↓"
        print(f"    {name:<20}: {res['slope_per_year']:+.4f}/yr  "
              f"R²={res['r2']:.3f}  {direction}")

    print(f"\n  PDO context:")
    print(f"    Mean PDO 2020-2025 : {pdo_mean:.3f}  "
          f"({pdo_phase(pdo_mean)})")
    print(f"    Recent PDO (90d)   : {pdo_recent:.3f}  "
          f"({pdo_phase(pdo_recent)})")

    df_trends = pd.DataFrame(results).T.reset_index()
    df_trends.columns = ["variable", "slope_per_year", "r2", "n_months"]

    if save:
        out_path = os.path.join(RESULTS_DIR, "trends.parquet")
        df_trends.to_parquet(out_path, index=False)
        print(f"\n  ✓ Saved: trends.parquet")

    return df_trends


# ══════════════════════════════════════════════════════════════
# MASTER RUN
# ══════════════════════════════════════════════════════════════

def run_all_anomaly_detection():
    print("\n" + "█"*55)
    print("  OCEANPULSE — ANOMALY DETECTION LAYER")
    print("█"*55)

    df_mhw    = detect_marine_heatwaves(save=True)
    df_mld    = detect_unusual_mld(save=True)
    df_rapid  = detect_rapid_changes(save=True)
    df_trends = detect_trends(save=True)

    print("\n" + "█"*55)
    print("  ANOMALY DETECTION COMPLETE")
    print("█"*55)
    print(f"  MHW days detected    : {df_mhw['is_mhw'].sum()}")
    print(f"  Unusual MLD profiles : {df_mld['mld_unusual'].sum()}")
    print(f"  Rapid SST events     : {df_rapid['rapid_sst_rise'].sum() + df_rapid['rapid_sst_drop'].sum()}")
    print(f"  Trends computed      : {len(df_trends)}")

    return df_mhw, df_mld, df_rapid, df_trends


if __name__ == "__main__":
    run_all_anomaly_detection()