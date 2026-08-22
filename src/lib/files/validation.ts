/**
 * Untrusted file validation.
 *
 * Never trusts extension or browser MIME type: content is sniffed via magic
 * bytes / structural heuristics, filenames are sanitized, and hard limits are
 * enforced before anything touches a parser.
 */
import { AppError, FileTooLargeError, MalformedFileError, UnsupportedFileError } from "@/lib/errors";
import { DatasetFileType } from "@/types";

export interface FileLimits {
  maxBytes: number;
  /** Hard safety ceiling independent of plan limits (protects the parser). */
  absoluteMaxBytes: number;
}

export const ABSOLUTE_MAX_UPLOAD_BYTES = 250 * 1024 * 1024; // 250MB hard ceiling.

const EXT_TO_TYPE: Record<string, DatasetFileType> = {
  csv: DatasetFileType.CSV,
  tsv: DatasetFileType.TSV,
  xlsx: DatasetFileType.XLSX,
  xls: DatasetFileType.XLS,
  json: DatasetFileType.JSON,
};

export function allowedExtensions(): string[] {
  return Object.keys(EXT_TO_TYPE);
}

/** Strips path components, control characters and dangerous patterns. */
export function sanitizeFilename(rawName: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? "upload";
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const safe = cleaned.length ? cleaned : "upload";
  return safe.length > 200 ? safe.slice(-200) : safe;
}

export function extensionOf(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export function detectFileTypeFromFilename(filename: string): DatasetFileType | null {
  return EXT_TO_TYPE[extensionOf(filename)] ?? null;
}

/**
 * Content sniffing. Returns the detected content class:
 * zip (xlsx container), text (csv/tsv/json), pdf, image, unknown-binary.
 */
export function sniffContent(buffer: Buffer): "zip" | "text" | "pdf" | "image" | "unknown" {
  if (buffer.length >= 4) {
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) {
      return "zip";
    }
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "pdf";
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image";
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image";
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image";
    if (
      buffer[0] === 0x1f && buffer[1] === 0x8b ||
      buffer[0] === 0x42 && buffer[1] === 0x4d
    ) {
      return "unknown";
    }
  }
  // Textual heuristic: sample must decode with few replacement chars and no NULs.
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0)) return "unknown";
  const decoded = sample.toString("utf8");
  const replacements = (decoded.match(/\ufffd/g) ?? []).length;
  if (replacements > decoded.length * 0.02) return "unknown";
  return "text";
}

export interface ValidatedFile {
  originalFilename: string;
  sanitizedFilename: string;
  fileType: DatasetFileType;
  buffer: Buffer;
  sizeBytes: number;
}

const MAX_TABULAR_JSON_COLUMNS = 500;

/**
 * JSON must be syntactically valid and convertible to rows before it can be
 * queued. The Python engine accepts either an array of records, a single
 * record object, or an export object whose largest array contains the rows.
 */
function assertTabularJson(buffer: Buffer): void {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof SyntaxError ? error.message : "Invalid JSON syntax.";
    throw MalformedFileError(`Invalid JSON: ${detail}`);
  }

  let records: unknown[];
  if (Array.isArray(value)) {
    records = value;
  } else if (value !== null && typeof value === "object") {
    const arrays = Object.values(value as Record<string, unknown>).filter(Array.isArray) as unknown[][];
    records = arrays.length > 0
      ? arrays.reduce((largest, current) => current.length > largest.length ? current : largest)
      : [value];
  } else {
    throw MalformedFileError("JSON must contain an object or an array of record objects.");
  }

  if (records.length === 0) {
    throw MalformedFileError("JSON contains no records to analyze.");
  }

  const columns = new Set<string>();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      throw MalformedFileError(
        `JSON record ${index + 1} must be an object with named fields.`
      );
    }
    for (const key of Object.keys(record as Record<string, unknown>)) {
      columns.add(key);
      if (columns.size > MAX_TABULAR_JSON_COLUMNS) {
        throw MalformedFileError(
          `JSON has more than ${MAX_TABULAR_JSON_COLUMNS} columns; reduce its width before analysis.`
        );
      }
    }
  }

  if (columns.size === 0) {
    throw MalformedFileError("JSON records do not contain any fields to analyze.");
  }
}

/**
 * Full validation pipeline for an uploaded tabular dataset.
 * Throws typed errors on any violation.
 */
export function validateTabularUpload(
  file: { name: string; size: number },
  buffer: Buffer,
  limits: { maxUploadBytes: number }
): ValidatedFile {
  const sanitized = sanitizeFilename(file.name);
  const declaredType = detectFileTypeFromFilename(sanitized);
  if (!declaredType) {
    throw UnsupportedFileError(
      `Unsupported file type. Allowed formats: ${allowedExtensions().join(", ")}.`
    );
  }

  if (buffer.length === 0) throw MalformedFileError("The uploaded file is empty.");
  if (buffer.length > ABSOLUTE_MAX_UPLOAD_BYTES) {
    throw FileTooLargeError(`Files up to ${Math.round(ABSOLUTE_MAX_UPLOAD_BYTES / 1024 / 1024)}MB are accepted.`);
  }
  if (buffer.length > limits.maxUploadBytes) {
    throw FileTooLargeError(
      `File exceeds your plan's upload limit of ${Math.round(limits.maxUploadBytes / 1024 / 1024)}MB. Upgrade to upload larger files.`
    );
  }

  const sniffed = sniffContent(buffer);

  // Content/extension agreement rules — mismatches are rejected, not coerced.
  if ((declaredType === DatasetFileType.XLSX || declaredType === DatasetFileType.XLS) && sniffed !== "zip") {
    throw MalformedFileError("File is not a valid Excel workbook (missing ZIP signature).");
  }
  if (sniffed === "zip" && declaredType !== DatasetFileType.XLSX && declaredType !== DatasetFileType.XLS) {
    throw MalformedFileError("Compressed/binary payload is not valid for this file type.");
  }
  if (sniffed === "pdf" || sniffed === "image") {
    throw UnsupportedFileError("PDF/image extraction is not enabled for tabular analysis pipelines.");
  }
  if (sniffed === "unknown") {
    throw MalformedFileError("File content could not be identified as CSV, TSV, JSON or XLSX.");
  }

  // Structural sanity for text formats.
  if (sniffed === "text") {
    const head = buffer.subarray(0, Math.min(buffer.length, 64 * 1024)).toString("utf8");
    const lineCount = head.split("\n").length;
    const maxLineLen = Math.max(...head.split("\n").slice(0, 100).map((l) => l.length), 0);
    if (maxLineLen > 1_000_000) {
      throw MalformedFileError("File contains implausibly long lines for tabular data.");
    }
    if (head.trim().length > 0 && lineCount < 1) {
      throw MalformedFileError("File does not contain readable rows.");
    }
    if (declaredType === DatasetFileType.JSON) {
      assertTabularJson(buffer);
    }
  }

  return {
    originalFilename: file.name,
    sanitizedFilename: sanitized,
    fileType: declaredType,
    buffer,
    sizeBytes: buffer.length,
  };
}

/** Guards against pathological workbooks (used by the analytics worker). */
export function assertWorkbookLimits(sheetCount: number, totalCells: number, maxSheets = 50, maxCells = 5_000_000): void {
  if (sheetCount > maxSheets) {
    throw new AppError("MALFORMED_FILE", `Workbook has ${sheetCount} sheets; limit is ${maxSheets}.`);
  }
  if (totalCells > maxCells) {
    throw new AppError("MALFORMED_FILE", `Workbook exceeds the maximum of ${maxCells} cells.`);
  }
}
