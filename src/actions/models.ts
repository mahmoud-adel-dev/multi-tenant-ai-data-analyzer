"use server";

import connectDB from "@/lib/db";
import { requireAuth } from "@/lib/auth/dal";
import { AiModelConfig } from "@/models";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";

export interface ModelDTO {
  id: string;
  name: string;
  provider: string;
}

export async function getActiveModels(): Promise<ActionResponse<ModelDTO[]>> {
  try {
    await requireAuth(); // Any authenticated user can list active models
    await connectDB();

    const models = await AiModelConfig.find({ isActive: true })
      .select("_id name provider")
      .lean<any[]>();

    const dtos: ModelDTO[] = models.map((m) => ({
      id: m._id.toString(),
      name: m.name,
      provider: m.provider,
    }));

    return actionSuccess(dtos);
  } catch (error) {
    return actionError(error);
  }
}
