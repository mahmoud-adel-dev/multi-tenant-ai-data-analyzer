"""Recursive nested-JSON flattening.

Nested objects are exploded into leaf columns with dotted paths
(e.g. ``customer`` -> ``customer.region``, ``pricing`` -> ``pricing.total``)
so every leaf field becomes independently analyzable instead of being
profiled as opaque text.

Lists are preserved as list-typed columns and profiled structurally
(emptiness / length / distinct elements); expanding elements into rows would
change row grain, so per-element measures stay out of scope.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import polars as pl

MAX_DEPTH = 6


@dataclass
class FlattenResult:
    frame: pl.DataFrame
    flattened_paths: list[str] = field(default_factory=list)
    list_columns: list[str] = field(default_factory=list)
    dropped_empty_structs: list[str] = field(default_factory=list)


def _unique_name(candidate: str, taken: set[str]) -> str:
    if candidate not in taken:
        return candidate
    index = 2
    while f"{candidate}_{index}" in taken:
        index += 1
    return f"{candidate}_{index}"


def flatten_frame(df: pl.DataFrame) -> FlattenResult:
    """Replaces every Struct column with one column per leaf path."""
    result = FlattenResult(frame=df)

    for _depth in range(MAX_DEPTH):
        struct_cols = [
            (name, dtype)
            for name, dtype in result.frame.schema.items()
            if isinstance(dtype, pl.Struct)
        ]
        if not struct_cols:
            break

        taken = set(result.frame.columns)
        exprs: list[pl.Expr] = []
        drops: list[str] = []

        for name, dtype in struct_cols:
            fields = dtype.to_schema()
            if not fields:
                result.dropped_empty_structs.append(name)
                drops.append(name)
                continue
            # Structs whose fields are entirely null still carry quality signal
            # (100% missing at leaf level), so their leaves are always kept.
            for fname, fdtype in fields.items():
                child = _unique_name(f"{name}.{fname}", taken)
                taken.add(child)
                exprs.append(pl.col(name).struct.field(fname).alias(child))
                if not isinstance(fdtype, pl.Struct):
                    result.flattened_paths.append(child)
            drops.append(name)

        if exprs:
            result.frame = result.frame.with_columns(exprs)
        if drops:
            result.frame = result.frame.drop(drops)

    result.list_columns = [
        name for name, dtype in result.frame.schema.items() if isinstance(dtype, pl.List)
    ]
    return result
