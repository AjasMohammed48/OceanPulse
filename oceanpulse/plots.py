# oceanpulse/plots.py
# ── OceanPulse Visualization Layer ────────────────────────────
# All plots use Plotly for interactivity and match the dark ocean theme.
# Each function returns a plotly Figure — call st.plotly_chart(fig) in app.
#
# Functions:
#   A1.  plot_sst_anomaly_heatmap()        - Spatial SST heatmap with time slider
#   A2.  plot_mhw_calendar()               - GitHub-style MHW calendar heatmap
#   A3.  plot_argo_scatter_map()           - ARGO float positions colored by variable
#   A4.  plot_depth_profile()              - T/S vertical profile for one ARGO float
#   A5.  plot_mhw_phase_composite()        - MHW intensity by ENSO/IOD phase
#   A6.  plot_ohc_decomposition()          - OHC seasonal decomposition
#   A7.  plot_climate_correlation_matrix() - ENSO/IOD/PDO vs MHW cross-correlation
#   A8.  plot_wind_stress_vectors()        - Wind stress quiver map
#   A9.  plot_mld_thermocline_scatter()    - MLD vs thermocline per profile
#   A10. plot_trend_regression()           - Trend variable with fitted line + CI band

import numpy as np
import pandas as pd
import xarray as xr
import os
import sys
import warnings
warnings.filterwarnings("ignore")

import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import ZARR, RESULTS, RESULTS_DIR

# ── Theme constants (matches the app's ocean dark theme) ──────
BG        = "#040d14"
BG_PANEL  = "#071828"
BG_MID    = "#0a2235"
TEAL      = "#00c9b1"
TEAL_DIM  = "#009985"
AMBER     = "#ff8c42"
RED       = "#ff4d6d"
BLUE      = "#4db8ff"
ICE       = "#e8f4f8"
ICE_DIM   = "#8ab4c8"
GHOST     = "#2a4a5e"

PLOTLY_LAYOUT = dict(
    paper_bgcolor=BG_PANEL,
    plot_bgcolor=BG,
    font=dict(family="Space Mono, monospace", color=ICE_DIM, size=11),
    title_font=dict(family="Syne, sans-serif", color=ICE, size=15),
    legend=dict(
        bgcolor=BG_MID, bordercolor=GHOST, borderwidth=1,
        font=dict(color=ICE_DIM, size=10),
    ),
    margin=dict(l=60, r=30, t=50, b=50),
    xaxis=dict(
        gridcolor=GHOST, gridwidth=0.5,
        linecolor=GHOST, tickcolor=GHOST, tickfont=dict(color=ICE_DIM),
        zerolinecolor=GHOST,
    ),
    yaxis=dict(
        gridcolor=GHOST, gridwidth=0.5,
        linecolor=GHOST, tickcolor=GHOST, tickfont=dict(color=ICE_DIM),
        zerolinecolor=GHOST,
    ),
    coloraxis_colorbar=dict(
        tickfont=dict(color=ICE_DIM, size=9),
        title_font=dict(color=ICE_DIM),
        bgcolor=BG_MID, bordercolor=GHOST,
    ),
)


def _apply_theme(fig):
    """Apply the ocean dark theme to any figure."""
    fig.update_layout(**PLOTLY_LAYOUT)
    return fig


# ══════════════════════════════════════════════════════════════
# A1. SST ANOMALY HEATMAP
# ══════════════════════════════════════════════════════════════

def plot_sst_anomaly_heatmap(n_frames=24, downsample_space=4):
    """
    Spatial heatmap of SST anomaly across the Indian Ocean grid.
    Animated time slider showing monthly snapshots.

    Args:
        n_frames      : number of monthly frames to show (default 24 = 2 years)
        downsample_space : spatial stride for speed (default 4 = every 4th cell)

    Returns: plotly Figure
    """
    ds = xr.open_zarr(RESULTS["sst_anomaly"])
    sst_anom = ds["sst_anomaly"]

    # Sample monthly snapshots evenly across the time range
    n_times = len(sst_anom.time)
    step    = max(1, n_times // n_frames)
    indices = list(range(0, n_times, step))[:n_frames]

    # Downsample spatially for performance
    lats = sst_anom.lat.values[::downsample_space]
    lons = sst_anom.lon.values[::downsample_space]

    frames = []
    slider_steps = []

    for i, t_idx in enumerate(indices):
        snapshot = sst_anom.isel(time=t_idx).values[::downsample_space, ::downsample_space]
        date_str = str(sst_anom.time.values[t_idx])[:10]

        frame_data = go.Heatmap(
            z=snapshot, x=lons, y=lats,
            colorscale=[
                [0.0,  "#0a3d6b"],
                [0.25, "#0066b3"],
                [0.45, "#00c9b1"],
                [0.5,  "#071828"],
                [0.55, "#ffb347"],
                [0.75, "#ff8c42"],
                [1.0,  "#ff1a4b"],
            ],
            zmid=0,
            zmin=-3, zmax=3,
            colorbar=dict(
                title="SST Anomaly (°C)",
                tickfont=dict(color=ICE_DIM, size=9),
                title_font=dict(color=ICE_DIM),
            ),
            hovertemplate="Lat: %{y:.1f}°<br>Lon: %{x:.1f}°<br>Anomaly: %{z:.2f}°C<extra></extra>",
        )
        frames.append(go.Frame(data=[frame_data], name=date_str))

        slider_steps.append(dict(
            args=[[date_str], {"frame": {"duration": 300, "redraw": True},
                               "mode": "immediate",
                               "transition": {"duration": 200}}],
            label=date_str[:7],
            method="animate",
        ))

    # Build figure with first frame
    first = sst_anom.isel(time=indices[0]).values[::downsample_space, ::downsample_space]
    fig = go.Figure(
        data=[go.Heatmap(
            z=first, x=lons, y=lats,
            colorscale=[
                [0.0,  "#0a3d6b"],
                [0.25, "#0066b3"],
                [0.45, "#00c9b1"],
                [0.5,  "#071828"],
                [0.55, "#ffb347"],
                [0.75, "#ff8c42"],
                [1.0,  "#ff1a4b"],
            ],
            zmid=0, zmin=-3, zmax=3,
            colorbar=dict(title="SST Anomaly (°C)"),
            hovertemplate="Lat: %{y:.1f}°<br>Lon: %{x:.1f}°<br>Anomaly: %{z:.2f}°C<extra></extra>",
        )],
        frames=frames,
    )

    fig.update_layout(
        title="Indian Ocean SST Anomaly · Monthly Snapshots",
        xaxis_title="Longitude",
        yaxis_title="Latitude",
        height=500,
        updatemenus=[dict(
            type="buttons", showactive=False, y=1.1, x=0.05,
            buttons=[
                dict(label="▶ Play",
                     method="animate",
                     args=[None, {"frame": {"duration": 400, "redraw": True},
                                  "fromcurrent": True}]),
                dict(label="⏸ Pause",
                     method="animate",
                     args=[[None], {"frame": {"duration": 0}, "mode": "immediate"}]),
            ],
            bgcolor=BG_MID, bordercolor=TEAL, font=dict(color=TEAL),
        )],
        sliders=[dict(
            active=0, steps=slider_steps,
            x=0.05, len=0.95, y=0,
            currentvalue=dict(prefix="Date: ", font=dict(color=TEAL, size=11)),
            tickcolor=GHOST, bordercolor=GHOST,
            bgcolor=BG_MID, font=dict(color=ICE_DIM, size=9),
        )],
    )
    ds.close()
    return _apply_theme(fig)


# ══════════════════════════════════════════════════════════════
# A2. MHW CALENDAR HEATMAP
# ══════════════════════════════════════════════════════════════

def plot_mhw_calendar(df_mhw=None):
    """
    GitHub-style calendar heatmap. Each cell = 1 day.
    Color = MHW category (0=none, 1=Moderate … 4=Extreme).

    Args:
        df_mhw : DataFrame from load_mhw(). If None, loads from parquet.

    Returns: plotly Figure
    """
    if df_mhw is None:
        df_mhw = pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))

    df = df_mhw.copy()
    df["date"] = pd.to_datetime(df["date"])
    df["year"]    = df["date"].dt.year
    df["month"]   = df["date"].dt.month
    df["day"]     = df["date"].dt.day
    df["weekday"] = df["date"].dt.weekday        # 0=Mon
    df["week"]    = df["date"].dt.isocalendar().week.astype(int)

    # Use mhw_category but zero-out days that aren't true MHW
    df["plot_cat"] = np.where(df["is_mhw"], df["mhw_category"], 0)

    years = sorted(df["year"].unique())
    n_years = len(years)

    fig = make_subplots(
        rows=n_years, cols=1,
        subplot_titles=[str(y) for y in years],
        vertical_spacing=0.08,
    )

    cat_colors = {
        0: BG_MID,
        1: "#ffb347",
        2: "#ff8c42",
        3: "#ff5533",
        4: "#ff1a4b",
    }
    month_names = ["Jan","Feb","Mar","Apr","May","Jun",
                   "Jul","Aug","Sep","Oct","Nov","Dec"]

    for row_i, year in enumerate(years):
        yr_df = df[df["year"] == year]

        for _, r in yr_df.iterrows():
            w   = int(r["week"])
            wd  = int(r["weekday"])
            cat = int(r["plot_cat"])
            fig.add_trace(
                go.Scatter(
                    x=[w], y=[6 - wd],
                    mode="markers",
                    marker=dict(
                        symbol="square",
                        size=10,
                        color=cat_colors[cat],
                        line=dict(width=0.3, color=BG),
                    ),
                    text=f"{r['date'].date()}<br>"
                         f"Category: {['None','I','II','III','IV'][cat]}<br>"
                         f"Intensity: {r['max_intensity']:.2f}°C",
                    hoverinfo="text",
                    showlegend=False,
                ),
                row=row_i + 1, col=1,
            )

        fig.update_yaxes(
            tickvals=list(range(7)),
            ticktext=["Sun","Sat","Fri","Thu","Wed","Tue","Mon"],
            row=row_i + 1, col=1,
        )

    # Legend traces
    for cat, label, color in [
        (0, "No MHW",      BG_MID),
        (1, "Cat I · Moderate",  "#ffb347"),
        (2, "Cat II · Strong",   "#ff8c42"),
        (3, "Cat III · Severe",  "#ff5533"),
        (4, "Cat IV · Extreme",  "#ff1a4b"),
    ]:
        fig.add_trace(go.Scatter(
            x=[None], y=[None], mode="markers",
            marker=dict(symbol="square", size=10, color=color),
            name=label, showlegend=True,
        ))

    fig.update_layout(
        title="Marine Heatwave Calendar · Daily Category",
        height=max(260 * n_years, 400),
    )
    return _apply_theme(fig)


# ══════════════════════════════════════════════════════════════
# A3. ARGO SCATTER MAP
# ══════════════════════════════════════════════════════════════

def plot_argo_scatter_map(df_argo=None, color_by="sst_argo", max_points=5000):
    """
    Plot ARGO float positions on a map, colored by a chosen variable.

    Args:
        df_argo   : profile_uncertainty.parquet DataFrame. If None, loads from file.
        color_by  : column to use for color ('sst_argo', 'mld', 'ohc_700m', 'confidence')
        max_points: downsample for performance

    Returns: plotly Figure
    """
    if df_argo is None:
        df_argo = pd.read_parquet(os.path.join(RESULTS_DIR, "profile_uncertainty.parquet"))

    df = df_argo.dropna(subset=["lat", "lon", color_by]).copy()
    if len(df) > max_points:
        df = df.sample(max_points, random_state=42)

    labels = {
        "sst_argo":   "SST (°C)",
        "mld":        "MLD (dbar)",
        "ohc_700m":   "OHC 0-700m (J/m²)",
        "confidence": "Confidence",
    }
    col_label = labels.get(color_by, color_by)

    colorscales = {
        "sst_argo":   "RdBu_r",
        "mld":        "Blues",
        "ohc_700m":   "Oranges",
        "confidence": "Teal",
    }
    cscale = colorscales.get(color_by, "Viridis")

    fig = go.Figure()

    # Indian Ocean outline (bounding box guide)
    fig.add_trace(go.Scattergeo(
        lon=[20, 120, 120, 20, 20],
        lat=[-40, -40, 30, 30, -40],
        mode="lines",
        line=dict(color=GHOST, width=1, dash="dot"),
        showlegend=False,
        hoverinfo="skip",
    ))

    # ARGO scatter
    fig.add_trace(go.Scattergeo(
        lon=df["lon"].values,
        lat=df["lat"].values,
        mode="markers",
        marker=dict(
            size=4,
            color=df[color_by].values,
            colorscale=cscale,
            colorbar=dict(
                title=col_label,
                tickfont=dict(color=ICE_DIM, size=9),
                title_font=dict(color=ICE_DIM),
                bgcolor=BG_MID,
            ),
            opacity=0.75,
            line=dict(width=0),
        ),
        customdata=np.stack([
            df["lat"].values,
            df["lon"].values,
            df[color_by].values,
            df.get("dac", pd.Series(["—"] * len(df))).values,
        ], axis=-1),
        hovertemplate=(
            "Lat: %{customdata[0]:.2f}° | Lon: %{customdata[1]:.2f}°<br>"
            f"{col_label}: " + "%{customdata[2]:.3f}<br>"
            "DAC: %{customdata[3]}<extra></extra>"
        ),
    ))

    fig.update_layout(
        title=f"ARGO Float Profiles · Colored by {col_label}",
        geo=dict(
            projection_type="natural earth",
            lonaxis=dict(range=[20, 120]),
            lataxis=dict(range=[-40, 30]),
            bgcolor=BG,
            showland=True, landcolor="#0d1f2d",
            showocean=True, oceancolor="#040d14",
            showcoastlines=True, coastlinecolor=GHOST,
            showframe=False,
            showgrid=True, gridcolor=GHOST,
        ),
        height=480,
        paper_bgcolor=BG_PANEL,
        font=dict(color=ICE_DIM),
    )
    return fig


# ══════════════════════════════════════════════════════════════
# A4. DEPTH PROFILE PLOT
# ══════════════════════════════════════════════════════════════

def plot_depth_profile(profile_row, zarr_key="argo_aoml"):
    """
    Vertical T/S profile for a single ARGO float.
    Shows temperature vs depth and salinity vs depth side by side.
    Also marks MLD and thermocline depths.

    Args:
        profile_row : a row (Series) from the profile_uncertainty parquet,
                      must have columns: lat, lon, time, mld, thermocline, dac
        zarr_key    : which ARGO zarr store to look up raw profiles in

    Returns: plotly Figure
    """
    mld_depth   = float(profile_row.get("mld", np.nan))
    thermo_depth = float(profile_row.get("thermocline", np.nan))
    lat  = float(profile_row.get("lat", 0))
    lon  = float(profile_row.get("lon", 0))
    sst  = float(profile_row.get("sst_argo", np.nan))
    ohc  = float(profile_row.get("ohc_700m", np.nan))
    conf = float(profile_row.get("confidence", np.nan))

    # Load raw Zarr data for this profile
    # We synthesise a realistic profile from stored statistics when
    # direct level data is unavailable (parquet stores scalar summaries only)
    try:
        ds   = xr.open_zarr(ZARR[zarr_key])
        # Try to find matching profile by lat/lon proximity
        if "lat" in ds.coords and "lon" in ds.coords:
            dist = np.sqrt((ds.lat.values - lat)**2 + (ds.lon.values - lon)**2)
            idx  = int(np.nanargmin(dist))
            pres = ds["pres"].isel(profile=idx).values   if "pres" in ds else None
            temp = ds["temp"].isel(profile=idx).values   if "temp" in ds else None
            sal  = ds["psal"].isel(profile=idx).values   if "psal" in ds else None
        else:
            pres = temp = sal = None
        ds.close()
    except Exception:
        pres = temp = sal = None

    # If raw level data not available, build an analytic proxy profile
    if pres is None or np.all(np.isnan(pres if pres is not None else [np.nan])):
        pres_synth = np.linspace(1, 700, 80)
        sst_base   = sst if not np.isnan(sst) else 28.0
        # Exponential decay from SST to deep temperature
        temp_synth = sst_base - (sst_base - 4.5) * (1 - np.exp(-pres_synth / 200))
        sal_synth  = 34.5 + 0.8 * np.exp(-pres_synth / 150)
        pres = pres_synth
        temp = temp_synth
        sal  = sal_synth
        note = " (analytic proxy — raw levels unavailable)"
    else:
        note = ""

    valid = ~(np.isnan(pres) | np.isnan(temp))

    fig = make_subplots(
        rows=1, cols=2,
        subplot_titles=["Temperature (°C)", "Salinity (PSU)"],
        shared_yaxes=True,
        horizontal_spacing=0.06,
    )

    # Temperature profile
    fig.add_trace(go.Scatter(
        x=temp[valid], y=pres[valid],
        mode="lines",
        line=dict(color=AMBER, width=2),
        name="Temperature",
        hovertemplate="T: %{x:.2f}°C | P: %{y:.0f} dbar<extra></extra>",
    ), row=1, col=1)

    # Salinity profile
    valid_s = ~(np.isnan(pres) | np.isnan(sal))
    fig.add_trace(go.Scatter(
        x=sal[valid_s], y=pres[valid_s],
        mode="lines",
        line=dict(color=BLUE, width=2),
        name="Salinity",
        hovertemplate="S: %{x:.3f} PSU | P: %{y:.0f} dbar<extra></extra>",
    ), row=1, col=2)

    # MLD horizontal line
    if not np.isnan(mld_depth):
        for col in [1, 2]:
            fig.add_hline(
                y=mld_depth,
                line=dict(color=TEAL, width=1.5, dash="dash"),
                annotation_text="MLD", annotation_font_color=TEAL,
                row=1, col=col,
            )

    # Thermocline line
    if not np.isnan(thermo_depth):
        for col in [1, 2]:
            fig.add_hline(
                y=thermo_depth,
                line=dict(color=RED, width=1.5, dash="dot"),
                annotation_text="Thermocline", annotation_font_color=RED,
                row=1, col=col,
            )

    # Invert y-axis (pressure increases downward)
    fig.update_yaxes(autorange="reversed", title_text="Pressure (dbar)", row=1, col=1)
    fig.update_xaxes(title_text="Temperature (°C)", row=1, col=1)
    fig.update_xaxes(title_text="Salinity (PSU)", row=1, col=2)

    ohc_str = f"{ohc:.2e}" if not np.isnan(ohc) else "N/A"
    fig.update_layout(
        title=(f"ARGO Profile · Lat {lat:.2f}° Lon {lon:.2f}° · "
               f"SST={sst:.2f}°C · OHC={ohc_str} J/m² · conf={conf:.3f}{note}"),
        height=500,
        showlegend=False,
    )
    return _apply_theme(fig)


# ══════════════════════════════════════════════════════════════
# A5. MHW PHASE COMPOSITE PLOT
# ══════════════════════════════════════════════════════════════

def plot_mhw_phase_composite(df_mhw=None):
    """
    Box/violin plot of MHW intensity split by ENSO phase and IOD phase.
    Shows how climate modes modulate heatwave strength.

    Returns: plotly Figure
    """
    if df_mhw is None:
        df_mhw = pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))

    df = df_mhw[df_mhw["is_mhw"]].copy()
    if len(df) == 0:
        fig = go.Figure()
        fig.update_layout(title="No MHW days detected — nothing to plot")
        return _apply_theme(fig)

    enso_colors = {
        "El Nino": AMBER,
        "Neutral": TEAL,
        "La Nina": BLUE,
    }
    iod_colors = {
        "Positive IOD": RED,
        "Neutral IOD":  TEAL,
        "Negative IOD": BLUE,
    }

    fig = make_subplots(
        rows=1, cols=2,
        subplot_titles=["MHW Max Intensity by ENSO Phase",
                        "MHW Max Intensity by IOD Phase"],
        horizontal_spacing=0.12,
    )

    # ENSO composite
    for phase, color in enso_colors.items():
        sub = df[df["enso_phase"] == phase]["max_intensity"]
        if len(sub) == 0:
            continue
        fig.add_trace(go.Violin(
            y=sub.values, name=phase,
            side="positive", width=1.8,
            line_color=color,
            fillcolor=f'rgba{tuple(int(color[i:i+2], 16) for i in (1, 3, 5)) + (0.15,)}',
            points="outliers",
            marker=dict(color=color, size=3),
            hovertemplate=f"{phase}<br>Intensity: %{{y:.2f}}°C<extra></extra>",
            showlegend=False,
        ), row=1, col=1)

    # IOD composite
    for phase, color in iod_colors.items():
        sub = df[df["iod_phase"] == phase]["max_intensity"]
        if len(sub) == 0:
            continue
        fig.add_trace(go.Violin(
            y=sub.values, name=phase,
            side="positive", width=1.8,
            line_color=color,
            fillcolor=f'rgba{tuple(int(color[i:i+2], 16) for i in (1, 3, 5)) + (0.15,)}',
            points="outliers",
            marker=dict(color=color, size=3),
            hovertemplate=f"{phase}<br>Intensity: %{{y:.2f}}°C<extra></extra>",
            showlegend=False,
        ), row=1, col=2)

    # Add mean markers
    for col_i, (phase_col, color_map) in enumerate(
            [("enso_phase", enso_colors), ("iod_phase", iod_colors)], start=1):
        means = df.groupby(phase_col)["max_intensity"].mean()
        for phase, mean_val in means.items():
            fig.add_trace(go.Scatter(
                x=[phase], y=[mean_val],
                mode="markers",
                marker=dict(symbol="diamond", size=10,
                            color=color_map.get(phase, TEAL),
                            line=dict(color=ICE, width=1)),
                name=f"Mean · {phase}",
                showlegend=True,
            ), row=1, col=col_i)

    fig.update_yaxes(title_text="Max Intensity (°C above threshold)", row=1, col=1)
    fig.update_layout(
        title="MHW Intensity Composite by Climate Phase",
        height=460,
        violingap=0.15,
        violinmode="group",
    )
    return _apply_theme(fig)


# ══════════════════════════════════════════════════════════════
# A6. OHC SEASONAL DECOMPOSITION
# ══════════════════════════════════════════════════════════════

def plot_ohc_decomposition(df_argo=None):
    """
    Decompose OHC 0-700m timeseries into:
      - Observed (monthly mean)
      - Long-term trend (12-month rolling mean)
      - Seasonal signal (monthly anomaly from rolling mean)
      - Residual

    Returns: plotly Figure
    """
    if df_argo is None:
        df_argo = pd.read_parquet(os.path.join(RESULTS_DIR, "profile_uncertainty.parquet"))

    df = df_argo.copy()
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    monthly = (df.dropna(subset=["ohc_700m", "time"])
                 .set_index("time")["ohc_700m"]
                 .resample("ME").mean()
                 .dropna())

    if len(monthly) < 13:
        fig = go.Figure()
        fig.update_layout(title="Not enough monthly data for decomposition (need ≥ 13 months)")
        return _apply_theme(fig)

    trend    = monthly.rolling(12, center=True, min_periods=6).mean()
    seasonal = monthly - trend
    residual = monthly - trend - seasonal.groupby(seasonal.index.month).transform("mean")

    fig = make_subplots(
        rows=4, cols=1,
        subplot_titles=["Observed OHC 0-700m",
                        "Long-term Trend (12-month rolling)",
                        "Seasonal Signal",
                        "Residual"],
        shared_xaxes=True,
        vertical_spacing=0.07,
    )

    def add_line(series, row, color, fill=False):
        trace = go.Scatter(
            x=series.index, y=series.values,
            mode="lines",
            line=dict(color=color, width=1.5),
            fill="tozeroy" if fill else None,
            fillcolor=f'rgba{tuple(int(color[i:i+2], 16) for i in (1, 3, 5)) + (0.1,)}' if fill else None,
            showlegend=False,
            hovertemplate="%{x|%Y-%m}<br>%{y:.2e} J/m²<extra></extra>",
        )
        fig.add_trace(trace, row=row, col=1)

    add_line(monthly,  1, TEAL,  fill=True)
    add_line(trend,    2, AMBER)
    add_line(seasonal, 3, BLUE,  fill=True)
    add_line(residual, 4, RED,   fill=True)

    # Add zero line to seasonal and residual
    for row in [3, 4]:
        fig.add_hline(y=0, line=dict(color=GHOST, width=1, dash="dash"), row=row, col=1)

    fig.update_yaxes(title_text="J/m²", tickformat=".1e")
    fig.update_layout(
        title="Ocean Heat Content 0-700m · Seasonal Decomposition",
        height=680,
    )
    return _apply_theme(fig)


# ══════════════════════════════════════════════════════════════
# A7. CLIMATE INDEX CROSS-CORRELATION MATRIX
# ══════════════════════════════════════════════════════════════

def plot_climate_correlation_matrix(df_mhw=None, max_lag_days=90):
    """
    Heatmap of Pearson correlations between ENSO, IOD, PDO and MHW metrics
    at various lag offsets (0 to max_lag_days).

    Positive lag = climate index LEADS the MHW metric.

    Returns: plotly Figure
    """
    if df_mhw is None:
        df_mhw = pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))

    df = df_mhw.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").set_index("date")

    climate_vars = ["enso", "dmi", "pdo"]
    mhw_vars     = ["max_intensity", "mean_intensity", "frac_mhw"]
    lags         = list(range(0, max_lag_days + 1, 15))  # 0, 15, 30, ... days

    # Build correlation matrix: rows = climate var × lag, cols = MHW metric
    row_labels = []
    corr_matrix = []

    for cvar in climate_vars:
        for lag in lags:
            row_labels.append(f"{cvar} lag {lag}d")
            row_corrs = []
            for mvar in mhw_vars:
                try:
                    c = df[cvar].shift(lag).corr(df[mvar])
                    row_corrs.append(round(c, 3) if not np.isnan(c) else 0.0)
                except Exception:
                    row_corrs.append(0.0)
            corr_matrix.append(row_corrs)

    z = np.array(corr_matrix)

    fig = go.Figure(go.Heatmap(
        z=z,
        x=["Max Intensity", "Mean Intensity", "Ocean Fraction"],
        y=row_labels,
        colorscale=[
            [0.0,  "#0a3d6b"],
            [0.25, BLUE],
            [0.5,  BG_MID],
            [0.75, AMBER],
            [1.0,  RED],
        ],
        zmid=0, zmin=-1, zmax=1,
        colorbar=dict(title="Pearson r", tickfont=dict(color=ICE_DIM, size=9)),
        text=np.round(z, 2),
        texttemplate="%{text}",
        textfont=dict(size=9, color=ICE),
        hovertemplate="Climate: %{y}<br>MHW Metric: %{x}<br>r = %{z:.3f}<extra></extra>",
    ))

    fig.update_layout(
        title="Climate Index vs MHW Metrics · Lag Correlation Matrix",
        xaxis_title="MHW Variable",
        yaxis_title="Climate Index (with Lag)",
        height=max(400, 30 * len(row_labels)),
    )
    return _apply_theme(fig)


# ══════════════════════════════════════════════════════════════
# A8. WIND STRESS VECTOR FIELD
# ══════════════════════════════════════════════════════════════

def plot_wind_stress_vectors(time_idx=0, stride=8):
    """
    Quiver-style wind stress vector plot over the Indian Ocean.
    Background = wind stress magnitude; arrows = direction.

    Args:
        time_idx : which timestep to display (default 0 = first)
        stride   : spatial stride for arrow density (default 8)

    Returns: plotly Figure
    """
    try:
        ds = xr.open_zarr(RESULTS["wind_stress"])
    except Exception as e:
        fig = go.Figure()
        fig.update_layout(title=f"Wind stress data unavailable: {e}")
        return _apply_theme(fig)

    # Load magnitude and components
    tau_mag = ds["tau_mag"].isel(time=time_idx).values
    try:
        tau_x = ds["tau_x"].isel(time=time_idx).values
        tau_y = ds["tau_y"].isel(time=time_idx).values
    except Exception:
        tau_x = tau_y = None

    lats = ds["latitude"].values if "latitude" in ds.coords else ds["lat"].values
    lons = ds["longitude"].values if "longitude" in ds.coords else ds["lon"].values
    date_str = str(ds.time.values[time_idx])[:10]
    ds.close()

    LON, LAT = np.meshgrid(lons, lats)

    fig = go.Figure()

    # Background magnitude heatmap
    fig.add_trace(go.Heatmap(
        z=tau_mag,
        x=lons, y=lats,
        colorscale=[[0, BG], [0.4, TEAL_DIM], [0.7, TEAL], [1.0, ICE]],
        colorbar=dict(title="τ (N/m²)", tickfont=dict(color=ICE_DIM, size=9)),
        opacity=0.85,
        hovertemplate="Lat: %{y:.1f}° | Lon: %{x:.1f}°<br>|τ|: %{z:.4f} N/m²<extra></extra>",
    ))

    # Wind arrows (sampled)
    if tau_x is not None and tau_y is not None:
        xs = lons[::stride]
        ys = lats[::stride]
        tx = tau_x[::stride, ::stride]
        ty = tau_y[::stride, ::stride]
        mag_s = np.sqrt(tx**2 + ty**2)
        # Normalise arrow length
        norm = np.where(mag_s > 0, mag_s, 1)
        scale = 1.5
        ux = tx / norm * scale
        uy = ty / norm * scale

        for i in range(len(ys)):
            for j in range(len(xs)):
                if np.isnan(ux[i, j]) or np.isnan(uy[i, j]):
                    continue
                x0, y0 = xs[j], ys[i]
                x1 = x0 + ux[i, j]
                y1 = y0 + uy[i, j]
                arrow_intensity = float(mag_s[i, j])
                fig.add_annotation(
                    x=x1, y=y1, ax=x0, ay=y0,
                    xref="x", yref="y", axref="x", ayref="y",
                    showarrow=True, arrowhead=2, arrowsize=1,
                    arrowwidth=1,
                    arrowcolor=TEAL if arrow_intensity < 0.05 else AMBER,
                )

    fig.update_layout(
        title=f"Wind Stress Field · {date_str}",
        xaxis_title="Longitude",
        yaxis_title="Latitude",
        height=480,
    )
    return _apply_theme(fig)


# ══════════════════════════════════════════════════════════════
# A9. MLD vs THERMOCLINE SCATTER
# ══════════════════════════════════════════════════════════════

def plot_mld_thermocline_scatter(df_argo=None, max_points=4000):
    """
    Scatter plot of MLD vs thermocline depth per ARGO profile.
    Color = SST. Diagonal = MLD == thermocline (physics boundary).
    Points above diagonal are physics-inconsistent.

    Returns: plotly Figure
    """
    if df_argo is None:
        df_argo = pd.read_parquet(os.path.join(RESULTS_DIR, "profile_uncertainty.parquet"))

    df = df_argo.dropna(subset=["mld", "thermocline", "sst_argo"]).copy()
    if len(df) > max_points:
        df = df.sample(max_points, random_state=42)

    consistent = df["mld"] < df["thermocline"]
    max_depth  = max(df["thermocline"].max(), df["mld"].max()) * 1.05

    fig = go.Figure()

    # Diagonal reference line
    fig.add_trace(go.Scatter(
        x=[0, max_depth], y=[0, max_depth],
        mode="lines",
        line=dict(color=GHOST, width=1.5, dash="dot"),
        name="MLD = Thermocline",
        hoverinfo="skip",
    ))

    # Physics-consistent (MLD < thermocline)
    sub_ok = df[consistent]
    fig.add_trace(go.Scatter(
        x=sub_ok["thermocline"].values,
        y=sub_ok["mld"].values,
        mode="markers",
        marker=dict(
            size=4,
            color=sub_ok["sst_argo"].values,
            colorscale="RdBu_r",
            colorbar=dict(
                title="SST (°C)",
                tickfont=dict(color=ICE_DIM, size=9),
                x=1.02,
            ),
            opacity=0.6,
            cmin=df["sst_argo"].quantile(0.05),
            cmax=df["sst_argo"].quantile(0.95),
        ),
        name=f"Consistent ({len(sub_ok):,})",
        hovertemplate=(
            "Thermocline: %{x:.1f} dbar<br>"
            "MLD: %{y:.1f} dbar<br>"
            "SST: %{marker.color:.2f}°C<extra></extra>"
        ),
    ))

    # Physics-inconsistent (MLD ≥ thermocline)
    sub_bad = df[~consistent]
    if len(sub_bad) > 0:
        fig.add_trace(go.Scatter(
            x=sub_bad["thermocline"].values,
            y=sub_bad["mld"].values,
            mode="markers",
            marker=dict(size=5, color=RED, symbol="x", opacity=0.8),
            name=f"Inconsistent ({len(sub_bad):,})",
            hovertemplate=(
                "Thermocline: %{x:.1f} dbar<br>"
                "MLD: %{y:.1f} dbar<br>"
                "<b>Physics inconsistent</b><extra></extra>"
            ),
        ))

    pass_rate = 100 * len(sub_ok) / len(df)
    fig.update_layout(
        title=f"MLD vs Thermocline Depth · Physics Consistency {pass_rate:.1f}% pass",
        xaxis_title="Thermocline Depth (dbar)",
        yaxis_title="Mixed Layer Depth (dbar)",
        height=480,
    )
    return _apply_theme(fig)


# ══════════════════════════════════════════════════════════════
# A10. TREND REGRESSION PLOT
# ══════════════════════════════════════════════════════════════

def plot_trend_regression(df_argo=None, df_trends=None, variable="SST anomaly"):
    """
    For a chosen trend variable, plot:
      - The actual timeseries (monthly mean)
      - The fitted linear regression line
      - 95% confidence band

    Args:
        df_argo   : profile_uncertainty parquet (for MLD, OHC)
        df_trends : trends.parquet
        variable  : one of "SST anomaly", "OHC_700m", "MLD", "Qnet"

    Returns: plotly Figure
    """
    if df_argo is None:
        df_argo = pd.read_parquet(os.path.join(RESULTS_DIR, "profile_uncertainty.parquet"))
    if df_trends is None:
        df_trends = pd.read_parquet(os.path.join(RESULTS_DIR, "trends.parquet"))

    df_argo["time"] = pd.to_datetime(df_argo["time"], errors="coerce")

    # Source timeseries per variable
    source_map = {
        "SST anomaly": ("sst_argo",   "SST (°C)", AMBER),
        "OHC_700m":    ("ohc_700m",   "OHC J/m²", "#BA7517"),
        "MLD":         ("mld",        "MLD (dbar)", BLUE),
    }

    if variable in source_map:
        col, ylabel, color = source_map[variable]
        series = (df_argo.dropna(subset=[col, "time"])
                         .set_index("time")[col]
                         .resample("ME").mean()
                         .dropna())
    else:
        fig = go.Figure()
        fig.update_layout(title=f"Variable '{variable}' not available for regression plot")
        return _apply_theme(fig)

    if len(series) < 4:
        fig = go.Figure()
        fig.update_layout(title="Not enough data points for regression")
        return _apply_theme(fig)

    # Fit linear regression
    x_num = np.arange(len(series), dtype=float)
    coeffs = np.polyfit(x_num, series.values, 1)
    fitted = np.polyval(coeffs, x_num)

    # 95% confidence band
    residuals = series.values - fitted
    std_err   = np.std(residuals)
    t_crit    = 1.96
    upper     = fitted + t_crit * std_err
    lower     = fitted - t_crit * std_err

    # R² from trends parquet
    tr_row = df_trends[df_trends["variable"] == variable]
    r2_str = f"R²={float(tr_row['r2'].values[0]):.3f}" if len(tr_row) > 0 else ""
    slope_per_yr = coeffs[0] * 12  # monthly slope → per year

    fig = go.Figure()

    # Confidence band
    fig.add_trace(go.Scatter(
        x=list(series.index) + list(series.index[::-1]),
        y=list(upper) + list(lower[::-1]),
        fill="toself",
        fillcolor=f'rgba{tuple(int(color[i:i+2], 16) for i in (1, 3, 5)) + (0.1,)}',
        line=dict(color="rgba(0,0,0,0)"),
        name="95% CI",
        hoverinfo="skip",
    ))

    # Fitted line
    fig.add_trace(go.Scatter(
        x=series.index, y=fitted,
        mode="lines",
        line=dict(color=color, width=2, dash="dash"),
        name=f"Trend: {slope_per_yr:+.4f}/yr  {r2_str}",
        hovertemplate="%{x|%Y-%m}<br>Fitted: %{y:.4f}<extra></extra>",
    ))

    # Observed data
    fig.add_trace(go.Scatter(
        x=series.index, y=series.values,
        mode="lines+markers",
        line=dict(color=ICE_DIM, width=1),
        marker=dict(size=3, color=color),
        name="Observed (monthly mean)",
        hovertemplate="%{x|%Y-%m}<br>Observed: %{y:.4f}<extra></extra>",
    ))

    fig.update_layout(
        title=f"{variable} · Long-term Trend · Indian Ocean 2020-2025",
        xaxis_title="Date",
        yaxis_title=ylabel,
        height=420,
    )
    return _apply_theme(fig)


# ══════════════════════════════════════════════════════════════
# CONVENIENCE: load all data and return dict of figures
# ══════════════════════════════════════════════════════════════

def build_all_plots():
    """
    Pre-build all plots that don't require Zarr (fast parquet-only plots).
    Returns a dict {name: fig} that can be cached in Streamlit session_state.
    """
    figs = {}
    try:
        df_mhw  = pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))
        df_argo = pd.read_parquet(os.path.join(RESULTS_DIR, "profile_uncertainty.parquet"))
        df_tr   = pd.read_parquet(os.path.join(RESULTS_DIR, "trends.parquet"))

        figs["mhw_calendar"]    = plot_mhw_calendar(df_mhw)
        figs["phase_composite"] = plot_mhw_phase_composite(df_mhw)
        figs["corr_matrix"]     = plot_climate_correlation_matrix(df_mhw)
        figs["argo_map_sst"]    = plot_argo_scatter_map(df_argo, color_by="sst_argo")
        figs["argo_map_mld"]    = plot_argo_scatter_map(df_argo, color_by="mld")
        figs["argo_map_ohc"]    = plot_argo_scatter_map(df_argo, color_by="ohc_700m")
        figs["mld_scatter"]     = plot_mld_thermocline_scatter(df_argo)
        figs["ohc_decomp"]      = plot_ohc_decomposition(df_argo)
        for var in ["SST anomaly", "OHC_700m", "MLD"]:
            figs[f"trend_{var}"] = plot_trend_regression(df_argo, df_tr, variable=var)
    except Exception as e:
        print(f"build_all_plots error: {e}")
    return figs
