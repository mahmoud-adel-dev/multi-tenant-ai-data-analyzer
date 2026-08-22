/**
 * MVP acceptance verification against the persisted nested-sales payload.
 * Usage: node --env-file-if-exists=.env.local scripts/verify-mvp.mjs [datasetId]
 */
import mongoose from "mongoose";

const datasetId = process.argv[2];
await mongoose.connect(process.env.MONGODB_URI);
const runs = mongoose.connection.db.collection("analysisruns");
const query = datasetId ? { datasetId: new mongoose.Types.ObjectId(datasetId) } : {};
const run = await runs.find(query, { sort: { createdAt: -1 }, limit: 1 }).toArray();
if (!run.length) { console.error("no run found"); process.exit(1); }
const P = run[0].payload;

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const cols = new Map(P.profile.columns.map((c) => [c.name, c]));
const byId = new Map(P.metrics.map((m) => [m.metricId, m]));

console.log("\n== 2/6. NESTED JSON + SCHEMA INFERENCE ==");
check("leaf paths discovered", cols.has("pricing.total") && cols.has("customer.city") && cols.has("metrics.profit_margin"));
check("parent structs gone", !cols.has("pricing") && !cols.has("customer"));
check("leafFieldCount == columnCount", P.profile.leafFieldCount === P.profile.columnCount, `${P.profile.columnCount}`);
check("nestedFieldCount > 0", P.profile.nestedFieldCount > 0, `${P.profile.nestedFieldCount} groups`);
check("every leaf has semanticType", P.profile.columns.every((c) => c.semanticType !== null && c.semanticType !== undefined));

console.log("\n== 4/9. QUALITY AT LEAF LEVEL ==");
check("missing% > 0 (nested gaps counted)", P.profile.missingCellPercentage > 0, `${P.profile.missingCellPercentage}%`);
check("quality NOT 100", P.profile.qualityScore < 100, `${P.profile.qualityScore}/100`);
const segNull = cols.get("customer.segment").nullPercentage;
const marginNull = cols.get("metrics.profit_margin").nullPercentage;
check("segment nulls present", segNull > 0.8 && segNull < 4.5, `${segNull}%`);
check("margin nulls ~6%", Math.abs(marginNull - 6) < 0.8, `${marginNull}%`);
const findingCols = new Set(P.qualityFindings.map((f) => f.column));
check("findings reference nested leaves", [...findingCols].some((c) => c && c.includes(".")));
check("out_of_range_percentage flagged (discount_rate=25)", P.qualityFindings.some((f) => f.issueType === "out_of_range_percentage" && f.column === "pricing.discount_rate"));

console.log("\n== 5/7. SEMANTICS ==");
const sem = (k) => cols.get(k)?.semanticType;
check("pricing.total → revenue", sem("pricing.total") === "revenue", sem("pricing.total"));
check("customer.region → location", sem("customer.region") === "location");
check("payment.status → status", sem("payment.status") === "status");
check("order_date → temporal", sem("order_date") === "temporal");
check("sale_rep → person_name", sem("sale_rep") === "person_name", sem("sale_rep"));
check("order_id → order_ref", sem("order_id") === "order_ref");
check("confidence attached", (cols.get("pricing.total").semanticConfidence ?? 0) >= 0.8);

console.log("\n== 8/10/20. SALES KPIs + PROVENANCE ==");
const rev = byId.get("total_revenue");
const orders = byId.get("total_orders");
const customers = byId.get("unique_customers");
const aov = byId.get("avg_order_value");
check("total_revenue SUM(pricing.total)", rev?.provenance.sourceColumns[0] === "pricing.total" && rev.provenance.aggregation === "SUM");
check("revenue excludes only null rows", Math.abs(rev.provenance.rowsUsed - 98795) < 60 && rev.provenance.nullsExcluded > 1100,
      `used=${rev.provenance.rowsUsed} excl=${rev.provenance.nullsExcluded}`);
check("orders COUNT_DISTINCT(order_id)", orders?.value === 100000, `${orders?.value}`);
check("customers distinct", customers?.value > 0 && customers.value <= 12000, `${customers?.value}`);
check("AOV = revenue/orders", Math.abs(aov.value - rev.value / orders.value) < 0.01, `${aov.value}`);
check("cancellation_rate present", typeof byId.get("cancellation_rate")?.value === "number", `${byId.get("cancellation_rate")?.value}%`);
const gm = byId.get("gross_margin_avg");
check("gross_margin computed when margin data exists", gm?.provenance.aggregation === "MEAN" && gm.provenance.sourceColumns[0] === "metrics.profit_margin", `${gm?.value}%`);
check("units KPI present", typeof byId.get("total_units")?.value === "number", `${byId.get("total_units")?.value}`);

console.log("\n== 11. TREND CONSISTENCY ==");
let trendsOk = true, trendDetail = "";
for (const t of P.trends.slice(0, 3)) {
  const pctInLabel = t.changePercentage !== null && t.directionLabel.includes(`${t.changePercentage >= 0 ? "+" : ""}${t.changePercentage.toFixed(1)}%`);
  const stableOnlyIfSmall = t.direction !== "stable" || Math.abs(t.changePercentage ?? 99) <= 5.5;
  if (!pctInLabel || !stableOnlyIfSmall) { trendsOk = false; trendDetail = `${t.metricColumn}:${t.directionLabel}`; break; }
}
check("directionLabel cites measured %; stable≤±5%", trendsOk, trendDetail);
check("volatilityCoefficient present", P.trends.every((t) => typeof t.volatilityCoefficient === "number"));

console.log("\n== 12/13. ANOMALIES + FORECAST ==");
check("classification field populated", P.anomalies.length === 0 || P.anomalies.every((a) => a.classification in { statistical_outlier: 1, business_notable: 1 }));
check("forecast withheld-or-validated", P.forecasts.every((f) => f.fitMetrics.baselineMape != null && f.fitMetrics.skillScore > 0),
      P.forecasts.map((f) => `${f.metricColumn}:mape${f.fitMetrics.mape}/base${f.fitMetrics.baselineMape}`).join(" ") || "(none withheld note in warnings)");
check("continuity: prediction starts after last complete period",
      P.forecasts.every((f) => f.predictions[0]?.period !== f.history[f.history.length - 1]?.period));
check("plan anomalyMethods chosen", (P.analysisPlan?.anomalyMethods?.length ?? 0) >= 1, (P.analysisPlan?.anomalyMethods ?? []).join("+"));

console.log("\n== 38. OBSERVABILITY ==");
const st = P.executionStats.stageTimingsMs ?? {};
check("stageTimingsMs recorded", Object.keys(st).length >= 6, Object.entries(st).map(([k, v]) => `${k}:${v}ms`).join(" "));

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
