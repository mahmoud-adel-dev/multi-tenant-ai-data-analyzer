/**
 * Zod schemas validating every AI-produced structure before use.
 * Model output is never trusted blindly — anything failing validation is
 * discarded and the pipeline continues without narrative.
 */
import { z } from "zod";

export const AiNarrativeSchema = z.object({
  executiveSummary: z.string().min(1).max(4000),
  keyInsights: z.array(z.string().min(1).max(1000)).max(10),
  recommendations: z.array(z.string().min(1).max(1000)).max(10),
  limitationsAcknowledged: z.array(z.string().min(1).max(500)).max(10),
});

export const DatasetQuestionAnswerSchema = z.object({
  answer: z.string().min(1).max(6000),
  referencedMetricIds: z.array(z.string().max(120)).max(20).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  caveat: z.string().max(1000).nullable().optional(),
});

export type AiNarrativeValidated = z.infer<typeof AiNarrativeSchema>;
export type DatasetAnswer = z.infer<typeof DatasetQuestionAnswerSchema>;
