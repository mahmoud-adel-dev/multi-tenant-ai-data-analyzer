"""Debug the nested sales fixture through flatten->profile."""
import sys
sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8")
import polars as pl

from app.profiling.flatten import flatten_frame
from app.profiling.profiler import profile_dataset

df = pl.DataFrame([
    {
        "order_id": f"O{i}",
        "order_date": f"2025-01-{(i % 28) + 1:02d}",
        "customer": {"customer_id": f"C{i % 10}", "region": ["East", "West"][i % 2]},
        "pricing": {"total": 100.0 + i, "discount_rate": 0.1},
        "payment": {"status": "completed" if i % 3 else "cancelled"},
        "quantity": 1 + i % 4,
    }
    for i in range(40)
])
flat = flatten_frame(df)
profile, domain, findings, clean = profile_dataset(flat.frame, flattened_paths=flat.flattened_paths)
print("domain:", domain.domain, domain.confidence)
for c in profile.columns:
    print(f"  {c.name:22} inferred={c.inferredType:11} role={c.role:10} sem={str(c.semanticType):12}/{c.semanticConfidence}")
