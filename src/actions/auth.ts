"use server";

/**
 * @file src/actions/auth.ts
 * @description Server Action for registering a new tenant.
 * Note: Login and Logout are now handled by NextAuth.js on the client-side.
 */

import bcrypt from "bcryptjs";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Tenant } from "@/models";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";
import { UserRole } from "@/types";

// ============================================================
// Validation Schemas
// ============================================================

const RegisterSchema = z.object({
  name:     z.string().min(2, "Name must be at least 2 characters.").max(100),
  email:    z.string().email("Invalid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

// ============================================================
// REGISTER (Tenant Self-Registration)
// ============================================================

/**
 * Registers a new tenant account.
 * New registrations always get the TENANT_ADMIN role.
 * 
 * After successful registration, the client component should call 
 * NextAuth's signIn("credentials") to log the user in automatically.
 *
 * @param {{ name: string; email: string; password: string }} data
 * @returns {Promise<ActionResponse<boolean>>} True if created successfully
 */
export async function register(data: {
  name: string;
  email: string;
  password: string;
}): Promise<ActionResponse<boolean>> {
  try {
    const parsed = RegisterSchema.safeParse(data);
    if (!parsed.success) {
      return actionError(parsed.error.errors[0].message);
    }

    await connectDB();

    // Check for existing account.
    const exists = await Tenant.findOne({ email: parsed.data.email.toLowerCase() });
    if (exists) {
      return actionError("An account with this email already exists.");
    }

    // Hash the password with bcrypt (cost factor 12)
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    await Tenant.create({
      name:         parsed.data.name,
      email:        parsed.data.email.toLowerCase(),
      passwordHash,
      role:         UserRole.TENANT_ADMIN,
      isActive:     true,
    });

    return actionSuccess(true);
  } catch (error) {
    return actionError(error);
  }
}
