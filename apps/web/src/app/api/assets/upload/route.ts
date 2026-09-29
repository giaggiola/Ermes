import type { NextRequest } from "next/server";
import { saveImageAsset } from "@ermes/db";
import { authenticateBrowser } from "@/lib/session";
import { imageRouteError, imageStorageCredentials } from "@/lib/image-storage";
import { readImageUpload, uploadImage } from "@/lib/image-upload";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await authenticateBrowser(request);
    const credentials = await imageStorageCredentials();
    const file = await readImageUpload(request);
    const asset = await uploadImage(file, credentials, saveImageAsset);
    return Response.json(asset, { status: 201 });
  } catch (error) {
    return imageRouteError(error);
  }
}
