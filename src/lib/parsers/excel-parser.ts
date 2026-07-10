/**
 * @file src/lib/parsers/excel-parser.ts
 * @description Parses Excel files (.xlsx, .xls) into a plain text representation
 * suitable for AI analysis.
 *
 * LIBRARY: SheetJS (xlsx) — the most comprehensive Excel parser for Node.js.
 * It handles: .xlsx, .xls, .xlsm, .xlsb, .csv, .ods formats.
 *
 * OUTPUT FORMAT:
 * Each sheet is converted to CSV and labeled with its sheet name.
 * This preserves the tabular structure while making it readable by the AI.
 *
 * Example output:
 *   === Sheet: Invoice Data ===
 *   Vendor,Amount,Date,Category
 *   Acme Corp,4250.00,2026-01-10,Software
 *   XYZ Ltd,890.50,2026-01-15,Hardware
 *
 *   === Sheet: Summary ===
 *   Total,5140.50
 */

import * as XLSX from "xlsx";

export interface ExcelParseResult {
  /** Concatenated text of all sheets — sent to the AI model. */
  text: string;
  /** Metadata about the parsed workbook. */
  meta: {
    sheetCount: number;
    sheetNames: string[];
    /** Total number of non-empty rows across all sheets. */
    totalRows: number;
  };
}

/**
 * Parses an Excel file buffer into structured text.
 *
 * @param {Buffer} buffer - Raw file bytes (from form upload or fs.readFile).
 * @returns {ExcelParseResult} Parsed text and metadata.
 * @throws {Error} If the buffer is not a valid Excel file.
 *
 * @example
 * const buffer = Buffer.from(await file.arrayBuffer());
 * const { text, meta } = parseExcel(buffer);
 * console.log(`Parsed ${meta.sheetCount} sheets, ${meta.totalRows} rows`);
 */
export function parseExcel(buffer: Buffer): ExcelParseResult {
  /**
   * XLSX.read parses the raw bytes.
   * cellDates: true — converts date serial numbers to JS Date objects.
   * defval: ""      — empty cells become "" instead of undefined.
   */
  const workbook = XLSX.read(buffer, {
    type:      "buffer",
    cellDates: true,
    defval:    "",
  });

  const sheetNames = workbook.SheetNames;
  const sections: string[] = [];
  let totalRows = 0;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];

    /**
     * Get the sheet range to count rows.
     * sheet["!ref"] contains the used range like "A1:D50".
     */
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
    const rowCount = range.e.r - range.s.r + 1;
    totalRows += rowCount;

    /**
     * Convert sheet to CSV text.
     * This preserves headers and all cell values in a compact format
     * that LLMs handle well.
     */
    const csvText = XLSX.utils.sheet_to_csv(sheet, {
      blankrows: false, // Skip completely empty rows.
      strip:     true,  // Remove leading/trailing whitespace from cells.
    });

    if (csvText.trim()) {
      sections.push(`=== Sheet: ${sheetName} ===\n${csvText}`);
    }
  }

  return {
    text: sections.join("\n\n"),
    meta: { sheetCount: sheetNames.length, sheetNames, totalRows },
  };
}
