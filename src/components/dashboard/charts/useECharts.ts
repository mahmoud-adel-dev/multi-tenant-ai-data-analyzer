"use client";

/**
 * React hook for ECharts instances: lazy client-side init, dark-mode
 * re-theming, and resize observation.
 */
import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";

export function useECharts(option: EChartsOption | null): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRef = useRef<EChartsOption | null>(option);
  const loadingRef = useRef(true);
  const chartRef = useRef<{ setOption: (o: EChartsOption) => void; resize: () => void } | null>(null);

  // Keep latest option without re-triggering init.
  useEffect(() => {
    optionRef.current = option;
    if (chartRef.current && option) chartRef.current.setOption(option);
  }, [option]);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let echartsModule: typeof import("echarts") | null = null;

    const render = () => {
      const el = containerRef.current;
      if (!el || !echartsModule) return;
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const instance = echartsModule.init(el, isDark ? "dark" : undefined);
      if (isDark) instance.setOption({ backgroundColor: "transparent" });
      if (optionRef.current) instance.setOption(optionRef.current);
      loadingRef.current = false;
      chartRef.current = instance as unknown as { setOption: (o: EChartsOption) => void; resize: () => void };
      resizeObserver = new ResizeObserver(() => instance.resize());
      resizeObserver.observe(el);
      themeObserver = new MutationObserver(render);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    };

    import("echarts").then((mod) => {
      if (disposed) return;
      echartsModule = mod;
      render();
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      (chartRef.current as { dispose?: () => void } | null)?.dispose?.();
      chartRef.current = null;
    };
  }, []);

  return { containerRef, loading: loadingRef.current };
}
