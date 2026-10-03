# routers/argo.py
# GET  /api/argo/profiles
# GET  /api/argo/profiles/{profile_id}
# POST /api/argo/upload

import os
import sys
import io
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import RESULTS_DIR

router = APIRouter()

# ── Models ─────────────────────────────────────────────────────
class ArgoProfile(BaseModel):
    profile_id: str
    float_id: str
    time: str
    latitude: float
    longitude: float
    basin: str
    sst_argo: Optional[float]
    mld: Optional[float]
    ohc_700m: Optional[float]
    confidence: float
    sparse_flag: bool
    sst_seasonal_anom: Optional[float]

class ArgoProfileDetail(ArgoProfile):
    depth_levels: Optional[List[float]]
    temperature_profile: Optional[List[float]]
    salinity_profile: Optional[List[float]]

class ArgoResponse(BaseModel):
    profiles: List[ArgoProfile]
    total: int
    page: int
    per_page: int

class UploadResponse(BaseModel):
    success: bool
    message: str
    profiles_added: int

# ── Helpers ────────────────────────────────────────────────────
def sf(val, default=None):
    try:
        v = float(val)
        return None if (np.isnan(v) or np.isinf(v)) else round(v, 4)
    except Exception:
        return default

def assign_basin(lat: float, lon: float) -> str:
    if 5 <= lat <= 25 and 80 <= lon <= 100:
        return "Bay of Bengal"
    if 5 <= lat <= 25 and 55 <= lon <= 80:
        return "Arabian Sea"
    if lat < -15:
        return "Southern Indian Ocean"
    if -5 <= lat <= 5:
        return "Equatorial Indian Ocean"
    return "Indian Ocean"

def load_argo_df():
    """
    Load the correct Argo parquet file.
    Primary file from analysis.py is profile_uncertainty.parquet.
    Columns: lat, lon, time, sst_argo, mld, ohc_700m, confidence, sparse_flag
    """
    candidates = [
        "profile_uncertainty.parquet",
        "argo_with_seasonal_anom.parquet",
        "argo_all_physics.parquet",
    ]
    for fname in candidates:
        path = os.path.join(RESULTS_DIR, fname)
        if os.path.exists(path):
            df = pd.read_parquet(path)
            df["time"] = pd.to_datetime(df["time"], errors="coerce")
            return df, fname

    raise FileNotFoundError(
        f"No Argo parquet file found in: {RESULTS_DIR}\n"
        f"Tried: {', '.join(candidates)}\n"
        f"Run compute_profile_uncertainty() from analysis.py first."
    )

def normalise_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalise column names.
    analysis.py saves: lat, lon (NOT latitude/longitude), sst_argo, mld, ohc_700m
    """
    # lat/lon — analysis.py uses lat and lon
    if "latitude" not in df.columns:
        df["latitude"] = df["lat"] if "lat" in df.columns else 0.0
    if "longitude" not in df.columns:
        df["longitude"] = df["lon"] if "lon" in df.columns else 0.0

    # float_id
    if "float_id" not in df.columns:
        for alt in ["platform_number", "PLATFORM_NUMBER", "wmo_id", "float"]:
            if alt in df.columns:
                df["float_id"] = df[alt].astype(str)
                break
        if "float_id" not in df.columns:
            df["float_id"] = (
                df["latitude"].round(2).astype(str) + "_" +
                df["longitude"].round(2).astype(str)
            )

    # profile_id — unique per row
    if "profile_id" not in df.columns:
        df = df.reset_index(drop=True)
        df["profile_id"] = (
            df["float_id"].astype(str) + "_" +
            df["time"].dt.strftime("%Y%m%d").fillna("00000000") + "_" +
            df.index.astype(str)
        )

    # basin
    if "basin" not in df.columns:
        df["basin"] = df.apply(
            lambda r: assign_basin(float(r["latitude"]), float(r["longitude"])), axis=1
        )

    # confidence
    if "confidence" not in df.columns:
        df["confidence"] = 0.8

    # sparse_flag
    if "sparse_flag" not in df.columns:
        df["sparse_flag"] = False

    # sst column alias
    if "sst_argo" not in df.columns and "sst" in df.columns:
        df["sst_argo"] = df["sst"]

    return df


# ── GET /profiles ──────────────────────────────────────────────
@router.get("/profiles", response_model=ArgoResponse)
def list_argo_profiles(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
    search: str = Query("", description="Search by float ID or profile ID"),
    basin: str = Query("", description="Ocean region name"),
    lat: Optional[float] = Query(None, description="Centre latitude for nearby search"),
    lon: Optional[float] = Query(None, description="Centre longitude for nearby search"),
    radius_deg: float = Query(2.0, description="Search radius in degrees"),
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to:   Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    sort: str = Query("time_desc", description="time_desc | time_asc | sst_desc | confidence_desc"),
):
    try:
        df, _ = load_argo_df()
        df = normalise_df(df)

        # Text search
        if search.strip():
            s = search.strip().lower()
            mask = (
                df["float_id"].astype(str).str.lower().str.contains(s, na=False) |
                df["profile_id"].astype(str).str.lower().str.contains(s, na=False)
            )
            df = df[mask]

        # Basin filter
        if basin and basin not in ("", "All Basins"):
            df = df[df["basin"] == basin]

        # Location filter
        if lat is not None and lon is not None:
            lat_mask = (df["latitude"]  >= lat - radius_deg) & (df["latitude"]  <= lat + radius_deg)
            lon_mask = (df["longitude"] >= lon - radius_deg) & (df["longitude"] <= lon + radius_deg)
            df = df[lat_mask & lon_mask].copy()
            df["_dist"] = np.sqrt((df["latitude"] - lat)**2 + (df["longitude"] - lon)**2)
            df = df.sort_values("_dist").drop(columns=["_dist"])

        # Date filter
        if date_from:
            df = df[df["time"] >= pd.Timestamp(date_from)]
        if date_to:
            df = df[df["time"] <= pd.Timestamp(date_to)]

        # Sort (only if not already sorted by distance)
        if lat is None:
            if sort == "time_asc":
                df = df.sort_values("time", ascending=True)
            elif sort == "sst_desc":
                col = "sst_argo" if "sst_argo" in df.columns else "sst"
                df = df.sort_values(col, ascending=False, na_position="last")
            elif sort == "confidence_desc":
                df = df.sort_values("confidence", ascending=False, na_position="last")
            else:
                df = df.sort_values("time", ascending=False)

        total   = len(df)
        start   = (page - 1) * per_page
        page_df = df.iloc[start : start + per_page]

        profiles = []
        for _, row in page_df.iterrows():
            profiles.append(ArgoProfile(
                profile_id       = str(row["profile_id"]),
                float_id         = str(row["float_id"]),
                time             = str(row["time"])[:19],
                latitude         = round(float(row["latitude"]), 4),
                longitude        = round(float(row["longitude"]), 4),
                basin            = str(row["basin"]),
                sst_argo         = sf(row.get("sst_argo")),
                mld              = sf(row.get("mld")),
                ohc_700m         = sf(row.get("ohc_700m")),
                confidence       = round(float(row.get("confidence", 0.8)), 4),
                sparse_flag      = bool(row.get("sparse_flag", False)),
                sst_seasonal_anom= sf(row.get("sst_seasonal_anom")),
            ))

        return ArgoResponse(profiles=profiles, total=total, page=page, per_page=per_page)

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Argo profiles failed: {str(e)}")


# ── GET /profiles/{profile_id} ─────────────────────────────────
@router.get("/profiles/{profile_id}", response_model=ArgoProfileDetail)
def get_profile_detail(profile_id: str):
    try:
        df, _ = load_argo_df()
        df = normalise_df(df)

        match = df[df["profile_id"] == profile_id]
        if match.empty:
            match = df[df["float_id"].astype(str) == profile_id.split("_")[0]]
        if match.empty:
            raise HTTPException(status_code=404, detail=f"Profile '{profile_id}' not found.")

        row = match.iloc[0]
        return ArgoProfileDetail(
            profile_id        = str(row["profile_id"]),
            float_id          = str(row["float_id"]),
            time              = str(row["time"])[:19],
            latitude          = round(float(row["latitude"]), 4),
            longitude         = round(float(row["longitude"]), 4),
            basin             = str(row["basin"]),
            sst_argo          = sf(row.get("sst_argo")),
            mld               = sf(row.get("mld")),
            ohc_700m          = sf(row.get("ohc_700m")),
            confidence        = round(float(row.get("confidence", 0.8)), 4),
            sparse_flag       = bool(row.get("sparse_flag", False)),
            sst_seasonal_anom = sf(row.get("sst_seasonal_anom")),
            depth_levels      = None,
            temperature_profile = None,
            salinity_profile  = None,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile detail failed: {str(e)}")


# ── POST /upload ───────────────────────────────────────────────
@router.post("/upload", response_model=UploadResponse)
async def upload_argo_profile(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        filename  = file.filename or ""

        if filename.endswith(".csv"):
            df_new = pd.read_csv(io.StringIO(contents.decode("utf-8")))
        elif filename.endswith(".nc"):
            try:
                import xarray as xr, tempfile
                with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
                    tmp.write(contents)
                    tmp_path = tmp.name
                ds = xr.open_dataset(tmp_path)
                df_new = ds.to_dataframe().reset_index()
                ds.close()
                os.unlink(tmp_path)
            except Exception as nc_err:
                raise HTTPException(status_code=400, detail=f"Could not read NetCDF: {nc_err}")
        else:
            raise HTTPException(status_code=400, detail="Only .csv and .nc files are supported.")

        df_new["time"] = pd.to_datetime(df_new["time"], errors="coerce")
        df_new = df_new.dropna(subset=["time"])
        if df_new.empty:
            raise HTTPException(status_code=400, detail="No valid rows found after parsing.")

        main_path = os.path.join(RESULTS_DIR, "profile_uncertainty.parquet")
        if os.path.exists(main_path):
            df_existing = pd.read_parquet(main_path)
            df_combined = pd.concat([df_existing, df_new], ignore_index=True)
        else:
            df_combined = df_new

        df_combined.to_parquet(main_path, index=False)

        return UploadResponse(
            success=True,
            message=f"Successfully added {len(df_new)} profiles from '{filename}'.",
            profiles_added=len(df_new),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")