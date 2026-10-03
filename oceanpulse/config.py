# oceanpulse/config.py
# ── All project-wide constants and paths ──────────────────────

import os

# ── Base paths ─────────────────────────────────────────────────
DATA_DIR = r"C:\PROJECT\Data"
ZARR_DIR = os.path.join(DATA_DIR, "Zarr_ready")

# ── Zarr store paths ───────────────────────────────────────────
ZARR = {
    "wind"          : os.path.join(ZARR_DIR, "wind.zarr"),
    "heat_flux"     : os.path.join(ZARR_DIR, "heat_flux.zarr"),
    "sst"           : os.path.join(ZARR_DIR, "sst.zarr"),
    "sla"           : os.path.join(ZARR_DIR, "sla.zarr"),
    "atm"           : os.path.join(ZARR_DIR, "atm.zarr"),
    "indices"       : os.path.join(ZARR_DIR, "indices.zarr"),
    "argo_aoml"     : os.path.join(ZARR_DIR, "argo_aoml.zarr"),
    "argo_bodc"     : os.path.join(ZARR_DIR, "argo_bodc.zarr"),
    "argo_coriolis" : os.path.join(ZARR_DIR, "argo_coriolis.zarr"),
    "argo_csio"     : os.path.join(ZARR_DIR, "argo_csio.zarr"),
    "argo_csiro"    : os.path.join(ZARR_DIR, "argo_csiro.zarr"),
    "argo_incois"   : os.path.join(ZARR_DIR, "argo_incois.zarr"),
    "argo_jma"      : os.path.join(ZARR_DIR, "argo_jma.zarr"),
    "argo_meds"     : os.path.join(ZARR_DIR, "argo_meds.zarr"),
}

# ── Study region — Indian Ocean ────────────────────────────────
REGION = {
    "lat_min" : -40.0,
    "lat_max" :  30.0,
    "lon_min" :  20.0,
    "lon_max" : 120.0,
}

# ── Study period ───────────────────────────────────────────────
TIME_START = "2020-01-01"
TIME_END   = "2025-08-02"

# ── Physics constants ──────────────────────────────────────────
RHO_0        = 1025.0    # reference seawater density kg/m³
CP           = 3985.0    # specific heat of seawater J/kg/K
CD           = 1.3e-3    # drag coefficient (dimensionless)
MLD_DELTA    = 0.03      # MLD density threshold kg/m³
THERMO_MIN_P = 10.0      # minimum pressure for thermocline search (dbar)

# ── Output paths ───────────────────────────────────────────────
RESULTS_DIR = os.path.join(DATA_DIR, "Results")
os.makedirs(RESULTS_DIR, exist_ok=True)

RESULTS = {

    "wind_stress"  : os.path.join(RESULTS_DIR, "wind_stress.zarr"),

    "ekman"        : os.path.join(RESULTS_DIR, "ekman.zarr"),

    "qnet"         : os.path.join(RESULTS_DIR, "qnet.zarr"),

    "sst_anomaly"  : os.path.join(RESULTS_DIR, "sst_anomaly.zarr"),

    "mld"          : os.path.join(RESULTS_DIR, "mld.zarr"),

    "thermocline"  : os.path.join(RESULTS_DIR, "thermocline.zarr"),

    "density"      : os.path.join(RESULTS_DIR, "density.zarr"),

}