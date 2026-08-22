# Python Analytics Engine

Location: `analytics-service/` — FastAPI + Pydantic v2 + Polars + NumPy/SciPy +
scikit-learn + statsmodels. Runs as an isolated compute plane.

## Endpoints

| Route | Purpose |
|---|---|
| `POST /v1/analyze` | Full pipeline: parse → profile → analyze → dashboard plan + report plan (contract payload) |
| `POST /v1/profile` | Profiling only |
| `GET /healthz`, `GET /readyz` | Liveness/readiness |

Bearer-token auth when `ANALYTICS_API_TOKEN` is set (`hmac.compare_digest`).

## Security limits

- Upload size ceiling, row ceiling, column ceiling (configurable env).
- XLSX: ZIP-bomb guard — sheet count ≤ 50 and total cells ≤ 5,000,000 enforced
  during streaming read; legacy `.xls` explicitly unsupported.
- CSV: row-count pre-check before parse; encoding fallback with detection.
- All limits fail closed with typed errors mapped to HTTP codes.

## Pipeline stages

1. **Load** (`core/loader.py`) — CSV/TSV/JSON/XLSX → Polars DataFrame.
2. **Normalize** (`profiling/normalize.py`) — column slugification, semantic
   vocabulary matching (revenue, customer, order_date, region…).
3. **Profile** (`profiling/profiler.py`) — per-column type inference (numeric,
   date, categorical, identifier, boolean), nulls/uniques/percentiles/
   histograms/top-values/date-ranges; dataset-level duplicates, missingness,
   quality score; rule-scored **domain inference** with evidence + confidence.
4. **Quality findings** — structured issues (severity, column, affected rows,
   remediation suggestion). No automatic mutation of user data.
5. **KPIs** (`statistics/kpi.py`) — deterministic SUM/MEAN/MEDIAN/COUNT over
   semantically-selected measures; every metric carries provenance
   (aggregation + source columns) and the dataset version.
6. **Trends** (`statistics/time_series.py`) — date-column detection incl.
   string-date parsing; granularity selection; direction via linear slope;
   seasonality proxy via autocorrelation at expected cycle lag.
7. **Correlations** (`statistics/correlation.py`) — Pearson, upgraded to
   Spearman when rank correlation dominates; weak pairs filtered; NaN guards.
8. **Outliers** (`ml/outliers.py`) — Tukey IQR + median/MAD robust z-score on
   measures; Isolation Forest only for ≥200 rows × 3–20 clean features.
9. **Segmentation** (`ml/segmentation.py`) — RFM quintiles when customer/date/
   amount semantics exist; guarded k-means (n≥30, bounded k search,
   silhouette ≥ 0.25 else skipped with warning).
10. **Forecasting** (`forecasting/engine.py`) — Holt exponential smoothing with
    damped trend; chronological holdout validation; forecasts withheld when
    MAPE > 60% or < 12 periods; uncertainty bands + explicit warnings.
11. **Dashboard planning** (`visualization/planner.py`) — deterministic chart
    rules (see docs/DASHBOARD_ENGINE.md).
12. **Report planning** (`reporting/builder.py`) — sectioned report from
    verified numbers incl. methodology + provenance appendix.

## Contract

Output mirrors `src/types/analytics.ts`. The Node worker re-validates every
payload with Zod before persistence — engine output is never trusted blindly.

## Tests

`pytest` suite covers loaders, profiling, domain inference, KPI math vs manual
computation, correlations, outliers, RFM/k-means guards, forecasting refusal
behavior, full-pipeline determinism, malformed inputs and API auth.
