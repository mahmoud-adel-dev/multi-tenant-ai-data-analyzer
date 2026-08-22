"""Shared deterministic fixtures."""
from __future__ import annotations

import io
from datetime import date, timedelta

import polars as pl
import pytest


def make_sales_csv(rows: int = 120, seed: int = 42) -> str:
    """Deterministic synthetic sales dataset with dates, categories, revenue."""
    import random

    rng = random.Random(seed)
    lines = ["order_id,order_date,customer,product,category,region,quantity,revenue"]
    products = [("Laptop", "Electronics"), ("Desk", "Furniture"), ("Chair", "Furniture"), ("Monitor", "Electronics"), ("Pen Set", "Stationery")]
    regions = ["North", "South", "East", "West"]
    base = date(2025, 1, 1)
    for i in range(rows):
        d = base + timedelta(days=i % 90)
        product, category = products[i % len(products)]
        qty = rng.randint(1, 10)
        revenue = round(qty * (100 + 40 * ((i * 7) % 13)) + i * 0.5, 2)
        lines.append(
            f"ORD-{1000 + i},{d.isoformat()},Customer_{i % 30},{product},{category},{regions[i % 4]},{qty},{revenue}"
        )
    return "\n".join(lines) + "\n"


@pytest.fixture
def sales_csv_bytes() -> bytes:
    return make_sales_csv().encode("utf-8")


@pytest.fixture
def sales_df() -> pl.DataFrame:
    import csv

    text = make_sales_csv()
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    df = pl.DataFrame(rows, strict=False)
    return df.with_columns([
        pl.col("quantity").cast(pl.Int64),
        pl.col("revenue").cast(pl.Float64),
        pl.col("order_date").str.to_date(),
    ])


@pytest.fixture
def tiny_df() -> pl.DataFrame:
    return pl.DataFrame({"a": [1, 2], "b": ["x", "y"]})


@pytest.fixture
def messy_csv_bytes() -> bytes:
    return (
        "name,amount,date\n"
        "Alice,100,2025-01-01\n"
        "Bob,,2025-01-02\n"
        ",300,2025-13-45\n"
        "Alice,100,2025-01-01\n"
        "\n"
        "Dana,-9999999,not-a-date\n"
    ).encode("utf-8")
