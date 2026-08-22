"""Engine smoke test: nested sales JSON through the full orchestrator."""
import sys, json
sys.path.insert(0, ".")
from datetime import date, timedelta
import random

rng = random.Random(7)
recs = []
regions = ["North", "South", "East", "West"]
cities = {"North": ["Alexandria"], "South": ["Aswan"], "East": ["Cairo"], "West": ["Giza"]}
segments = ["Enterprise", "SMB", "Consumer"]
methods = ["card", "cash", "wallet"]
statuses = ["completed", "completed", "completed", "cancelled", "returned"]

for i in range(400):
    d = date(2025, 1, 1) + timedelta(days=i % 180)
    qty = rng.randint(1, 10)
    price = round(rng.uniform(50, 800), 2)
    disc = round(rng.choice([0, 0, 0.05, 0.1, 0.2]), 2)
    subtotal = round(qty * price, 2)
    tax = round(subtotal * 0.14, 2)
    total = round(subtotal * (1 - disc) + tax, 2)
    recs.append({
        "order_id": f"ORD-{i:05d}",
        "order_date": (d.isoformat() if i % 40 else "not-a-date"),
        "customer": {
            "customer_id": f"CUST-{i % 120}",
            "segment": (None if i % 37 == 0 else segments[i % 3]),
            "region": regions[i % 4],
            "city": cities[regions[i % 4]][0],
        },
        "product": {"name": f"Product {i % 12}", "category": ["Electronics", "Furniture"][i % 2], "unit_price": price},
        "pricing": {"subtotal": subtotal, "discount_rate": disc, "tax_amount": tax, "total": (None if i % 53 == 0 else total)},
        "payment": {"method": methods[i % 3], "status": statuses[i % 5]},
        "shipping": {"carrier": "Aramex" if i % 2 else "DHL", "delivery_days": 2 + i % 6, "cost": round(rng.uniform(10, 60), 2)},
        "quantity": qty,
    })

from app.core.orchestrator import analyze

payload = analyze(json.dumps(recs).encode(), "nested_sales.json", "json", {})
print("domain:", payload["domain"]["domain"], payload["domain"]["confidence"])
print("quality:", payload["profile"]["qualityScore"], "missing%:", payload["profile"]["missingCellPercentage"])
print("leafFields:", payload["profile"]["columnCount"], "nestedGroups:", payload["profile"]["nestedFieldCount"])

plan = payload["analysisPlan"]
print("plan kpis available:", [k["key"] for k in plan["kpis"] if k["available"]])
print("plan unavailable:", [(k["key"], k["missingPaths"]) for k in plan["kpis"] if not k["available"]])

for m in payload["metrics"][:8]:
    p = m["provenance"]
    print(f"  {m['metricId']:22} = {m['value']} [{p['aggregation']} of {p['sourceColumns']}] rows={p.get('rowsUsed')} excl={p.get('nullsExcluded')}")

for t in payload["trends"]:
    print(f"  trend {t['metricColumn']}: {t['directionLabel']} vol={t.get('volatilityCoefficient')}")
    print("   insight:", t.get("insight", "")[:150])

anoms = payload["anomalies"]
print("anomalies:", len(anoms),
      "statistical:", sum(1 for a in anoms if a["classification"] == "statistical_outlier"),
      "business:", sum(1 for a in anoms if a["classification"] == "business_notable"))

print("forecast:", [(f["metricColumn"], f["fitMetrics"]) for f in payload["forecasts"]])
qf = sorted({f["issueType"] for f in payload["qualityFindings"]})
print("findings types:", qf)

# Verify report sections exist and trend text is consistent
report_keys = [s["key"] for s in payload["reportPlan"]["sections"]]
print("report sections:", report_keys)
for s in payload["reportPlan"]["sections"]:
    if s["key"] == "major_trends":
        for b in s["blocks"][:2]:
            print("  trend block:", b.get("text", "")[:160])

# Widget sanity
widgets = payload["dashboardPlan"]["pages"][0]["widgets"]
kpi_widget = next(w for w in widgets if w["type"] == "kpi")
print("sample kpi widget:", kpi_widget["title"], kpi_widget["data"].get("rowsUsed"), kpi_widget.get("insightText"))
