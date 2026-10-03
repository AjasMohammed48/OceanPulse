                     MULTI-SOURCE DATA
                            │
            ┌───────────────┼────────────────┐
            │               │                │
          OISST            ARGO             ERA5
            │               │                │
            └───────────────┼────────────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   DATA PROCESSING   │
                 │                     │
                 │ NumPy / Pandas      │
                 │ xarray / Dask       │
                 │ Zarr / Parquet      │
                 │                     │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ OCEAN INTELLIGENCE  │
                 │                     │
                 │ Ocean Physics       │
                 │ Anomaly Detection   │
                 │ Trend Analysis      │
                 │ Uncertainty         │
                 │                     │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │      FastAPI        │
                 │      Backend        │
                 └──────────┬──────────┘
                            │
                 ┌──────────┴──────────┐
                 │                     │
                 ▼                     ▼
        ┌─────────────────┐    ┌─────────────────┐
        │ Next.js / React │    │ Ollama / Local  │
        │      UI         │    │       AI        │
        └─────────────────┘    └─────────────────┘
