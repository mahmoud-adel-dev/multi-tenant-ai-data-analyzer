"""Pydantic schemas — the Analysis Result Contract (mirrors src/types/analytics.ts)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class MetricProvenance(BaseModel):
    aggregation: Literal["SUM", "MEAN", "MEDIAN", "MIN", "MAX", "COUNT", "COUNT_DISTINCT", "STDDEV", "RATIO", "MODEL"]
    sourceColumns: list[str] = Field(default_factory=list)
    filters: list[dict[str, Any]] = Field(default_factory=list)
    algorithm: Optional[str] = None
    model: Optional[str] = None
    # Partial-data transparency.
    rowsUsed: int = 0
    nullsExcluded: int = 0
    timeRange: Optional[dict[str, str]] = None
    groupBy: Optional[list[str]] = None


class Metric(BaseModel):
    metricId: str
    label: str
    value: Optional[float]
    unit: Optional[str] = None
    datasetVersion: str
    provenance: MetricProvenance
    interpretation: Optional[str] = None


class QualityFinding(BaseModel):
    id: str
    severity: Literal["low", "medium", "high"]
    issueType: str
    column: Optional[str]
    description: str
    affectedRows: int
    suggestedRemediation: str


class ColumnProfile(BaseModel):
    name: str
    normalizedName: str
    parentPath: Optional[str] = None
    inferredType: Literal[
        "numeric", "integer", "date", "datetime", "boolean", "categorical", "text", "identifier", "array", "unknown"
    ]
    role: Literal["dimension", "measure", "date", "identifier", "text", "unknown"]
    nullCount: int
    nullPercentage: float
    uniqueCount: int
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    stdDev: Optional[float] = None
    p05: Optional[float] = None
    p25: Optional[float] = None
    p75: Optional[float] = None
    p95: Optional[float] = None
    topValues: list[dict[str, Any]] = Field(default_factory=list)
    histogram: list[dict[str, Any]] = Field(default_factory=list)
    dateRange: Optional[dict[str, str]] = None
    sampleValues: list[str] = Field(default_factory=list)
    # Semantic understanding layer.
    semanticType: Optional[str] = None
    semanticConfidence: Optional[float] = None
    isIdentifier: bool = False
    isMeasure: bool = False
    isDimension: bool = False
    isCurrency: bool = False
    isPercentage: bool = False
    isLocation: bool = False
    isPersonName: bool = False
    isEmail: bool = False
    isStatus: bool = False
    isDate: bool = False
    isTime: bool = False
    isNumeric: bool = False
    isCategorical: bool = False
    isBoolean: bool = False
    isCategory: bool = False
    isProduct: bool = False
    isCustomerField: bool = False
    isOrderField: bool = False


class DatasetProfile(BaseModel):
    rowCount: int
    columnCount: int
    leafFieldCount: int = 0
    nestedFieldCount: int = 0
    duplicateRowCount: int
    missingCellCount: int
    missingCellPercentage: float
    qualityScore: float
    columns: list[ColumnProfile]
    detectedDelimiter: Optional[str] = None
    encoding: Optional[str] = None


class DomainInference(BaseModel):
    domain: str
    confidence: float
    evidence: list[str]
    semanticColumns: dict[str, list[str]]


class PlannedKpi(BaseModel):
    key: str
    label: str
    aggregation: Literal["SUM", "MEAN", "MEDIAN", "MIN", "MAX", "COUNT", "COUNT_DISTINCT", "RATIO"]
    sourcePaths: list[str] = Field(default_factory=list)
    denominatorPaths: list[str] = Field(default_factory=list)
    unit: Optional[str] = None
    available: bool = True
    missingPaths: list[str] = Field(default_factory=list)
    rationale: str = ""


class AnalysisPlan(BaseModel):
    """Deterministic analysis plan produced BEFORE any metric is computed."""
    domain: str
    domainConfidence: float
    kpis: list[PlannedKpi] = Field(default_factory=list)
    dimensions: list[str] = Field(default_factory=list)
    measures: list[str] = Field(default_factory=list)
    identifiers: list[str] = Field(default_factory=list)
    timeColumns: list[str] = Field(default_factory=list)
    anomalyMethods: list[str] = Field(default_factory=list)
    anomalyRationale: str = ""
    forecastEligible: bool = False
    forecastRationale: str = ""
    correlationEligible: bool = True
    segmentationApproach: Optional[str] = None
    notes: list[str] = Field(default_factory=list)


class TimeSeriesPoint(BaseModel):
    period: str
    value: float


# Direction class and its numeric basis are always consistent: the change
# thresholds are documented in statistics/time_series.py.
TrendDirection = Literal[
    "strong_growth", "moderate_growth", "stable",
    "moderate_decline", "strong_decline",
    "high_volatility", "insufficient_data",
]


class TrendAnalysis(BaseModel):
    metricColumn: str
    dateColumn: str
    granularity: Literal["day", "week", "month", "quarter", "year"]
    series: list[TimeSeriesPoint]
    direction: TrendDirection
    directionLabel: str
    changePercentage: Optional[float]
    volatilityCoefficient: Optional[float] = None
    movingAverage7: list[TimeSeriesPoint] = Field(default_factory=list)
    movingAverage30: list[TimeSeriesPoint] = Field(default_factory=list)
    seasonalityDetected: bool = False
    seasonalityNote: Optional[str] = None
    insight: Optional[str] = None
    lastPeriodComplete: bool = True


class Forecast(BaseModel):
    metricColumn: str
    dateColumn: str
    model: str
    horizonPeriods: int
    granularity: Literal["day", "week", "month", "quarter", "year"]
    history: list[TimeSeriesPoint]
    predictions: list[dict[str, Any]]
    fitMetrics: dict[str, Optional[float]]
    warnings: list[str]
    confidence: Literal["low", "medium", "high"]
    validationMethod: str = "chronological holdout"


class Anomaly(BaseModel):
    id: str
    method: Literal["iqr", "robust_zscore", "isolation_forest"]
    column: str
    rowIndex: Optional[int]
    groupLabel: Optional[str] = None
    value: float
    expectedRange: Optional[tuple[float, float]] = None
    severity: Literal["low", "medium", "high"]
    classification: Literal["statistical_outlier", "business_notable"] = "statistical_outlier"
    explanation: str


class CorrelationPair(BaseModel):
    columnA: str
    columnB: str
    coefficient: float
    method: Literal["pearson", "spearman"]
    sampleSize: int
    strength: Literal["weak", "moderate", "strong"]


class SegmentCharacteristic(BaseModel):
    feature: str
    meanValue: float
    overallMean: float


class Segment(BaseModel):
    method: Literal["rfm", "kmeans"]
    name: str
    size: int
    sizePercentage: float
    characteristics: list[SegmentCharacteristic]
    label: str


class VisualizationSpec(BaseModel):
    id: str
    type: Literal[
        "kpi", "line", "bar", "stacked_bar", "area", "pie", "scatter", "histogram",
        "heatmap", "table", "correlation_matrix", "forecast", "anomaly_chart", "text",
    ]
    title: str
    subtitle: Optional[str] = None
    insightText: Optional[str] = None
    selectionReason: Optional[str] = None
    data: dict[str, Any]


class DashboardPageSpec(BaseModel):
    title: str
    widgets: list[VisualizationSpec]


class DashboardPlan(BaseModel):
    title: str
    pages: list[DashboardPageSpec]


class ReportBlock(BaseModel):
    kind: Literal["paragraph", "bullets", "metrics", "table", "warning"]
    text: Optional[str] = None
    items: Optional[list[str]] = None
    metrics: Optional[list[Metric]] = None
    title: Optional[str] = None
    columns: Optional[list[str]] = None
    rows: Optional[list[list[str]]] = None

    model_config = {"extra": "allow"}


class ReportSectionSpec(BaseModel):
    key: str
    title: str
    blocks: list[dict[str, Any]]


class ReportPlan(BaseModel):
    title: str
    sections: list[ReportSectionSpec]


class ExecutionStats(BaseModel):
    durationMs: int
    rowsAnalyzed: int
    columnsAnalyzed: int
    pythonVersion: str
    stageTimingsMs: dict[str, int] = Field(default_factory=dict)


class AnalysisRunPayload(BaseModel):
    engineVersion: str
    datasetVersion: str
    profile: DatasetProfile
    domain: DomainInference
    analysisPlan: Optional[AnalysisPlan] = None
    metrics: list[Metric]
    trends: list[TrendAnalysis]
    anomalies: list[Anomaly]
    correlations: list[CorrelationPair]
    forecasts: list[Forecast]
    segments: list[Segment]
    qualityFindings: list[QualityFinding]
    dashboardPlan: DashboardPlan
    reportPlan: ReportPlan
    warnings: list[str]
    executionStats: ExecutionStats


class AnalyzeOptions(BaseModel):
    file_type: Optional[str] = None
    context_prompt: Optional[str] = None
    max_rows: Optional[int] = None
