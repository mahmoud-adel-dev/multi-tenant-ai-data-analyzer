/**
 * @file src/models/index.ts
 * @description Barrel export for all Mongoose models.
 *
 * WHY A BARREL EXPORT?
 * Instead of importing models from their individual files everywhere:
 *   import Tenant from "@/models/Tenant";
 *   import ApiKey from "@/models/ApiKey";
 *
 * You can import multiple models from one place:
 *   import { Tenant, ApiKey, AiModelConfig, ExtractedData } from "@/models";
 *
 * IMPORTANT: Importing from this file also guarantees that all Mongoose
 * schemas are registered before any query runs. This is important in
 * Next.js where modules may be loaded in any order.
 */

export { default as Tenant }          from "./Tenant";
export { default as ApiKey }          from "./ApiKey";
export { default as AiModelConfig }   from "./AiModelConfig";
export { default as ExtractedData }   from "./ExtractedData";
export { default as Notification }    from "./Notification";

// Re-export interfaces for use in Server Actions and other files.
export type { ITenant, ITenantQuotas }  from "./Tenant";
export type { IApiKey }                 from "./ApiKey";
export type { IAiModelConfig }          from "./AiModelConfig";
export type { IExtractedData }          from "./ExtractedData";
