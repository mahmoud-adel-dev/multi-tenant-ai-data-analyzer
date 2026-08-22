"use client";

import { useRef } from "react";
import type { EChartsOption } from "echarts";
import { useECharts } from "./useECharts";

export function Chart({ height, option }: { height: number; option: EChartsOption | null }) {
  const { containerRef } = useECharts(option);
  const widthRef = useRef("100%");

  return (
    <div
      ref={containerRef}
      style={{ width: widthRef.current, height, minHeight: 200 }}
      role="img"
      aria-label="Chart visualization"
    />
  );
}
