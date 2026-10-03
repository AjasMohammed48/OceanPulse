# OceanPulse Data

The complete scientific datasets are intentionally **not stored in this Git repository** because the raw and processed files are large.

The local project is expected to contain data similar to:

```text
Data/
├── Argo/
├── OISST_INDIAN_OCEAN/
├── Results/
├── SLA_INDIAN_OCEAN/
├── Temp/
├── wind/
├── Zarr_ready/
├── dmi.had.long.nc
├── ersstv5.pdo.dat
└── nina34.anom.nc
```

## Expected processed outputs

The application reads processed Zarr/Parquet assets from the data directory, including stores/results used for:

- SST
- SST anomaly
- Wind
- Heat flux
- Sea-level anomaly
- Climate indices
- Argo physics
- Marine heatwave time series
- Trends
- Uncertainty
- Seasonal climatology
- Basin metrics

