# Report Engine

## Structure

Reports are generated deterministically by
`analytics-service/app/reporting/builder.py` into a `ReportPlan` — an ordered
list of sections containing typed blocks (paragraph, bullets, metrics, table,
warning). Section selection adapts to the dataset:

1. Executive Summary (always)
2. Dataset Overview + column summary table (always)
3. Data Quality findings table (always)
4. Key KPIs with provenance grid (always)
5. Major Trends (when time-series detected)
6. Performance Drivers (when correlations/segments exist)
7. Top & Bottom Performers (when a dimension×measure pair exists)
8. Anomalies & Outliers (when outliers flagged)
9. Correlations (when reported pairs exist)
10. Forecasts (only when forecasts passed validation)
11. Segmentation (RFM/k-means when produced)
12. Risks & Limitations (always; sample-size and forecast caveats)
13. Methodology (always)
14. Appendix: full metric provenance table (always)

## Trust rules

- Every number originates from the verified engine payload.
- The optional AI narrative is **prepended only to the Executive Summary** and
  visually labeled "AI Executive Narrative (generated over verified results)".
- The report footer states that no language model computed any figure.

## Rendering & export

`src/app/(dashboard)/dashboard/datasets/[id]/ReportView.tsx` renders sections
with print-optimized CSS (`@media print` in globals.css): the sidebar/chrome
are hidden and the article becomes the printable surface → **Export as PDF**
uses the browser's print-to-PDF for faithful, paginated output.

Server-side PDF generation (headless Chromium) is the documented upgrade path;
it was not bundled to avoid shipping a browser runtime in the web image.

## Storage

`Report` documents persist `plan` (the validated ReportPlan), linked to their
`AnalysisRun` + `Dataset`, org-scoped and indexed for listing.
