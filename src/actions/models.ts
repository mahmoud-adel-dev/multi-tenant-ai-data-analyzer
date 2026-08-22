"use server";

import connectDB from "@/lib/db";
import { AiModelConfig } from "@/models";
import { requireAuth } from "@/lib/auth/dal";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";

export interface ModelDTO {
  id: string;
  name: string;
  providerType: "cloud" | "local";
}

/** Lists the active AI model (name only — no credentials). */
export async function getActiveModels(): Promise<ActionResponse<ModelDTO[]>> {
  try {
    await requireAuth();
    await connectDB();

    const models = await AiModelConfig.find({ isActive: true })
      .select("_id name providerType")
      .lean<Array<{ _id: unknown; name: string; providerType: "cloud" | "local" }>>();

    return actionSuccess(
      models.map((m) => ({
        id: String(m._id),
        name: m.name,
        providerType: m.providerType,
      }))
    );
  } catch (error) {
    return actionError(error);
  }
}
