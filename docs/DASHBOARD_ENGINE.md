# Dashboard Engine

## Planning (deterministic, Python)

`analytics-service/app/visualization/planner.py` emits a validated
`DashboardPlan` — pages of typed widgets whose `data` payloads are computed
from the verified analysis. Chart selection follows fixed rules:

| Signals | Widget |
|---|---|
| KPI aggregates | KPI cards (totals first, provenance tooltip) |
| time + numeric | area/line + moving average overlay |
| category × numeric | bar; **pie only when ≤ 6 categories**, all positive, and no sliver < 2% of total |
| numeric distribution | histogram |
| two correlated numerics | scatter (r shown; "correlation ≠ causation" caption) |
| ≥ 3 pairwise correlations | correlation heatmap |
| validated forecast | history + projection line with uncertainty band |
| segments | segment-size bars (RFM or k-means) |
| flagged outliers | anomaly table w/ severity dots + explanations |
| ranked aggregates | table preserving exact ordering |

Every widget records a `selectionReason` (shown in UI) so users can see *why*
that chart was chosen. High-cardinality pies and misleading visuals are
explicitly suppressed by rule, not by model judgment.

## Rendering (Next.js)

`src/components/dashboard/charts/` renders the plan:

- `DashboardRenderer.tsx` — typed widget dispatcher; each widget type is its
  own component (React hooks stay unconditional); wide widgets span 2 grid
  columns on desktop.
- `options.ts` — pure widget→ECharts option builders mirroring the Python
  payload shapes.
- `useECharts.ts` — lazy client init, ResizeObserver, dark-mode re-theming.

Widgets are accessible (`role="img"` charts, semantic tables, aria-labeled
quality meter). Data-quality warnings surface as a text widget on every
dashboard.

The renderer consumes only validated plans: the worker Zod-validates
`dashboardPlan` before persistence, so the client can trust widget types and
payload shapes.
