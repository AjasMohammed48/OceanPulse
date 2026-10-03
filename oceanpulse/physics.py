# oceanpulse/physics.py
# ── Complete Physics Computation Layer ────────────────────────
# OceanPulse — Physics-Constrained Ocean Intelligence
# All computations deterministic — no ML, no approximation

import numpy as np
import xarray as xr
import pandas as pd
import os
import sys
import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import ZARR, RESULTS, RHO_0, CP, CD, MLD_DELTA

# ══════════════════════════════════════════════════════════════
# UTILITY — Conservation sanity checks
# ══════════════════════════════════════════════════════════════

def check_conservation(name, values, expected_min, expected_max, units):
    arr = np.asarray(values, dtype=np.float64).ravel()
    v_min  = float(np.nanmin(arr)) if not np.all(np.isnan(arr)) else np.nan
    v_max  = float(np.nanmax(arr)) if not np.all(np.isnan(arr)) else np.nan
    n_nan  = int(np.sum(np.isnan(arr)))
    n_tot  = len(arr)
    pct    = 100 * n_nan / n_tot if n_tot > 0 else 0

    in_range = (not np.isnan(v_min) and
                v_min >= expected_min and
                v_max <= expected_max)
    status = "✓" if in_range else "⚠ OUT OF RANGE"

    print(f"  [{status}] {name}")
    print(f"    Range    : {v_min:.4f} → {v_max:.4f} {units}")
    print(f"    Expected : {expected_min} → {expected_max} {units}")
    print(f"    NaN      : {n_nan}/{n_tot} ({pct:.1f}%)")
    return in_range


# ══════════════════════════════════════════════════════════════
# 1. WIND SPEED AND WIND STRESS
# ══════════════════════════════════════════════════════════════

def compute_wind(save=True):
    """
    Wind speed  : ws = sqrt(u10² + v10²)
    Wind stress : tau = rho_air * CD * ws * component
    """
    print("\n" + "="*55)
    print("COMPUTING WIND SPEED + WIND STRESS")
    print("="*55)

    ds  = xr.open_zarr(ZARR["wind"])
    u10 = ds["u10"]
    v10 = ds["v10"]

    ws    = np.sqrt(u10**2 + v10**2)
    rho_air = 1.225
    tau_x = rho_air * CD * ws * u10
    tau_y = rho_air * CD * ws * v10
    tau_mag = np.sqrt(tau_x**2 + tau_y**2)

    ws.attrs      = {"units": "m s**-1",  "long_name": "10m wind speed",
                     "equation": "ws = sqrt(u10² + v10²)"}
    tau_x.attrs   = {"units": "N m**-2",  "long_name": "Eastward wind stress"}
    tau_y.attrs   = {"units": "N m**-2",  "long_name": "Northward wind stress"}
    tau_mag.attrs = {"units": "N m**-2",  "long_name": "Wind stress magnitude",
                     "equation": "tau = rho_air * CD * ws²"}

    ds_out = xr.Dataset({"wind_speed": ws, "tau_x": tau_x,
                          "tau_y": tau_y, "tau_mag": tau_mag})

    print("\n  Conservation checks:")
    check_conservation("Wind speed",    ws.values,      0,  80,  "m/s")
    check_conservation("Wind stress X", tau_x.values, -10,  10,  "N/m²")
    check_conservation("Wind stress Y", tau_y.values, -10,  10,  "N/m²")

    if save:
        ds_out.chunk({"time": 365, "latitude": 50, "longitude": 50}).to_zarr(
            RESULTS["wind_stress"], mode="w")
        print(f"\n  ✓ wind_stress.zarr saved")

    ds.close()
    return ds_out


# ══════════════════════════════════════════════════════════════
# 2. EKMAN TRANSPORT
# ══════════════════════════════════════════════════════════════

def compute_ekman(save=True):
    """
    Ekman transport perpendicular to wind, due to Coriolis.

    Mx =  tau_y / (rho0 * f)
    My = -tau_x / (rho0 * f)
    f  = 2 * Omega * sin(lat)
    """
    print("\n" + "="*55)
    print("COMPUTING EKMAN TRANSPORT")
    print("="*55)

    ds_wind = xr.open_zarr(RESULTS["wind_stress"])
    tau_x   = ds_wind["tau_x"]
    tau_y   = ds_wind["tau_y"]
    lat     = ds_wind["latitude"]

    Omega  = 7.2921e-5
    f      = 2 * Omega * np.sin(np.deg2rad(lat))
    f_safe = xr.where(np.abs(f) < 1e-6, np.nan, f)

    Mx =  tau_y / (RHO_0 * f_safe)
    My = -tau_x / (RHO_0 * f_safe)

    Mx.attrs = {"units": "m**2 s**-1", "long_name": "Eastward Ekman transport",
                "equation": "Mx = tau_y / (rho0 * f)"}
    My.attrs = {"units": "m**2 s**-1", "long_name": "Northward Ekman transport"}

    ds_out = xr.Dataset({"ekman_x": Mx, "ekman_y": My})

    print("\n  Conservation checks:")
    check_conservation("Ekman X", Mx.values, -500, 500, "m²/s")
    check_conservation("Ekman Y", My.values, -500, 500, "m²/s")

    if save:
        ds_out.chunk({"time": 365, "latitude": 50, "longitude": 50}).to_zarr(
            RESULTS["ekman"], mode="w")
        print(f"\n  ✓ ekman.zarr saved")

    ds_wind.close()
    return ds_out


# ══════════════════════════════════════════════════════════════
# 3. NET SURFACE HEAT FLUX (Qnet) — fixed sign convention
# ══════════════════════════════════════════════════════════════

def compute_qnet(save=True):
    """
    Qnet = ssr + str + slhf + sshf

    ERA5 sign convention (already in W/m² after our conversion):
      ssr  > 0  solar radiation INTO ocean       (positive = warming)
      str  < 0  thermal radiation OUT of ocean   (negative = cooling)
      slhf < 0  latent heat flux OUT of ocean    (negative = cooling)
      sshf < 0  sensible heat flux OUT of ocean  (negative = cooling)

    Positive Qnet = net ocean warming
    Negative Qnet = net ocean cooling

    Physical range: roughly -600 to +400 W/m² in Indian Ocean
    Values beyond -600 indicate ERA5 accumulated value issues
    — we clamp extreme outliers after computing.
    """
    print("\n" + "="*55)
    print("COMPUTING NET SURFACE HEAT FLUX (Qnet)")
    print("="*55)

    ds   = xr.open_zarr(ZARR["heat_flux"])

    # Print component ranges for diagnostics
    for v in ["ssr", "str", "slhf", "sshf"]:
        arr = ds[v].values
        print(f"  {v}: {float(np.nanmin(arr)):.1f} → {float(np.nanmax(arr)):.1f} W/m²")

    qnet = ds["ssr"] + ds["str"] + ds["slhf"] + ds["sshf"]

    # Clamp physically unrealistic extremes
    # (ERA5 occasionally has artifacts at night/coastal boundaries)
    qnet = qnet.clip(-800, 600)

    qnet.attrs = {"units": "W m**-2",
                  "long_name": "Net surface heat flux",
                  "equation": "Qnet = ssr + str + slhf + sshf",
                  "sign_convention": "positive = ocean gaining heat"}

    qnet_clim = qnet.groupby("time.dayofyear").mean(dim="time")
    qnet_anom = qnet.groupby("time.dayofyear") - qnet_clim

    ds_out = xr.Dataset({
        "qnet"      : qnet,
        "qnet_clim" : qnet_clim,
        "qnet_anom" : qnet_anom,
    })

    print("\n  Conservation checks:")
    check_conservation("Qnet", qnet.values, -800, 600, "W/m²")

    if save:
        ds_out.chunk({"time": 365, "latitude": 50, "longitude": 50}).to_zarr(
            RESULTS["qnet"], mode="w")
        print(f"\n  ✓ qnet.zarr saved")

    ds.close()
    return ds_out


# ══════════════════════════════════════════════════════════════
# 4. SST ANOMALY
# ══════════════════════════════════════════════════════════════

def compute_sst_anomaly(save=True):
    """
    SST anomaly vs daily climatology.
    Climatology = mean SST per calendar day over 2020-2025.
    Anomaly     = SST - climatology
    """
    print("\n" + "="*55)
    print("COMPUTING SST ANOMALY")
    print("="*55)

    ds  = xr.open_zarr(ZARR["sst"])
    sst = ds["sst"]

    if "zlev" in sst.dims:
        sst = sst.isel(zlev=0)
    if "zlev" in sst.coords:
        sst = sst.drop_vars("zlev")

    print("  Building climatology ...")
    clim = sst.groupby("time.dayofyear").mean(dim="time")

    print("  Computing anomaly ...")
    sst_anom = sst.groupby("time.dayofyear") - clim

    sst_anom.attrs = {"units": "degC",
                      "long_name": "SST anomaly vs daily climatology",
                      "equation": "SSTa = SST - SST_clim(dayofyear)"}

    ds_out = xr.Dataset({
        "sst_anomaly" : sst_anom,
        "sst_clim"    : clim,
    })

    print("\n  Conservation checks:")
    check_conservation("SST",         sst.values,      -2,  40, "°C")
    check_conservation("SST anomaly", sst_anom.values, -15,  15, "°C")

    if save:
        ds_out.to_zarr(RESULTS["sst_anomaly"], mode="w")
        print(f"\n  ✓ sst_anomaly.zarr saved")

    ds.close()
    return ds_out


# ══════════════════════════════════════════════════════════════
# 5. SEAWATER DENSITY — UNESCO 1983
# ══════════════════════════════════════════════════════════════

def seawater_density(temp, psal, pres):
    """
    Seawater density using UNESCO 1983 polynomial equation of state.
    Returns density in kg/m³.
    """
    T = np.asarray(temp, dtype=np.float64)
    S = np.asarray(psal, dtype=np.float64)
    P = np.asarray(pres, dtype=np.float64) / 10.0  # dbar → bar

    # Mask invalid salinity (negative values cause power issues)
    S = np.where(S < 0, np.nan, S)

    rho_w = (999.842594
             + 6.793952e-2  * T
             - 9.095290e-3  * T**2
             + 1.001685e-4  * T**3
             - 1.120083e-6  * T**4
             + 6.536332e-9  * T**5)

    A = (8.24493e-1
         - 4.0899e-3   * T
         + 7.6438e-5   * T**2
         - 8.2467e-7   * T**3
         + 5.3875e-9   * T**4)

    B = (-5.72466e-3
         + 1.0227e-4   * T
         - 1.6546e-6   * T**2)

    C = 4.8314e-4

    S_safe = np.where(S >= 0, S, 0.0)
    rho_0 = rho_w + A * S_safe + B * np.power(S_safe, 1.5) + C * S_safe**2

    K = (19652.21
         + 148.4206    * T
         - 2.327105    * T**2
         + 1.360477e-2 * T**3
         - 5.155288e-5 * T**4
         + 3.239908    * P
         + 1.43713e-3  * T * P
         + 1.16092e-4  * T**2 * P
         - 5.77905e-7  * T**3 * P
         + 8.50935e-5  * P**2
         - 6.12293e-6  * T * P**2
         + 5.2787e-8   * T**2 * P**2
         + 54.6746     * S_safe
         - 0.603459    * T * S_safe
         + 1.09987e-2  * T**2 * S_safe
         - 6.1670e-5   * T**3 * S_safe
         + 7.944e-2    * np.power(S_safe, 1.5)
         + 1.6483e-2   * T * np.power(S_safe, 1.5)
         - 5.3009e-4   * T**2 * np.power(S_safe, 1.5))

    K = np.where(K == 0, np.nan, K)
    rho = rho_0 / (1.0 - P / K)

    # Mask physically unrealistic values
    rho = np.where((rho < 1000) | (rho > 1060), np.nan, rho)
    return rho


# ══════════════════════════════════════════════════════════════
# 6. MIXED LAYER DEPTH
# ══════════════════════════════════════════════════════════════

def compute_mld_profile(density, pressure, delta=MLD_DELTA):
    """
    MLD = depth where density exceeds surface density by delta (0.03 kg/m³).
    Returns NaN if profile is insufficient — never returns 99999.
    """
    valid = ~(np.isnan(density) | np.isnan(pressure))
    if valid.sum() < 3:
        return np.nan

    rho  = density[valid]
    pres = pressure[valid]

    # Remove duplicate pressure levels
    _, unique_idx = np.unique(pres, return_index=True)
    rho  = rho[unique_idx]
    pres = pres[unique_idx]

    if len(pres) < 3:
        return np.nan

    order = np.argsort(pres)
    rho   = rho[order]
    pres  = pres[order]

    rho_surface = rho[0]
    exceed = np.where(rho - rho_surface > delta)[0]

    if len(exceed) == 0:
        # Profile never exceeds threshold — return NaN (not max depth)
        return np.nan

    idx = exceed[0]
    if idx > 0:
        p1 = pres[idx - 1]
        p2 = pres[idx]
        d1 = rho[idx - 1] - rho_surface
        d2 = rho[idx]     - rho_surface
        if (d2 - d1) == 0:
            return float(pres[idx])
        mld = p1 + (delta - d1) / (d2 - d1) * (p2 - p1)
    else:
        mld = pres[idx]

    # Final sanity check
    if mld < 0 or mld > 2000:
        return np.nan

    return float(mld)


# ══════════════════════════════════════════════════════════════
# 7. THERMOCLINE DEPTH
# ══════════════════════════════════════════════════════════════

def compute_thermocline_profile(temp, pressure, min_pres=10.0):
    """
    Thermocline = depth of maximum vertical temperature gradient.
    Returns NaN if insufficient data.
    """
    valid = ~(np.isnan(temp) | np.isnan(pressure))
    if valid.sum() < 5:
        return np.nan

    T    = temp[valid]
    pres = pressure[valid]

    # Remove duplicate pressure levels
    _, unique_idx = np.unique(pres, return_index=True)
    T    = T[unique_idx]
    pres = pres[unique_idx]

    order = np.argsort(pres)
    T     = T[order]
    pres  = pres[order]

    deep = pres >= min_pres
    if deep.sum() < 3:
        return np.nan

    T    = T[deep]
    pres = pres[deep]

    dp = np.diff(pres)
    # Skip if any dp is zero
    dp = np.where(dp == 0, np.nan, dp)

    dTdP     = np.diff(T) / dp
    pres_mid = 0.5 * (pres[:-1] + pres[1:])

    # Remove NaN gradients
    valid_g = ~np.isnan(dTdP)
    if valid_g.sum() < 2:
        return np.nan

    thermo_idx = np.argmin(dTdP[valid_g])
    result = float(pres_mid[valid_g][thermo_idx])

    if result < 0 or result > 2000:
        return np.nan

    return result


# ══════════════════════════════════════════════════════════════
# 8. STRATIFICATION + BRUNT-VÄISÄLÄ FREQUENCY (N²)
# ══════════════════════════════════════════════════════════════

def compute_stratification_profile(density, pressure):
    """
    N² = -(g/rho0) * (drho/dz)

    N² > 0 : stable stratification
    N² = 0 : neutral
    N² < 0 : convective instability

    Returns: (stratification_index, mean_N2, max_N2)
    """
    g = 9.81

    valid = ~(np.isnan(density) | np.isnan(pressure))
    if valid.sum() < 3:
        return np.nan, np.nan, np.nan

    rho  = density[valid]
    pres = pressure[valid]

    # Remove duplicates
    _, unique_idx = np.unique(pres, return_index=True)
    rho  = rho[unique_idx]
    pres = pres[unique_idx]

    if len(pres) < 3:
        return np.nan, np.nan, np.nan

    order = np.argsort(pres)
    rho   = rho[order]
    pres  = pres[order]

    z = -pres  # depth (negative downward)

    dz = np.diff(z)
    dz = np.where(dz == 0, np.nan, dz)

    drho_dz = np.diff(rho) / dz
    N2      = -(g / RHO_0) * drho_dz

    # Remove inf and NaN
    N2 = np.where(np.isfinite(N2), N2, np.nan)

    upper = pres[:-1] <= 200
    if upper.sum() > 0 and not np.all(np.isnan(np.abs(drho_dz[upper]))):
        strat_index = float(np.nanmean(np.abs(drho_dz[upper])))
    elif not np.all(np.isnan(drho_dz)):
        strat_index = float(np.nanmean(np.abs(drho_dz)))
    else:
        strat_index = np.nan

    mean_N2 = float(np.nanmean(N2)) if not np.all(np.isnan(N2)) else np.nan
    max_N2  = float(np.nanmax(N2))  if not np.all(np.isnan(N2)) else np.nan

    return strat_index, mean_N2, max_N2


# ══════════════════════════════════════════════════════════════
# 9. OCEAN HEAT CONTENT
# ══════════════════════════════════════════════════════════════

def compute_ohc_profile(temp, pressure, depth_max=700.0):
    """
    OHC = rho0 * Cp * integral(T dz) from surface to depth_max
    Units: J/m²
    """
    valid = ~(np.isnan(temp) | np.isnan(pressure))
    if valid.sum() < 3:
        return np.nan

    T    = temp[valid]
    pres = pressure[valid]

    _, unique_idx = np.unique(pres, return_index=True)
    T    = T[unique_idx]
    pres = pres[unique_idx]

    order = np.argsort(pres)
    T     = T[order]
    pres  = pres[order]

    mask = pres <= depth_max
    if mask.sum() < 2:
        return np.nan

    T    = T[mask]
    pres = pres[mask]

    valid2 = ~np.isnan(T)
    if valid2.sum() < 2:
        return np.nan

    # np.trapz was removed in NumPy 2.0 — use np.trapezoid
    try:
        ohc = RHO_0 * CP * float(np.trapezoid(T[valid2], pres[valid2]))
    except AttributeError:
        ohc = RHO_0 * CP * float(np.trapz(T[valid2], pres[valid2]))

    return ohc

# ══════════════════════════════════════════════════════════════
# 10. WIND MIXING INDEX
# ══════════════════════════════════════════════════════════════

def compute_wind_mixing_index(wind_speed, mld):
    """
    Wind Mixing Index = tau³ / (rho0 * MLD)
    High = strong mechanical mixing of mixed layer.
    """
    if np.isnan(wind_speed) or np.isnan(mld) or mld <= 0:
        return np.nan

    rho_air = 1.225
    tau     = rho_air * CD * wind_speed**2
    wmi     = (tau**3) / (RHO_0 * mld)
    return float(wmi)


# ══════════════════════════════════════════════════════════════
# 11. ARGO PROFILE PHYSICS — all DAC processing
# ══════════════════════════════════════════════════════════════

def compute_argo_physics(dac="aoml", save=True):
    import pandas as pd

    zarr_key = f"argo_{dac}"
    print(f"\n{'='*55}")
    print(f"ARGO PROFILE PHYSICS — DAC: {dac}")
    print(f"{'='*55}")

    ds     = xr.open_zarr(ZARR[zarr_key]).compute()
    n_prof = ds.sizes["N_PROF"]
    print(f"  Profiles to process: {n_prof}")

    # ── Variable selection ───────────────────────────────────────
    # Use ADJUSTED if it exists — it has real QC values
    # Don't use a threshold — ADJUSTED is always preferred when present
    temp_var = "TEMP_ADJUSTED" if "TEMP_ADJUSTED" in ds else "TEMP"
    psal_var = "PSAL_ADJUSTED" if "PSAL_ADJUSTED" in ds else "PSAL"
    pres_var = "PRES_ADJUSTED" if "PRES_ADJUSTED" in ds else "PRES"

    # BUT fall back to raw if ADJUSTED is worse overall
    # Compare total valid count across ALL profiles
    def better_var(adj, raw):
        if adj not in ds:
            return raw
        n_adj = int((~np.isnan(ds[adj].values)).sum())
        n_raw = int((~np.isnan(ds[raw].values)).sum())
        chosen = adj if n_adj >= n_raw * 0.5 else raw
        print(f"  {adj}: {n_adj} valid  |  {raw}: {n_raw} valid  → using {chosen}")
        return chosen

    temp_var = better_var("TEMP_ADJUSTED", "TEMP")
    psal_var = better_var("PSAL_ADJUSTED", "PSAL")
    pres_var = better_var("PRES_ADJUSTED", "PRES")

    # Pre-load as float64
    TEMP = ds[temp_var].values.astype(np.float64)
    PSAL = ds[psal_var].values.astype(np.float64)
    PRES = ds[pres_var].values.astype(np.float64)
    LAT  = ds["LATITUDE"].values.astype(np.float64)
    LON  = ds["LONGITUDE"].values.astype(np.float64)

# JULD — confirmed nanoseconds since Unix epoch stored as float32
    # float32 precision loss is unavoidable but gives correct date to ~minute
    JULD_raw = ds["JULD"].values
    JULD_str = []
    for t in JULD_raw:
        try:
            ft = float(t)
            if np.isnan(ft) or ft <= 0:
                JULD_str.append("unknown")
            else:
                # Confirmed: values ~1.6e18 = nanoseconds since 1970-01-01
                ts = pd.Timestamp(int(ft), unit="ns")
                # Sanity check — must be within study period
                if pd.Timestamp("2015-01-01") <= ts <= pd.Timestamp("2027-01-01"):
                    JULD_str.append(str(ts)[:19])
                else:
                    JULD_str.append("unknown")
        except Exception:
            JULD_str.append("unknown")

    results = []
    n_ok = 0
    n_skip = 0

    for i in range(n_prof):
        if i % 5000 == 0:
            print(f"  Profile {i}/{n_prof} ...")

        try:
            temp = TEMP[i]
            psal = PSAL[i]
            pres = PRES[i]
            lat  = float(LAT[i])
            lon  = float(LON[i])

            # Skip invalid position
            if np.isnan(lat) or np.isnan(lon):
                n_skip += 1
                continue

            # ── Valid mask ───────────────────────────────────────
            # Pressure: physically real, not fill value
            # ARGO fill values are typically 99999 — exclude > 10000
            pres_ok = (~np.isnan(pres)) & (pres >= 0) & (pres <= 10000)

            # Temperature: physically real ocean range
            temp_ok = (~np.isnan(temp)) & (temp > -5) & (temp < 45)

            # Salinity: physically real, not fill value (99999)
            # Note: do NOT filter > 45 here — some deep ARGO have 
            # slightly high raw salinity before QC
            psal_ok = (~np.isnan(psal)) & (psal > 0) & (psal < 50)

            # All three valid simultaneously
            valid = pres_ok & temp_ok & psal_ok

            if valid.sum() < 5:
                n_skip += 1
                continue

            t_v = temp[valid]
            s_v = psal[valid]
            p_v = pres[valid]

            # ── Density ──────────────────────────────────────────
            rho = seawater_density(t_v, s_v, p_v)

            # ── MLD ──────────────────────────────────────────────
            mld = compute_mld_profile(rho, p_v)

            # ── Thermocline ───────────────────────────────────────
            thermo = compute_thermocline_profile(t_v, p_v)

            # ── Stratification + N² ───────────────────────────────
            strat, mean_N2, max_N2 = compute_stratification_profile(rho, p_v)

            # ── OHC 0–700m ───────────────────────────────────────
            ohc = compute_ohc_profile(t_v, p_v, depth_max=700.0)

            # ── Surface values (top 20 dbar) ──────────────────────
            surf = p_v <= 20
            sst_argo = float(np.nanmean(t_v[surf])) if surf.sum() > 0 else np.nan
            sss_argo = float(np.nanmean(s_v[surf])) if surf.sum() > 0 else np.nan
            surf_rho = (
                float(np.nanmean(rho[surf]))
                if (surf.sum() > 0 and not np.all(np.isnan(rho[surf])))
                else np.nan
            )

            results.append({
                "profile_idx"    : i,
                "lat"            : lat,
                "lon"            : lon,
                "time"           : JULD_str[i],
                "dac"            : dac,
                "n_valid_levels" : int(valid.sum()),
                "sst_argo"       : sst_argo,
                "sss_argo"       : sss_argo,
                "surf_density"   : surf_rho,
                "mld"            : mld,
                "thermocline"    : thermo,
                "strat_index"    : strat,
                "mean_N2"        : mean_N2,
                "max_N2"         : max_N2,
                "ohc_700m"       : ohc,
            })
            n_ok += 1

        except Exception as e:
            n_skip += 1
            if n_skip <= 5:  # show first 5 errors only
                print(f"  ERROR profile {i}: {type(e).__name__}: {e}")
            continue

    df = pd.DataFrame(results)

    print(f"\n  Processed : {n_ok} profiles")
    print(f"  Skipped   : {n_skip} profiles")

    if len(df) > 0:
        print(f"\n  Results summary:")
        for col in ["mld", "thermocline", "ohc_700m", "mean_N2", "sst_argo"]:
            v = df[col].dropna()
            if len(v) > 0:
                print(f"    {col:<18}: {v.min():.2f} → {v.max():.2f}   "
                      f"(median {v.median():.2f}, {len(v)} non-NaN)")

        print(f"\n  Conservation checks:")
        check_conservation("MLD",
            df["mld"].dropna().values,          0,   2000, "dbar")
        check_conservation("Thermocline",
            df["thermocline"].dropna().values,  5,   2000, "dbar")
        check_conservation("OHC",
            df["ohc_700m"].dropna().values,  0,  8e10,  "J/m²")
        check_conservation("SST (ARGO)",
            df["sst_argo"].dropna().values,    -2,     40, "°C")

    if save:
        out_path = os.path.join(
            r"C:\PROJECT\Data\Results",
            f"argo_{dac}_physics.parquet"
        )
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        df.to_parquet(out_path, index=False)
        print(f"\n  ✓ Saved: argo_{dac}_physics.parquet  ({len(df)} profiles)")

    ds.close()
    return df

# ══════════════════════════════════════════════════════════════
# MASTER RUN
# ══════════════════════════════════════════════════════════════

def run_all_physics():
    print("\n" + "█"*55)
    print("  OCEANPULSE — PHYSICS COMPUTATION LAYER")
    print("█"*55)

    # Grid-based
    compute_wind()
    compute_qnet()
    compute_ekman()
    compute_sst_anomaly()

    # Profile-based — all 8 DACs
    DACS = ["aoml","bodc","coriolis","csio","csiro","incois","jma","meds"]
    all_dfs = []
    for dac in DACS:
        try:
            df = compute_argo_physics(dac=dac, save=True)
            if len(df) > 0:
                all_dfs.append(df)
        except Exception as e:
            print(f"  ⚠ {dac} failed: {e}")

    if all_dfs:
        df_all = pd.concat(all_dfs, ignore_index=True)
        out_path = r"C:\PROJECT\Data\Results\argo_all_physics.parquet"
        df_all.to_parquet(out_path, index=False)
        print(f"\n✓ Combined ARGO physics: {len(df_all)} total profiles")
        print(f"  Saved: {out_path}")

    print("\n" + "█"*55)
    print("  PHYSICS COMPUTATION COMPLETE")
    print("█"*55)


if __name__ == "__main__":
    run_all_physics()