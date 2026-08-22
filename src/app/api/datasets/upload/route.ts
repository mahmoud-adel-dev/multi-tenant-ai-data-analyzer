/**
 * Browser upload transport.
 *
 * Server Actions do not expose upload progress to the browser. This route
 * keeps the existing uploadDataset workflow as the single source of truth,
 * while allowing the client to send multipart bytes with XMLHttpRequest.
 */
import type { NextRequest } from "next/server";
import { uploadDataset } from "@/actions/datasets";
import { requireOrgRole } from "@/lib/auth/dal";
import { actionError, type ActionResponse } from "@/lib/utils";
import { AuthorizationError, ValidationError, toAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function jsonAction<T>(payload: ActionResponse<T>, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  // Some non-browser/test clients omit Origin. Session authentication remains
  // mandatory; when browsers send Origin, reject cross-site cookie requests.
  if (!origin) return;

  let submittedOrigin: string;
  try {
    submittedOrigin = new URL(origin).origin;
  } catch {
    throw AuthorizationError("Invalid upload request origin.");
  }

  if (submittedOrigin !== request.nextUrl.origin) {
    throw AuthorizationError("Cross-site upload requests are not allowed.");
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    assertSameOrigin(request);
    // Authenticate before allocating memory to an untrusted multipart body.
    // uploadDataset repeats the check so its direct Server Action entry point
    // remains independently protected.
    await requireOrgRole("analyst");

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("multipart/form-data")) {
      throw ValidationError("Upload body must use multipart/form-data.");
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      throw new Error("Malformed multipart upload body.", { cause: error });
    }

    if (!(formData.get("file") instanceof File)) {
      throw ValidationError("Multipart body must include a 'file' field.");
    }

    // Return the Server Action envelope unchanged so both transports have the
    // same success/error contract.
    return jsonAction(await uploadDataset(formData));
  } catch (error) {
    const malformedMultipart =
      error instanceof Error && error.message === "Malformed multipart upload body.";
    const normalized = malformedMultipart
      ? ValidationError("The upload request is malformed or incomplete.")
      : error;
    const appError = toAppError(normalized);
    return jsonAction(actionError(normalized), appError.status);
  }
}
