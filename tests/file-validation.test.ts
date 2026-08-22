/**
 * File validation tests — magic bytes, sanitization, limits.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  (globalThis as { __appEnv?: unknown }).__appEnv = undefined;
  process.env = {
    ...process.env,
    MONGODB_URI: "mongodb://localhost:27017/test",
    NEXTAUTH_SECRET: "0123456789abcdef0123456789abcdef",
  };
});

const load = async () => await import("@/lib/files/validation");

describe("sanitizeFilename", () => {
  it("strips path traversal", async () => {
    const v = await load();
    expect(v.sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(v.sanitizeFilename("..\\..\\windows\\system32\\evil.csv")).toBe("evil.csv");
  });

  it("strips control characters and caps length", async () => {
    const v = await load();
    const cleaned = v.sanitizeFilename("bad\x00name\x1f.csv");
    expect(cleaned).not.toMatch(/[\x00-\x1f]/);
    const long = v.sanitizeFilename("a".repeat(500) + ".csv");
    expect(long.length).toBeLessThanOrEqual(200);
  });
});

describe("sniffContent", () => {
  it("identifies zip (xlsx container)", async () => {
    const v = await load();
    const buf = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("rest")]);
    expect(v.sniffContent(buf)).toBe("zip");
  });

  it("identifies pdf", async () => {
    const v = await load();
    expect(v.sniffContent(Buffer.from("%PDF-1.7 fake"))).toBe("pdf");
  });

  it("identifies text", async () => {
    const v = await load();
    expect(v.sniffContent(Buffer.from("a,b,c\n1,2,3\n"))).toBe("text");
  });

  it("flags binary garbage as unknown", async () => {
    const v = await load();
    const binary = Buffer.concat([Buffer.from([0x00, 0x01, 0x02]), crypto_random(100)]);
    expect(v.sniffContent(binary)).toBe("unknown");
  });
});

function crypto_random(n: number): Buffer {
  // Deterministic pseudo-random for tests is fine here.
  let seed = 42;
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out[i] = seed & 0xff;
  }
  return out;
}

describe("validateTabularUpload", () => {
  const limits = { maxUploadBytes: 1024 * 1024 };

  it("accepts a valid CSV", async () => {
    const v = await load();
    const result = v.validateTabularUpload(
      { name: "data.csv", size: 12 },
      Buffer.from("a,b\n1,2\n"),
      limits
    );
    expect(result.fileType).toBe("csv");
    expect(result.sizeBytes).toBe(8);
  });

  it("rejects disallowed extensions", async () => {
    const v = await load();
    expect(() =>
      v.validateTabularUpload({ name: "virus.exe", size: 10 }, Buffer.from("MZ..."), limits)
    ).toThrow(/Unsupported file type/);
  });

  it("rejects empty files", async () => {
    const v = await load();
    expect(() =>
      v.validateTabularUpload({ name: "empty.csv", size: 0 }, Buffer.alloc(0), limits)
    ).toThrow(/empty/);
  });

  it("rejects plan-limit violations with a distinct error", async () => {
    const v = await load();
    const big = Buffer.alloc(2048, "a".charCodeAt(0));
    try {
      v.validateTabularUpload({ name: "big.csv", size: big.length }, big, { maxUploadBytes: 1024 });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toMatch(/plan's upload limit/);
    }
  });

  it("rejects xlsx without ZIP signature (mislabeled file)", async () => {
    const v = await load();
    expect(() =>
      v.validateTabularUpload({ name: "fake.xlsx", size: 20 }, Buffer.from("this is not a zip"), limits)
    ).toThrow(/not a valid Excel workbook/);
  });

  it("rejects CSV containing zip content (mislabeled)", async () => {
    const v = await load();
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("PKzip")]);
    expect(() =>
      v.validateTabularUpload({ name: "weird.csv", size: zip.length }, zip, limits)
    ).toThrow(/Compressed\/binary payload/);
  });

  it("rejects PDF masquerading as anything tabular", async () => {
    const v = await load();
    const pdf = Buffer.from("%PDF-1.7 ...");
    expect(() =>
      v.validateTabularUpload({ name: "doc.csv", size: pdf.length }, pdf, limits)
    ).toThrow(/not enabled/);
  });

  it("accepts an array of JSON records", async () => {
    const v = await load();
    const json = Buffer.from('[{"id":1,"name":"A"},{"id":2,"name":"B"}]');
    const result = v.validateTabularUpload(
      { name: "records.json", size: json.length },
      json,
      limits
    );
    expect(result.fileType).toBe("json");
  });

  it("accepts a JSON export object containing a records array", async () => {
    const v = await load();
    const json = Buffer.from('{"meta":{"source":"test"},"rows":[{"id":1},{"id":2}]}');
    expect(() =>
      v.validateTabularUpload({ name: "export.json", size: json.length }, json, limits)
    ).not.toThrow();
  });

  it("rejects malformed JSON before it can be queued", async () => {
    const v = await load();
    const json = Buffer.from('[{"id":1},]');
    expect(() =>
      v.validateTabularUpload({ name: "broken.json", size: json.length }, json, limits)
    ).toThrow(/Invalid JSON/);
  });

  it("rejects JSON arrays of scalar values", async () => {
    const v = await load();
    const json = Buffer.from('[1,2,3]');
    expect(() =>
      v.validateTabularUpload({ name: "scalars.json", size: json.length }, json, limits)
    ).toThrow(/record 1 must be an object/);
  });
});
