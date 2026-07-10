"use server";

import { revalidatePath } from "next/cache";
import * as xlsx from "xlsx";
import connectDB from "@/lib/db";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { ExtractedData, Notification } from "@/models";
import { ExtractionStatus, SupportedFileType } from "@/types";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";

// Mock AI Service since we don't have an active OpenAI key
async function mockAIProcess(prompt: string, textData: string): Promise<any> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
  
  return {
    summary: `AI Generated Report based on prompt: "${prompt}"`,
    insights: [
      "The dataset contains numerical trends indicating positive growth.",
      "Consider reviewing the outliers in the uploaded document.",
      "The AI successfully parsed the provided Excel content."
    ],
    rawDataLength: textData.length,
    timestamp: new Date().toISOString()
  };
}

export async function uploadAndProcess(formData: FormData): Promise<ActionResponse<string>> {
  try {
    const session = await requireTenantAdmin();
    const file = formData.get("file") as File;
    const prompt = formData.get("prompt") as string;
    const modelId = formData.get("modelId") as string;

    if (!file || !prompt || !modelId) {
      return actionError("File, Prompt, and Model are required.");
    }

    await connectDB();

    // 1. Parse Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = xlsx.read(arrayBuffer, { type: "buffer" });
    let combinedText = "";
    
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const json = xlsx.utils.sheet_to_json(sheet);
      combinedText += `Sheet: ${sheetName}\n${JSON.stringify(json, null, 2)}\n\n`;
    });

    // Limit text size for the mock processing
    const truncatedText = combinedText.substring(0, 5000);

    // 2. Create PENDING record
    const record = await ExtractedData.create({
      tenantId: session.userId,
      fileName: file.name,
      fileType: SupportedFileType.EXCEL,
      status: ExtractionStatus.PROCESSING,
      rawText: truncatedText,
      prompt: prompt,
      modelConfigId: modelId,
    });

    // 3. Process with AI (Mock)
    try {
      const result = await mockAIProcess(prompt, truncatedText);
      
      // Update record to COMPLETED
      record.status = ExtractionStatus.COMPLETED;
      record.result = result;
      await record.save();

      // Create a notification
      await Notification.create({
        tenantId: session.userId,
        title: "AI Report Ready",
        message: `Your file "${file.name}" has been processed successfully.`,
        type: "success"
      });

    } catch (aiError: any) {
      // Update record to FAILED
      record.status = ExtractionStatus.FAILED;
      record.errorMessage = aiError.message || "AI processing failed";
      await record.save();

      // Create a notification
      await Notification.create({
        tenantId: session.userId,
        title: "AI Processing Failed",
        message: `Failed to process "${file.name}".`,
        type: "error"
      });
      return actionError("AI Processing failed");
    }

    revalidatePath("/dashboard/data-explorer");
    return actionSuccess(record._id.toString(), "File processed successfully!");
  } catch (error) {
    return actionError(error);
  }
}
