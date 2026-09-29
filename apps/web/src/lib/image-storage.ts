import { installationRow } from "@ermes/db";
import { unseal } from "@ermes/core/secret-box";
import { ImageUploadError, type CloudinaryCredentials } from "./image-upload";

export async function imageStorageCredentials(): Promise<CloudinaryCredentials> {
  const { credentials } = await installationRow();
  const names = ["cloudinaryCloudName", "cloudinaryApiKey", "cloudinaryApiSecret"] as const;
  if (names.some(key => !credentials[key]))
    throw new ImageUploadError("Connect Cloudinary in Connections & setup to upload images.", 409);
  const [cloudName, apiKey, apiSecret] = names.map(key => unseal(credentials[key], key));
  return { cloudName, apiKey, apiSecret };
}

export function imageRouteError(error: unknown) {
  if (error instanceof ImageUploadError)
    return Response.json({ message: error.message }, { status: error.status });
  if (error instanceof Error && error.message === "Authentication required")
    return Response.json({ message: error.message }, { status: 401 });
  if (error instanceof Error && error.message === "Request origin is not allowed")
    return Response.json({ message: error.message }, { status: 403 });
  return Response.json({ message: "Could not access the image library. Please try again." }, { status: 500 });
}
