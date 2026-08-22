import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("React client boundaries", () => {
  it("marks every useI18n consumer as a Client Component", () => {
    const offenders = sourceFiles(sourceRoot)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        if (!/\buseI18n\s*\(/.test(source) || /export\s+function\s+useI18n/.test(source)) {
          return false;
        }

        return !/^\uFEFF?\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["'];/.test(source);
      })
      .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"));

    expect(offenders, `Missing \"use client\" in: ${offenders.join(", ")}`).toEqual([]);
  });
});
