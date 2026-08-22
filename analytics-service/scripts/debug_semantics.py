"""Debug: semantic column mapping on the nested sales fixture."""
import sys, json
sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8")
from datetime import date, timedelta
import random

rng = random.Random(7)
recs = []
regions = ["North", "South", "East", "West"]
segments = ["Enterprise", "SMB", "Consumer"]
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
        "order_date": d.isoformat(),
        "customer": {"customer_id": f"CUST-{i % 120}", "segment": segments[i % 3], "region": regions[i % 4]},
        "product": {"name": f"Product {i % 12}", "category": ["Electronics", "Furniture"][i % 2], "unit_price": price},
        "pricing": {"subtotal": subtotal, "discount_rate": disc, "tax_amount": tax, "total": total},
        "payment": {"method": methods[i % 3] if False else "card", "status": statuses[i % 5]},
        "shipping": {"carrier": "Aramex", "delivery_days": 2 + i % 6, "cost": round(rng.uniform(10, 60), 2)},
        "quantity": qty,
    })

import polars as pl
from app.profiling.flatten import flatten_frame
from app.profiling.normalize import guess_semantic_columns
from app.profiling.profiler import profile_dataset

flat = flatten_frame(pl.DataFrame(recs))
df = flat.frame
print("guess_semantic_columns:", {k: v for k, v in guess_semantic_columns(df).items()})
profile, domain, findings, clean = profile_dataset(df, flattened_paths=flat.flattened_paths)
print("roles:", [(c.name, c.role, c.semanticType) for c in profile.columns])
