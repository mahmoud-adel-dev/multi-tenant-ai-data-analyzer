/**
 * The Analysis Result Contract — the stable, machine-readable schema produced
 * by the Python analytics engine and consumed by dashboards, reports, the AI
 * narrative layer, and the public API.
 *
 * Every important number carries provenance. The LLM never authors this data;
 * it only narrates over it.
 *
 * Mirrors analytics-service/app/schemas/contract.py.
 */

export interface MetricProvenance {
  aggregation: "SUM" | "MEAN" | "MEDIAN" | "MIN" | "MAX" | "COUNT" | "COUNT_DISTINCT" | "STDDEV" | "RATIO" | "MODEL";
  sourceColumns: string[];
  filters: Array<{ column: string; op: string; value?: unknown }>;
  algorithm?: string;
  model?: string;
  /** Partial-data transparency. */
  rowsUsed: number;
  nullsExcluded: number;
  timeRange?: { min: string; max: string } | null;
  groupBy?: string[] | null;
}

export interface Metric {
  metricId: string;
  label: string;
  value: number | null;
  unit: string | null;
  datasetVersion: string;
  provenance: MetricProvenance;
  interpretation?: string | null;
}

export interface QualityFinding {
  id: string;
  severity: "low" | "medium" | "high";
  issueType: string;
  column: string | null;
  description: string;
  affectedRows: number;
  suggestedRemediation: string;
}

export type InferredFieldType =
  | "numeric" | "integer" | "date" | "datetime" | "boolean"
  | "categorical" | "text" | "identifier" | "array" | "unknown";

export interface ColumnProfile {
  name: string;
  normalizedName: string;
  parentPath?: string | null;
  inferredType: InferredFieldType;
  role: "dimension" | "measure" | "date" | "identifier" | "text" | "unknown";
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  median?: number | null;
  stdDev?: number | null;
  p05?: number | null;
  p25?: number | null;
  p75?: number | null;
  p95?: number | null;
  /** Always materialized by the engine/contract layer — possibly empty, never null. */
  topValues: Array<{ value: string; count: number }>;
  /** Always materialized by the engine/contract layer — possibly empty, never null. */
  histogram: Array<{ bucket: string; count: number }>;
  dateRange?: { min: string; max: string } | null;
  sampleValues: string[];
  // Semantic understanding layer.
  semanticType?: string | null;
  semanticConfidence?: number | null;
  isIdentifier: boolean;
  isMeasure: boolean;
  isDimension: boolean;
  isCurrency: boolean;
  isPercentage: boolean;
  isLocation: boolean;
  isPersonName: boolean;
  isEmail: boolean;
  isStatus: boolean;
  isDate: boolean;
  isTime: boolean;
  isNumeric: boolean;
  isCategorical: boolean;
  isBoolean: boolean;
  isCategory: boolean;
  isProduct: boolean;
  isCustomerField: boolean;
  isOrderField: boolean;
}

export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  leafFieldCount: number;
  nestedFieldCount: number;
  duplicateRowCount: number;
  missingCellCount: number;
  missingCellPercentage: number;
  qualityScore: number;
  columns: ColumnProfile[];
  detectedDelimiter?: string | null;
  encoding?: string | null;
}

export interface DomainInference {
  domain: string;
  confidence: number;
  evidence: string[];
  semanticColumns: Record<string, string[]>;
}

export interface PlannedKpi {
  key: string;
  label: string;
  aggregation: MetricProvenance["aggregation"];
  sourcePaths: string[];
  denominatorPaths: string[];
  unit: string | null;
  available: boolean;
  missingPaths: string[];
  rationale: string;
}

/** Deterministic plan produced BEFORE any metric computation. */
export interface AnalysisPlan {
  domain: string;
  domainConfidence: number;
  kpis: PlannedKpi[];
  dimensions: string[];
  measures: string[];
  identifiers: string[];
  timeColumns: string[];
  anomalyMethods: string[];
  anomalyRationale: string;
  forecastEligible: boolean;
  forecastRationale: string;
  correlationEligible: boolean;
  segmentationApproach: string | null;
  notes: string[];
}

export interface Anomaly {
  id: string;
  method: "iqr" | "robust_zscore" | "isolation_forest";
  column: string;
  rowIndex: number | null;
  groupLabel?: string | null;
  value: number;
  expectedRange: [number, number] | null;
  severity: "low" | "medium" | "high";
  classification: "statistical_outlier" | "business_notable";
  explanation: string;
}

export interface CorrelationPair {
  columnA: string;
  columnB: string;
  coefficient: number;
  method: "pearson" | "spearman";
  sampleSize: number;
  strength: "weak" | "moderate" | "strong";
}

export interface TimeSeriesPoint {
  period: string;
  value: number;
}

export type TrendDirection =
  | "strong_growth"
  | "moderate_growth"
  | "stable"
  | "moderate_decline"
  | "strong_decline"
  | "high_volatility"
  | "insufficient_data";

export interface TrendAnalysis {
  metricColumn: string;
  dateColumn: string;
  granularity: "day" | "week" | "month" | "quarter" | "year";
  series: TimeSeriesPoint[];
  direction: TrendDirection;
  /** Human label that ALWAYS includes the measured change (e.g. "Strong Growth (+42.3%)"). */
  directionLabel: string;
  changePercentage: number | null;
  volatilityCoefficient: number | null;
  movingAverage7: TimeSeriesPoint[];
  movingAverage30: TimeSeriesPoint[];
  seasonalityDetected: boolean;
  seasonalityNote: string | null;
  insight: string | null;
  lastPeriodComplete: boolean;
}

export interface Forecast {
  metricColumn: string;
  dateColumn: string;
  model: string;
  horizonPeriods: number;
  granularity: TrendAnalysis["granularity"];
  history: TimeSeriesPoint[];
  predictions: Array<{ period: string; value: number; lower: number | null; upper: number | null }>;
  fitMetrics: {
    mape: number | null;
    mae: number | null;
    baselineMape: number | null;
    skillScore: number | null;
  };
  warnings: string[];
  confidence: "low" | "medium" | "high";
  validationMethod: string;
}

export interface Segment {
  method: "rfm" | "kmeans";
  name: string;
  size: number;
  sizePercentage: number;
  characteristics: Array<{ feature: string; meanValue: number; overallMean: number }>;
  label: string;
}

export interface VisualizationSpec {
  id: string;
  type:
    | "kpi"
    | "line"
    | "bar"
    | "stacked_bar"
    | "area"
    | "pie"
    | "scatter"
    | "histogram"
    | "heatmap"
    | "table"
    | "correlation_matrix"
    | "forecast"
    | "anomaly_chart"
    | "text";
  title: string;
  subtitle?: string | null;
  insightText?: string | null;
  /** Deterministic chart-selection rationale (why this chart type). */
  selectionReason?: string | null;
  data: unknown;
}

export interface DashboardPageSpec {
  title: string;
  widgets: VisualizationSpec[];
}

export interface DashboardPlan {
  title: string;
  pages: DashboardPageSpec[];
}

export type ReportSectionKey =
  | "executive_summary"
  | "dataset_overview"
  | "data_quality"
  | "key_kpis"
  | "major_trends"
  | "performance_drivers"
  | "top_bottom_performers"
  | "anomalies"
  | "correlations"
  | "forecasts"
  | "segmentation"
  | "recommendations"
  | "risks_limitations"
  | "methodology"
  | "appendix";

export type ReportBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "metrics"; metrics: Metric[] }
  | { kind: "table"; title: string | null; columns: string[]; rows: string[][] }
  | { kind: "warning"; text: string };

export interface ReportSectionSpec {
  key: ReportSectionKey | string;
  title: string;
  blocks: ReportBlock[];
}

export interface ReportPlan {
  title: string;
  sections: ReportSectionSpec[];
}

/** AI-generated narrative layer — validated strictly against a Zod schema in TS. */
export interface AiNarrative {
  executiveSummary: string;
  keyInsights: string[];
  recommendations: string[];
  limitationsAcknowledged: string[];
  generatedAt: string;
  model: string;
  tokensUsed: number | null;
}

export interface AnalysisRunPayload {
  engineVersion: string;
  datasetVersion: string;
  profile: DatasetProfile;
  domain: DomainInference;
  analysisPlan: AnalysisPlan | null;
  metrics: Metric[];
  trends: TrendAnalysis[];
  anomalies: Anomaly[];
  correlations: CorrelationPair[];
  forecasts: Forecast[];
  segments: Segment[];
  qualityFindings: QualityFinding[];
  dashboardPlan: DashboardPlan;
  reportPlan: ReportPlan;
  warnings: string[];
  executionStats: {
    durationMs: number;
    rowsAnalyzed: number;
    columnsAnalyzed: number;
    pythonVersion: string;
    stageTimingsMs: Record<string, number>;
  };
}
