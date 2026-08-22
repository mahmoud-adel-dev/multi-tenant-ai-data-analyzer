/**
 * Zod validation of the Python analytics engine's output contract.
 * The worker validates EVERY payload against these schemas before persisting
 * anything — malformed engine output fails the job instead of corrupting data.
 *
 * Mirrors analytics-service/app/schemas/contract.py.
 */
import { z } from "zod";

/** Optional-string that tolerates engine-side null (normalizes to undefined). */
const NullableOptionalString = z.string().nullish().transform((v) => v ?? undefined);

export const TopValueSchema = z.object({ value: z.string(), count: z.number().int() });
export const HistogramBucketSchema = z.object({ bucket: z.string(), count: z.number().int() });

export const MetricProvenanceSchema = z.object({
  aggregation: z.enum(["SUM", "MEAN", "MEDIAN", "MIN", "MAX", "COUNT", "COUNT_DISTINCT", "STDDEV", "RATIO", "MODEL"]),
  sourceColumns: z.array(z.string()),
  filters: z.array(z.object({ column: z.string(), op: z.string(), value: z.unknown() })).nullish().transform((v) => v ?? []),
  algorithm: NullableOptionalString,
  model: NullableOptionalString,
  rowsUsed: z.number().int().nonnegative().default(0),
  nullsExcluded: z.number().int().nonnegative().default(0),
  timeRange: z.object({ min: z.string(), max: z.string() }).nullable().optional(),
  groupBy: z.array(z.string()).nullable().optional(),
});

export const MetricSchema = z.object({
  metricId: z.string().min(1),
  label: z.string().min(1),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  datasetVersion: z.string(),
  provenance: MetricProvenanceSchema,
  interpretation: NullableOptionalString,
});

export const QualityFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  issueType: z.string(),
  column: z.string().nullable(),
  description: z.string(),
  affectedRows: z.number().int(),
  suggestedRemediation: z.string(),
});

const BooleanFlag = z.boolean();

export const ColumnProfileSchema = z.object({
  name: z.string(),
  normalizedName: z.string(),
  inferredType: z.enum(["numeric", "integer", "date", "datetime", "boolean", "categorical", "text", "identifier", "array", "unknown"]),
  role: z.enum(["dimension", "measure", "date", "identifier", "text", "unknown"]),
  nullCount: z.number().int(),
  nullPercentage: z.number(),
  uniqueCount: z.number().int(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  mean: z.number().nullable().optional(),
  median: z.number().nullable().optional(),
  stdDev: z.number().nullable().optional(),
  p05: z.number().nullable().optional(),
  p25: z.number().nullable().optional(),
  p75: z.number().nullable().optional(),
  p95: z.number().nullable().optional(),
  // The engine materializes these as arrays (possibly empty). Older engine
  // versions emitted null for non-applicable columns; normalize at the
  // boundary so persisted payloads always have a reliable shape. Element
  // shapes remain strictly validated.
  topValues: z.array(TopValueSchema).nullish().transform((v) => v ?? []),
  histogram: z.array(HistogramBucketSchema).nullish().transform((v) => v ?? []),
  dateRange: z.object({ min: z.string(), max: z.string() }).nullable().optional(),
  sampleValues: z.array(z.string()),
  // Semantic understanding layer (additive; defaults keep older payloads valid).
  parentPath: z.string().nullable().optional(),
  semanticType: z.string().nullable().optional(),
  semanticConfidence: z.number().min(0).max(1).nullable().optional(),
  isIdentifier: BooleanFlag.default(false),
  isMeasure: BooleanFlag.default(false),
  isDimension: BooleanFlag.default(false),
  isCurrency: BooleanFlag.default(false),
  isPercentage: BooleanFlag.default(false),
  isLocation: BooleanFlag.default(false),
  isPersonName: BooleanFlag.default(false),
  isEmail: BooleanFlag.default(false),
  isStatus: BooleanFlag.default(false),
  isDate: BooleanFlag.default(false),
  isTime: BooleanFlag.default(false),
  isNumeric: BooleanFlag.default(false),
  isCategorical: BooleanFlag.default(false),
  isBoolean: BooleanFlag.default(false),
  isCategory: BooleanFlag.default(false),
  isProduct: BooleanFlag.default(false),
  isCustomerField: BooleanFlag.default(false),
  isOrderField: BooleanFlag.default(false),
});

export const DatasetProfileSchema = z.object({
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  leafFieldCount: z.number().int().nonnegative().default(0),
  nestedFieldCount: z.number().int().nonnegative().default(0),
  duplicateRowCount: z.number().int().nonnegative(),
  missingCellCount: z.number().int().nonnegative(),
  missingCellPercentage: z.number(),
  qualityScore: z.number().min(0).max(100),
  columns: z.array(ColumnProfileSchema),
  detectedDelimiter: z.string().nullable().optional(),
  encoding: z.string().nullable().optional(),
});

export const DomainInferenceSchema = z.object({
  domain: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  semanticColumns: z.record(z.string(), z.array(z.string())),
});

const TimeSeriesPointSchema = z.object({ period: z.string(), value: z.number() });

export const PlannedKpiSchema = z.object({
  key: z.string(),
  label: z.string(),
  aggregation: z.enum(["SUM", "MEAN", "MEDIAN", "MIN", "MAX", "COUNT", "COUNT_DISTINCT", "RATIO"]),
  sourcePaths: z.array(z.string()),
  denominatorPaths: z.array(z.string()),
  unit: z.string().nullable(),
  available: z.boolean(),
  missingPaths: z.array(z.string()),
  rationale: z.string(),
});

export const AnalysisPlanSchema = z.object({
  domain: z.string(),
  domainConfidence: z.number().min(0).max(1),
  kpis: z.array(PlannedKpiSchema),
  dimensions: z.array(z.string()),
  measures: z.array(z.string()),
  identifiers: z.array(z.string()),
  timeColumns: z.array(z.string()),
  anomalyMethods: z.array(z.string()),
  anomalyRationale: z.string(),
  forecastEligible: z.boolean(),
  forecastRationale: z.string(),
  correlationEligible: z.boolean(),
  segmentationApproach: z.string().nullable(),
  notes: z.array(z.string()),
});

export const TrendDirectionSchema = z.enum([
  "strong_growth",
  "moderate_growth",
  "stable",
  "moderate_decline",
  "strong_decline",
  "high_volatility",
  "insufficient_data",
]);

export const TrendAnalysisSchema = z.object({
  metricColumn: z.string(),
  dateColumn: z.string(),
  granularity: z.enum(["day", "week", "month", "quarter", "year"]),
  series: z.array(TimeSeriesPointSchema),
  direction: TrendDirectionSchema,
  // Legacy payloads may omit the label; empty string normalizes safely.
  directionLabel: z.string().default(""),
  changePercentage: z.number().nullable(),
  volatilityCoefficient: z.number().nullable().optional(),
  movingAverage7: z.array(TimeSeriesPointSchema).nullish().transform((v) => v ?? []),
  movingAverage30: z.array(TimeSeriesPointSchema).nullish().transform((v) => v ?? []),
  seasonalityDetected: z.boolean(),
  seasonalityNote: z.string().nullable(),
  insight: z.string().nullable().optional(),
  lastPeriodComplete: z.boolean().default(true),
});

export const ForecastSchema = z.object({
  metricColumn: z.string(),
  dateColumn: z.string(),
  model: z.string(),
  horizonPeriods: z.number().int().positive(),
  granularity: z.enum(["day", "week", "month", "quarter", "year"]),
  history: z.array(TimeSeriesPointSchema),
  predictions: z.array(
    z.object({
      period: z.string(),
      value: z.number(),
      lower: z.number().nullable(),
      upper: z.number().nullable(),
    })
  ),
  fitMetrics: z.object({
    mape: z.number().nullable(),
    mae: z.number().nullable(),
    baselineMape: z.number().nullable().optional(),
    skillScore: z.number().nullable().optional(),
  }),
  warnings: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  validationMethod: z.string().optional(),
});

export const AnomalySchema = z.object({
  id: z.string(),
  method: z.enum(["iqr", "robust_zscore", "isolation_forest"]),
  column: z.string(),
  rowIndex: z.number().int().nullable(),
  groupLabel: z.string().nullable(),
  value: z.number(),
  expectedRange: z.tuple([z.number(), z.number()]).nullable(),
  severity: z.enum(["low", "medium", "high"]),
  classification: z.enum(["statistical_outlier", "business_notable"]).default("statistical_outlier"),
  explanation: z.string(),
});

export const CorrelationPairSchema = z.object({
  columnA: z.string(),
  columnB: z.string(),
  coefficient: z.number().min(-1).max(1),
  method: z.enum(["pearson", "spearman"]),
  sampleSize: z.number().int(),
  strength: z.enum(["weak", "moderate", "strong"]),
});

export const SegmentSchema = z.object({
  method: z.enum(["rfm", "kmeans"]),
  name: z.string(),
  size: z.number().int(),
  sizePercentage: z.number(),
  characteristics: z.array(z.object({ feature: z.string(), meanValue: z.number(), overallMean: z.number() })),
  label: z.string(),
});

export const VisualizationSpecSchema = z.object({
  id: z.string(),
  type: z.enum([
    "kpi", "line", "bar", "stacked_bar", "area", "pie", "scatter", "histogram",
    "heatmap", "table", "correlation_matrix", "forecast", "anomaly_chart", "text",
  ]),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  insightText: z.string().nullable().optional(),
  selectionReason: z.string().nullable().optional(),
  data: z.unknown(),
});

export const DashboardPlanSchema = z.object({
  title: z.string().min(1),
  pages: z
    .array(
      z.object({
        title: z.string(),
        widgets: z.array(VisualizationSpecSchema).max(24),
      })
    )
    .min(1)
    .max(5),
});

export const ReportBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paragraph"), text: z.string() }),
  z.object({ kind: z.literal("bullets"), items: z.array(z.string()) }),
  z.object({ kind: z.literal("metrics"), metrics: z.array(MetricSchema) }),
  z.object({ kind: z.literal("table"), title: z.string().nullable(), columns: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  z.object({ kind: z.literal("warning"), text: z.string() }),
]);

export const ReportPlanSchema = z.object({
  title: z.string().min(1),
  sections: z
    .array(
      z.object({
        key: z.string(),
        title: z.string(),
        blocks: z.array(ReportBlockSchema),
      })
    )
    .min(1)
    .max(15),
});

export const AnalysisRunPayloadSchema = z.object({
  engineVersion: z.string().min(1),
  datasetVersion: z.string(),
  profile: DatasetProfileSchema,
  domain: DomainInferenceSchema,
  analysisPlan: AnalysisPlanSchema.nullish().transform((v) => v ?? null),
  metrics: z.array(MetricSchema).max(200),
  trends: z.array(TrendAnalysisSchema).max(20),
  anomalies: z.array(AnomalySchema).max(500),
  correlations: z.array(CorrelationPairSchema).max(200),
  forecasts: z.array(ForecastSchema).max(10),
  segments: z.array(SegmentSchema).max(20),
  qualityFindings: z.array(QualityFindingSchema).max(300),
  dashboardPlan: DashboardPlanSchema,
  reportPlan: ReportPlanSchema,
  warnings: z.array(z.string()).max(50),
  executionStats: z.object({
    durationMs: z.number(),
    rowsAnalyzed: z.number().int(),
    columnsAnalyzed: z.number().int(),
    pythonVersion: z.string(),
    stageTimingsMs: z.record(z.string(), z.number().int()).nullish().transform((v) => v ?? {}),
  }),
});
