import sys
import os
sys.path.insert(0, r"C:\PROJECT")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import dashboard, chat, heatmap, heatwaves, trends, argo

app = FastAPI(
    title="OceanPulse API",
    description="Indian Ocean intelligence backend — marine heatwaves, Argo float profiles, long-term trends.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router,  prefix="/api/dashboard",  tags=["Dashboard"])
app.include_router(chat.router,       prefix="/api",             tags=["Chat"])
app.include_router(heatmap.router,    prefix="/api/heatmap",     tags=["Heatmap"])
app.include_router(heatwaves.router,  prefix="/api/heatwaves",   tags=["Heatwaves"])
app.include_router(trends.router,     prefix="/api/trends",      tags=["Trends"])
app.include_router(argo.router,       prefix="/api/argo",        tags=["Argo"])

@app.get("/health")
def health():
    from cache import cache_stats
    return {"status": "ok", "cache": cache_stats()}

@app.get("/")
def root():
    return {"message": "OceanPulse API is running. Visit /docs for the full API reference."}