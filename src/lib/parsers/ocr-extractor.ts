/**
 * @file src/lib/parsers/ocr-extractor.ts
 * @description OCR (Optical Character Recognition) utility for extracting text
 * from invoice images (JPG, PNG, WEBP) and PDF files.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CURRENT STATUS: PLACEHOLDER IMPLEMENTATION
 * ═══════════════════════════════════════════════════════════════════
 *
 * This file defines the INTERFACE and PLACEHOLDER for OCR functionality.
 * The function signatures and return types are finalized — only the
 * internal implementation needs to be swapped for a real OCR engine.
 *
 * ═══════════════════════════════════════════════════════════════════
 * PRODUCTION IMPLEMENTATION OPTIONS:
 * ═══════════════════════════════════════════════════════════════════
 *
 * OPTION A — Google Cloud Vision API (best accuracy for invoices):
 *   npm install @google-cloud/vision
 *   const client = new vision.ImageAnnotatorClient();
 *   const [result] = await client.textDetection(imageBuffer);
 *   return result.fullTextAnnotation?.text ?? "";
 *
 * OPTION B — Tesseract.js (free, runs in Node.js, no external API):
 *   npm install tesseract.js
 *   const { data: { text } } = await Tesseract.recognize(imageBuffer, "eng+ara");
 *   return text;
 *
 * OPTION C — OpenAI Vision API (gpt-4o has built-in OCR):
 *   Send image as base64 in the messages array with content type "image_url".
 *   This SKIPS the separate OCR step and lets the AI model do it directly.
 *   Best for cloud models — see extractTextFromImageWithVision() below.
 *
 * OPTION D — Azure Document Intelligence (best for structured invoices):
 *   npm install @azure/ai-form-recognizer
 *   Uses pre-trained invoice models that return structured fields directly.
 *
 * ═══════════════════════════════════════════════════════════════════
 * PDF HANDLING NOTE:
 * ═══════════════════════════════════════════════════════════════════
 * For PDFs, we recommend:
 *   1. Text-based PDFs: npm install pdf-parse (extracts text directly)
 *   2. Scanned PDFs:    Convert pages to images first, then OCR each page.
 *      - Use: npm install pdf2pic (requires ImageMagick installed on server)
 */

export interface OcrResult {
  /** Extracted plain text from the document. */
  text: string;
  /** Confidence score 0–1 (if the OCR engine provides it). */
  confidence?: number;
  /** Number of pages processed (for PDFs). */
  pageCount?: number;
  /** Whether this is a placeholder or real OCR result. */
  isPlaceholder: boolean;
}

// ============================================================
// Primary OCR Entry Point
// ============================================================

/**
 * Extracts text from an image file (JPG, PNG, WEBP, GIF).
 * Currently returns a detailed placeholder — swap `_extractWithTesseract`
 * or `_extractWithGoogleVision` for a real implementation.
 *
 * @param {Buffer} imageBuffer - Raw image bytes.
 * @param {string} mimeType - MIME type (e.g., "image/jpeg", "image/png").
 * @returns {Promise<OcrResult>} Extracted text and metadata.
 *
 * @example
 * const buffer = Buffer.from(await file.arrayBuffer());
 * const { text } = await extractTextFromImage(buffer, "image/jpeg");
 * // text: "[OCR PLACEHOLDER] image/jpeg | 245KB — ready for Tesseract.js"
 */
export async function extractTextFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<OcrResult> {
  /**
   * ─────────────────────────────────────────────────────────
   * PLACEHOLDER IMPLEMENTATION
   * Replace the body of this function with a real OCR call.
   * ─────────────────────────────────────────────────────────
   *
   * Example with Tesseract.js:
   *   const { createWorker } = await import("tesseract.js");
   *   const worker = await createWorker("eng");
   *   const { data: { text, confidence } } = await worker.recognize(imageBuffer);
   *   await worker.terminate();
   *   return { text, confidence: confidence / 100, pageCount: 1, isPlaceholder: false };
   */

  const sizeKb = Math.round(imageBuffer.length / 1024);

  const placeholderText = [
    `[OCR PLACEHOLDER — Replace with real OCR engine]`,
    `File type: ${mimeType}`,
    `File size: ${sizeKb} KB`,
    ``,
    `This is a sample invoice text that would be extracted by OCR:`,
    ``,
    `INVOICE`,
    `Invoice Number: INV-2026-0042`,
    `Date: 2026-01-10`,
    `Due Date: 2026-02-10`,
    ``,
    `From: Acme Corporation`,
    `123 Business Ave, New York, NY 10001`,
    ``,
    `To: Client Company Ltd.`,
    `456 Client Street, Los Angeles, CA 90001`,
    ``,
    `ITEMS:`,
    `1. Software License (Annual)    $3,500.00`,
    `2. Implementation Services      $  750.00`,
    `3. Technical Support (3 months) $  250.00`,
    ``,
    `Subtotal: $4,500.00`,
    `Tax (10%):  $450.00`,
    `TOTAL:    $4,950.00`,
    ``,
    `Payment Terms: Net 30`,
    `Bank: First National Bank | Account: 1234567890 | Routing: 021000021`,
  ].join("\n");

  return {
    text:          placeholderText,
    confidence:    0.95,
    pageCount:     1,
    isPlaceholder: true,
  };
}

// ============================================================
// PDF Text Extraction
// ============================================================

/**
 * Extracts text from a PDF file.
 * For text-based PDFs: parses the PDF text layer directly (no OCR needed).
 * For scanned PDFs: falls back to image-based OCR (placeholder here).
 *
 * @param {Buffer} pdfBuffer - Raw PDF bytes.
 * @returns {Promise<OcrResult>} Extracted text.
 *
 * @example
 * // Production implementation with pdf-parse:
 * import pdfParse from "pdf-parse";
 * const data = await pdfParse(pdfBuffer);
 * return { text: data.text, pageCount: data.numpages, isPlaceholder: false };
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<OcrResult> {
  /**
   * PLACEHOLDER — Replace with:
   *
   * import pdfParse from "pdf-parse";
   * const data = await pdfParse(pdfBuffer);
   * return {
   *   text:          data.text,
   *   pageCount:     data.numpages,
   *   isPlaceholder: false,
   * };
   */

  const sizeKb = Math.round(pdfBuffer.length / 1024);

  const placeholderText = [
    `[PDF TEXT EXTRACTION PLACEHOLDER]`,
    `File size: ${sizeKb} KB`,
    ``,
    `Install pdf-parse to enable real PDF text extraction:`,
    `  npm install pdf-parse @types/pdf-parse`,
    ``,
    `Sample extracted PDF text:`,
    ``,
    `CONTRACT AGREEMENT`,
    `Date: January 10, 2026`,
    ``,
    `This agreement is entered into between Party A (Vendor) and Party B (Client)...`,
    `Total Contract Value: $25,000.00`,
    `Payment Schedule: Monthly installments of $2,083.33`,
  ].join("\n");

  return {
    text:          placeholderText,
    pageCount:     1,
    isPlaceholder: true,
  };
}

// ============================================================
// Vision API Path (for models that support image input natively)
// ============================================================

/**
 * Prepares an image for direct submission to a vision-capable AI model
 * (e.g., GPT-4o, Claude 3, Gemini 1.5 Pro).
 *
 * Instead of running OCR separately, vision models can "see" the image
 * and extract text + structure in a single API call.
 *
 * @param {Buffer} imageBuffer - Raw image bytes.
 * @param {string} mimeType - MIME type of the image.
 * @returns {{ type: "image_url"; image_url: { url: string } }} OpenAI message content part.
 */
export function prepareImageForVisionModel(
  imageBuffer: Buffer,
  mimeType: string
): { type: "image_url"; image_url: { url: string } } {
  const base64 = imageBuffer.toString("base64");
  return {
    type:      "image_url",
    image_url: { url: `data:${mimeType};base64,${base64}` },
  };
}
