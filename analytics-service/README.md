# Python analytics service
> Deterministic compute plane: parsing, profiling, statistics, ML, forecasting, dashboard/report planning.

**Python computes. AI explains.** No LLM participates in any calculation here.

## Stack
- FastAPI + Pydantic v2 (typed API, strict contract)
- Polars (fast columnar processing), DuckDB-compatible patterns
- NumPy / SciPy / scikit-learn / statsmodels (statistics & guarded ML)

## Layout
```
app/
  api/          HTTP routes (/v1/analyze, /v1/profile, healthz)
  core/         config, secure file loading, exceptions, orchestrator
  schemas/      Analysis Result Contract (mirrors src/types/analytics.ts)
  profiling/    normalization + deterministic profiling + domain inference
  statistics/   KPIs w/ provenance, correlations, time-series trends
  ml/           outlier detection, RFM/k-means segmentation (guarded)
  forecasting/  holdout-validated Holt exponential smoothing
  visualization/ deterministic chart-selection -> DashboardPlan
  reporting/    section-based ReportPlan builder
tests/          pytest suite (deterministic fixtures)
```

## Run locally
```bash
cd analytics-service
pip install -e ".[dev]"
uvicorn app.main:app --port 8000 --reload
pytest
```

## Security limits
Row/column/cell/sheet ceilings enforced before parse; zip-bomb guards for XLSX;
bearer-token auth when `ANALYTICS_API_TOKEN` is set; size caps on uploads.

## Contract
The service returns the exact JSON contract in `src/types/analytics.ts`
(TS-side Zod re-validates every payload — engine output is never trusted blindly).
