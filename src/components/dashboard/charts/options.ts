"use client";

/**
 * Deterministic widget-spec → ECharts option builders.
 * These mirror the Python planner's data payloads (types/analytics.ts).
 */
import type { EChartsOption } from "echarts";

export const PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6", "#f97316", "#a855f7"];

type Json = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export interface SeriesPoint {
  period: string;
  value: number;
}

function baseGrid(): EChartsOption["grid"] {
  return { left: 56, right: 24, top: 40, bottom: 44, containLabel: false };
}

/* ────────────────────────────── Line / area ─────────────────────────────── */

export function lineOption(data: Json): EChartsOption {
  const series = arr(data.series).map((p) => {
    const point = p as Json;
    return { period: str(point.period), value: num(point.value) };
  });
  const moving = arr(data.movingAverage).map((p) => {
    const point = p as Json;
    return { period: str(point.period), value: num(point.value) };
  });

  const xAxisData = series.map((s) => s.period);

  const seriesDefs: EChartsOption["series"] = [
    {
      name: "Value",
      type: "line",
      data: series.map((s) => s.value),
      smooth: true,
      showSymbol: series.length <= 60,
      symbolSize: 5,
      lineStyle: { width: 2.5 },
      areaStyle: { opacity: 0.12 },
      itemStyle: { color: PALETTE[0] },
    },
  ];

  if (moving.length > 0) {
    seriesDefs.push({
      name: "Moving average",
      type: "line",
      data: moving.map((m) => m.value),
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1.6, type: "dashed", opacity: 0.85 },
      itemStyle: { color: PALETTE[3] },
    });
  }

  return {
    grid: baseGrid(),
    tooltip: { trigger: "axis" },
    legend: moving.length > 0 ? { bottom: 0, icon: "roundRect", itemWidth: 14, itemHeight: 3 } : undefined,
    xAxis: {
      type: "category",
      data: xAxisData,
      boundaryGap: false,
      axisLabel: {
        formatter: (v: string) => (v.length > 10 ? `${v.slice(0, 10)}…` : v),
        hideOverlap: true,
      },
    },
    yAxis: { type: "value", scale: true, splitLine: { lineStyle: { opacity: 0.35 } } },
    series: seriesDefs,
  };
}

/* ─────────────────────────── Bar & pie ─────────────────────────────────── */

export function barOption(data: Json, horizontal: boolean): EChartsOption {
  const categories = arr(data.categories).map(str);
  const values = arr(data.values).map(num);

  if (horizontal) {
    return {
      grid: { left: 16, right: 32, top: 24, bottom: 24, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value", splitLine: { lineStyle: { opacity: 0.3 } } },
      yAxis: { type: "category", data: categories.slice().reverse(), axisLabel: { width: 110, overflow: "truncate" } },
      series: [
        {
          type: "bar",
          data: values.slice().reverse(),
          barMaxWidth: 22,
          itemStyle: { color: PALETTE[0], borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right" },
        },
      ],
    };
  }

  return {
    grid: { ...baseGrid(), left: 48 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { rotate: categories.some((c) => c.length > 12) ? 30 : 0, width: 90, overflow: "truncate" },
    },
    yAxis: { type: "value", splitLine: { lineStyle: { opacity: 0.3 } } },
    series: [
      {
        type: "bar",
        data: values,
        barMaxWidth: 34,
        itemStyle: { color: PALETTE[0], borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

export function pieOption(data: Json): EChartsOption {
  const categories = arr(data.categories).map(str);
  const values = arr(data.values).map(num);
  const points = categories.map((c, i) => ({ name: c, value: values[i] ?? 0 }));

  return {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { type: "scroll", orient: "horizontal", bottom: 0, icon: "circle", itemWidth: 9, itemHeight: 9 },
    series: [
      {
        type: "pie",
        radius: ["42%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: true,
        padAngle: 2,
        itemStyle: { borderRadius: 6 },
        label: { show: false },
        emphasis: {
          label: { show: true, formatter: "{b}\n{d}%", fontWeight: 600 },
        },
        color: PALETTE,
        data: points,
      },
    ],
  };
}

/* ─────────────────────────── Histogram ─────────────────────────────────── */

export function histogramOption(data: Json): EChartsOption {
  const buckets = arr(data.buckets).map((b) => {
    const bucket = b as Json;
    return { bucket: str(bucket.bucket), count: Math.round(num(bucket.count)) };
  });

  return {
    grid: baseGrid(),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "category",
      data: buckets.map((b) => b.bucket),
      axisLabel: { rotate: 30, fontSize: 10, width: 90, overflow: "truncate" },
    },
    yAxis: { type: "value", splitLine: { lineStyle: { opacity: 0.3 } } },
    series: [
      {
        type: "bar",
        data: buckets.map((b) => b.count),
        barCategoryGap: "12%",
        itemStyle: { color: PALETTE[1], borderRadius: [3, 3, 0, 0] },
      },
    ],
  };
}

/* ─────────────────────────── Scatter ───────────────────────────────────── */

export function scatterOption(data: Json): EChartsOption {
  const points = arr(data.points).map((p) => {
    const point = p as Json;
    return [num(point.x), num(point.y)];
  });

  return {
    grid: baseGrid(),
    tooltip: { trigger: "item" },
    xAxis: { type: "value", scale: true, splitLine: { lineStyle: { opacity: 0.25 } } },
    yAxis: { type: "value", scale: true, splitLine: { lineStyle: { opacity: 0.25 } } },
    series: [
      {
        type: "scatter",
        data: points,
        symbolSize: 7,
        itemStyle: { color: PALETTE[0], opacity: 0.65 },
      },
    ],
  };
}

/* ─────────────────────── Correlation heatmap ───────────────────────────── */

export function heatmapOption(data: Json): EChartsOption {
  const columns = arr(data.columns).map(str);
  const matrix = (data.matrix ?? {}) as Json;

  const cells: Array<[number, number, number]> = [];
  columns.forEach((rowA, i) => {
    const rowMap = (matrix[rowA] ?? {}) as Json;
    columns.forEach((colB, j) => {
      const v = rowMap[colB];
      if (typeof v === "number") cells.push([j, i, Number(v.toFixed(3))]);
    });
  });

  return {
    tooltip: { position: "top" },
    grid: { left: 130, right: 90, top: 20, bottom: 90, containLabel: false },
    xAxis: { type: "category", data: columns, axisLabel: { rotate: 45, fontSize: 10, width: 100, overflow: "truncate" }, splitArea: { show: true } },
    yAxis: { type: "category", data: columns, axisLabel: { fontSize: 10, width: 120, overflow: "truncate" }, splitArea: { show: true } },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: "vertical",
      right: 0,
      top: "center",
      inRange: { color: ["#3b82f6", "#f8fafc", "#ef4444"] },
      textStyle: { fontSize: 10 },
    },
    series: [
      {
        type: "heatmap",
        data: cells,
        label: { show: columns.length <= 8, fontSize: 9 },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.4)" } },
      },
    ],
  };
}

/* ─────────────────────────── Forecast ──────────────────────────────────── */

export function forecastOption(data: Json): EChartsOption {
  const history = arr(data.history).map((p) => {
    const point = p as Json;
    return { period: str(point.period), value: num(point.value) };
  });
  const predictions = arr(data.predictions).map((p) => {
    const point = p as Json;
    return { period: str(point.period), value: num(point.value), lower: point.lower == null ? null : num(point.lower), upper: point.upper == null ? null : num(point.upper) };
  });

  const xLabels = [...history.map((h) => h.period), ...predictions.map((p) => p.period)];

  // Connect prediction to last observed point.
  const bridge = history.length > 0 && predictions.length > 0
    ? [{ period: history[history.length - 1].period, value: history[history.length - 1].value }]
    : [];
  const predValues = new Array(history.length - 1).fill(null)
    .concat(bridge.map(() => history[history.length - 1]?.value ?? null))
    .concat(predictions.map((p) => p.value));

  // Uncertainty band via stacked transparent lines.
  const lowerSeries = new Array(history.length - 1).fill(null)
    .concat([predictions[0]?.lower ?? null])
    .concat(predictions.map((p) => p.lower));
  const bandSeries = new Array(history.length - 1).fill(null)
    .concat([null])
    .concat(predictions.map((p) => (p.upper !== null && p.lower !== null ? p.upper - p.lower : null)));

  const hasBand = lowerSeries.some((v) => v != null);

  const seriesDefs: EChartsOption["series"] = [
    {
      name: "History",
      type: "line",
      data: history.map((h) => h.value),
      smooth: true,
      showSymbol: history.length <= 60,
      lineStyle: { width: 2.5 },
      itemStyle: { color: PALETTE[0] },
    },
    {
      name: "Forecast",
      type: "line",
      data: predValues,
      smooth: true,
      showSymbol: true,
      symbolSize: 5,
      lineStyle: { width: 2.5, type: "dashed" },
      itemStyle: { color: PALETTE[4] },
    },
  ];
  if (hasBand) {
    seriesDefs.push({
      name: "band-lower",
      type: "line",
      stack: "band",
      data: lowerSeries,
      lineStyle: { opacity: 0 },
      symbol: "none",
      silent: true,
      tooltip: { show: false },
    } as never);
    seriesDefs.push({
      name: "band",
      type: "line",
      stack: "band",
      data: bandSeries,
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0.14, color: PALETTE[4] },
      symbol: "none",
      silent: true,
      tooltip: { show: false },
    } as never);
  }

  void xLabels;

  return {
    grid: baseGrid(),
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, icon: "roundRect", itemWidth: 14, itemHeight: 3 },
    xAxis: {
      type: "category",
      data: [...history.map((h) => h.period), ...predictions.map((p) => p.period)],
      boundaryGap: false,
      axisLabel: { formatter: (v: string) => (v.length > 10 ? `${v.slice(0, 10)}…` : v), hideOverlap: true },
    },
    yAxis: { type: "value", scale: true, splitLine: { lineStyle: { opacity: 0.35 } } },
    series: seriesDefs,
  };
}

/* ─────────────────────────── Helpers ───────────────────────────────────── */

export function formatCompact(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${Number.isInteger(v) ? v : v.toFixed(2)}`;
}
