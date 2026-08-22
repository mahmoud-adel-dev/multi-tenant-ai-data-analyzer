import { describe, expect, it } from "vitest";
import AnalysisJob from "@/models/AnalysisJob";
import { UsageLedger } from "@/models/Usage";

function indexOptions(
  indexes: ReturnType<typeof AnalysisJob.schema.indexes>,
  expectedKey: Record<string, number>
) {
  return indexes.find(([key]) => JSON.stringify(key) === JSON.stringify(expectedKey))?.[1];
}

describe("nullable idempotency indexes", () => {
  it("indexes only string AnalysisJob idempotency keys", () => {
    const options = indexOptions(AnalysisJob.schema.indexes(), { idempotencyKey: 1 });

    expect(options).toMatchObject({
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
    });
  });

  it("indexes only string UsageLedger idempotency keys", () => {
    const options = indexOptions(UsageLedger.schema.indexes(), {
      orgId: 1,
      idempotencyKey: 1,
    });

    expect(options).toMatchObject({
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
    });
  });
});
