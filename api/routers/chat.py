# routers/chat.py
# POST /api/chat

import os
import sys
import json
import re
import base64
import io
import numpy as np
import pandas as pd
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

sys.path.insert(0, r"C:\PROJECT")
from oceanpulse.config import RESULTS_DIR
from oceanpulse.anomaly import enso_phase, iod_phase, pdo_phase, load_indices

router = APIRouter()

# ── Ollama settings ────────────────────────────────────────────
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL    = "llama3.2:latest"   # ← change here if you switch models

# ── Models ─────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str    # "user" or "assistant"
    content: str

class UploadedFile(BaseModel):
    name: str
    content_base64: str
    mime_type: str

class ChatRequest(BaseModel):
    question: str
    history: List[ChatMessage] = []
    files: Optional[List[UploadedFile]] = None

class PlotData(BaseModel):
    x: object
    y: float

class ChatPlot(BaseModel):
    type: str      # "line" | "bar" | "area"
    title: str
    x_label: str
    y_label: str
    data: List[dict]

class ChatResponse(BaseModel):
    answer: str
    plots: Optional[List[ChatPlot]] = None
    sources: Optional[List[str]] = None

# ── Build system context from parquet data ─────────────────────
def build_ocean_context() -> str:
    lines = ["You are OceanPulse, an expert AI assistant for Indian Ocean science."]
    lines.append("You have access to real observational data from the Indian Ocean (2020-2025).")
    lines.append("Always explain things in plain language that a non-scientist can understand.")
    lines.append("When relevant, include charts in your response by outputting a JSON block.")
    lines.append("")
    lines.append("=== CURRENT OCEAN DATA ===")

    # MHW status
    try:
        df_mhw = pd.read_parquet(os.path.join(RESULTS_DIR, "mhw_timeseries.parquet"))
        df_mhw["date"] = pd.to_datetime(df_mhw["date"])
        latest = df_mhw.sort_values("date").iloc[-1]
        status = "ACTIVE" if latest["is_mhw"] else "not active"
        cat_map = {0: "none", 1: "Moderate", 2: "Strong", 3: "Severe", 4: "Extreme"}
        lines.append(f"Marine Heatwave: {status}")
        lines.append(f"Category: {cat_map.get(int(latest.get('mhw_category', 0)), 'unknown')}")
        lines.append(f"Area affected: {float(latest.get('frac_mhw', 0)) * 100:.1f}% of Indian Ocean")
        lines.append(f"Mean intensity: {float(latest.get('mean_intensity', 0)):.2f}C above threshold")
        lines.append(f"Latest date: {str(latest['date'])[:10]}")
    except Exception:
        lines.append("Marine Heatwave: data not available")

    # Climate indices
    try:
        idx = load_indices()
        last = idx.iloc[-1]
        enso_v = float(last["enso"])
        dmi_v  = float(last["dmi"])
        pdo_v  = float(last["pdo"])
        lines.append(f"ENSO index: {enso_v:.2f} ({enso_phase(enso_v)})")
        lines.append(f"IOD (DMI) index: {dmi_v:.2f} ({iod_phase(dmi_v)})")
        lines.append(f"PDO index: {pdo_v:.2f} ({pdo_phase(pdo_v)})")
    except Exception:
        lines.append("Climate indices: data not available")

    # Trends
    try:
        df_trends = pd.read_parquet(os.path.join(RESULTS_DIR, "trends.parquet"))
        for _, row in df_trends.iterrows():
            slope = float(row.get("slope_per_year", 0))
            r2    = float(row.get("r2", 0))
            lines.append(f"Trend - {row['variable']}: {slope:+.4f}/year (R2={r2:.3f})")
    except Exception:
        pass

    # Recent Argo stats
    try:
        argo_path = os.path.join(RESULTS_DIR, "argo_all_physics.parquet")
        df_argo = pd.read_parquet(argo_path)
        df_argo["time"] = pd.to_datetime(df_argo["time"], errors="coerce")
        recent = df_argo[df_argo["time"] >= df_argo["time"].max() - pd.Timedelta(days=90)]
        if not recent.empty:
            lines.append(f"Recent Argo profiles (last 90 days): {len(recent)}")
            if "sst_argo" in recent.columns:
                lines.append(f"Mean SST from Argo: {recent['sst_argo'].mean():.2f}C")
            if "mld" in recent.columns:
                lines.append(f"Mean Mixed Layer Depth: {recent['mld'].mean():.1f} m")
    except Exception:
        pass

    lines.append("")
    lines.append("=== PLOT INSTRUCTIONS ===")
    lines.append("If a chart would help answer the question, include a JSON block in your response.")
    lines.append("The JSON block must look exactly like this:")
    lines.append('```json')
    lines.append('[{')
    lines.append('  "type": "line",')
    lines.append('  "title": "Chart title here",')
    lines.append('  "x_label": "X axis label",')
    lines.append('  "y_label": "Y axis label",')
    lines.append('  "data": [{"x": "2020", "y": 28.5}, {"x": "2021", "y": 28.9}]')
    lines.append('}]')
    lines.append('```')
    lines.append("type can be: line, bar, or area")
    lines.append("Only include the JSON block if a chart genuinely adds value.")
    lines.append("You can include multiple chart objects in the array.")

    return "\n".join(lines)


# ── Parse plots from AI response ──────────────────────────────
def extract_plots(text: str):
    pattern = r"```json\s*([\s\S]*?)```"
    matches = re.findall(pattern, text)
    plots = []
    clean = text

    for match in matches:
        try:
            raw = json.loads(match.strip())
            if isinstance(raw, list):
                for item in raw:
                    plots.append(ChatPlot(
                        type    = item.get("type", "line"),
                        title   = item.get("title", "Chart"),
                        x_label = item.get("x_label", "X"),
                        y_label = item.get("y_label", "Y"),
                        data    = item.get("data", []),
                    ))
            elif isinstance(raw, dict):
                plots.append(ChatPlot(
                    type    = raw.get("type", "line"),
                    title   = raw.get("title", "Chart"),
                    x_label = raw.get("x_label", "X"),
                    y_label = raw.get("y_label", "Y"),
                    data    = raw.get("data", []),
                ))
            clean = re.sub(r"```json\s*" + re.escape(match) + r"\s*```", "", clean).strip()
        except json.JSONDecodeError:
            pass

    return clean, plots if plots else None


# ── Build data summary for an uploaded file ───────────────────
def summarise_uploaded_file(uf: UploadedFile) -> str:
    try:
        raw = base64.b64decode(uf.content_base64)
        if uf.name.endswith(".csv"):
            df = pd.read_csv(io.StringIO(raw.decode("utf-8")))
            summary = f"Uploaded file '{uf.name}': {len(df)} rows, columns: {list(df.columns)}\n"
            summary += df.head(5).to_string(index=False)
            return summary
        else:
            return f"Uploaded file '{uf.name}' ({uf.mime_type}) - binary file, cannot preview."
    except Exception as e:
        return f"Uploaded file '{uf.name}' - could not preview: {e}"


# ── Endpoint ───────────────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    """
    Send a question to the OceanPulse AI assistant (powered by Ollama / llama3.2).
    The assistant has full context of the current ocean data and will answer
    in plain language. If a chart would help, it will be included in the response.
    """
    try:
        system_prompt = build_ocean_context()

        # Ollama uses "system" as the first message in the messages array
        messages = [{"role": "system", "content": system_prompt}]

        for msg in request.history[-10:]:   # keep last 10 turns for context
            messages.append({"role": msg.role, "content": msg.content})

        # Add file summaries to the user question if files were attached
        question = request.question
        if request.files:
            file_summaries = [summarise_uploaded_file(f) for f in request.files]
            question = question + "\n\n" + "\n\n".join(file_summaries)

        messages.append({"role": "user", "content": question})

        # ── Call Ollama ────────────────────────────────────────
        payload = {
            "model": OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
        }

        try:
            response = httpx.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json=payload,
                timeout=120.0,
            )
            response.raise_for_status()
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail="Ollama is not running. Start it with: ollama serve"
            )

        data = response.json()
        raw_answer = data["message"]["content"]

        clean_answer, plots = extract_plots(raw_answer)

        return ChatResponse(
            answer  = clean_answer,
            plots   = plots,
            sources = ["NOAA OISST", "CMEMS Argo Float Profiles", "ERA5 Wind Reanalysis"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")