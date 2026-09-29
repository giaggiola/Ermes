import type { NextRequest } from "next/server";
import { installationStatus, listImageAssets } from "@ermes/db";
import { authenticateBrowser } from "@/lib/session";
import { imageRouteError } from "@/lib/image-storage";
import { ImageUploadError } from "@/lib/image-upload";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await authenticateBrowser(request);
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)
      throw new ImageUploadError("Invalid image library page.");
    const [page, status] = await Promise.all([
      listImageAssets(request.nextUrl.searchParams.get("search") ?? "", offset),
      installationStatus(),
    ]);
    return Response.json(
      {
        ...page,
        configured: [
          "cloudinaryCloudName",
          "cloudinaryApiKey",
          "cloudinaryApiSecret",
        ].every((key) => status.credentials[key]),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return imageRouteError(error);
  }
}
