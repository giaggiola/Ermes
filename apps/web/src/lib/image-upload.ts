import { createHash, randomUUID } from "node:crypto";
import { MAX_IMAGE_BYTES, IMAGE_MIME_TYPES } from "@ermes/core/assets";
import type { NewImageAsset } from "@ermes/db";

export class ImageUploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

// Bound the stream before parsing multipart data, including requests without a
// Content-Length header. The extra space covers the multipart envelope.
export async function readImageUpload(request: Request): Promise<File> {
  const maxBody = MAX_IMAGE_BYTES + 64 * 1024;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;"))
    throw new ImageUploadError("Choose an image file to upload.");
  if (Number(request.headers.get("content-length")) > maxBody)
    throw new ImageUploadError("Images must be 10 MB or smaller.", 413);
  if (!request.body) throw new ImageUploadError("Choose an image file to upload.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBody) {
        await reader.cancel();
        throw new ImageUploadError("Images must be 10 MB or smaller.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new ImageUploadError("Could not read the upload. Choose the file again.");
  }
  const files = form.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File))
    throw new ImageUploadError("Choose one image file to upload.");
  await validateImageFile(files[0]);
  return files[0];
}

export async function validateImageFile(file: File) {
  if (!file.size) throw new ImageUploadError("The selected file is empty.");
  if (file.size > MAX_IMAGE_BYTES)
    throw new ImageUploadError("Images must be 10 MB or smaller.", 413);
  const head = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const detected = head.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    ? "image/png"
    : head.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
      ? "image/jpeg"
      : ["GIF87a", "GIF89a"].includes(head.subarray(0, 6).toString("ascii"))
        ? "image/gif"
        : head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP"
          ? "image/webp" : undefined;
  if (!detected || detected !== file.type || !IMAGE_MIME_TYPES.includes(file.type as typeof IMAGE_MIME_TYPES[number]))
    throw new ImageUploadError("Choose a JPEG, PNG, GIF or WebP image.");
}

function signedForm(parameters: Record<string, string>, credentials: CloudinaryCredentials) {
  const form = new FormData();
  for (const [key, value] of Object.entries(parameters)) form.set(key, value);
  const toSign = Object.keys(parameters).sort().map(key => `${key}=${parameters[key]}`).join("&");
  form.set("signature", createHash("sha256").update(toSign + credentials.apiSecret).digest("hex"));
  form.set("api_key", credentials.apiKey);
  return form;
}

async function cloudinaryRequest(
  action: "upload" | "destroy", body: FormData, credentials: CloudinaryCredentials,
  fetcher: typeof fetch,
) {
  if (!/^[a-z0-9_-]{1,128}$/.test(credentials.cloudName))
    throw new ImageUploadError("Check your Cloudinary cloud name in Connections & setup.", 409);
  let response: Response;
  try {
    response = await fetcher(`https://api.cloudinary.com/v1_1/${credentials.cloudName}/image/${action}`, {
      method: "POST", body, signal: AbortSignal.timeout(60_000), redirect: "error",
    });
  } catch {
    throw new ImageUploadError("Could not reach Cloudinary. Please try again.", 502);
  }
  // Provider errors may contain submitted credentials or signature inputs.
  if (!response.ok)
    throw new ImageUploadError("Cloudinary rejected the upload. Check your credentials, image and account limits.", 502);
  try { return await response.json(); }
  catch { throw new ImageUploadError("Cloudinary returned an invalid response. Please try again.", 502); }
}

export async function uploadImage(
  file: File, credentials: CloudinaryCredentials,
  save: (asset: NewImageAsset) => Promise<unknown>, fetcher: typeof fetch = fetch,
) {
  await validateImageFile(file);
  const id = randomUUID(), publicId = `ermes/images/${id}`;
  const form = signedForm({
    timestamp: String(Math.floor(Date.now() / 1000)),
    public_id: publicId, overwrite: "false", allowed_formats: "jpg,png,gif,webp",
  }, credentials);
  form.set("file", file);
  const result = await cloudinaryRequest("upload", form, credentials, fetcher);
  let stored = false;
  try {
    const url = new URL(result.secure_url);
    if (result.public_id !== publicId || result.resource_type !== "image" || result.type !== "upload" ||
        !["jpg", "png", "gif", "webp"].includes(result.format) ||
        url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password ||
        !url.pathname.startsWith(`/${credentials.cloudName}/image/upload/`) ||
        ![result.bytes, result.width, result.height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647))
      throw new Error("Invalid upload response");
    const asset = await save({
      id, cloudName: credentials.cloudName, publicId, url: url.href,
      filename: file.name.replace(/\\/g, "/").split("/").pop()!.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 255) || "Image",
      mimeType: file.type, bytes: result.bytes, width: result.width, height: result.height,
    });
    stored = true;
    return asset;
  } catch {
    throw new ImageUploadError("The image could not be saved to your library. Please try again.", 502);
  } finally {
    if (!stored) {
      // Clean up only the unique asset created by this request. Never overwrite
      // or delete an existing image referenced by a form or an email.
      try {
        await cloudinaryRequest("destroy", signedForm({
          public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)),
        }, credentials), credentials, fetcher);
      } catch { console.error("Could not clean up an unrecorded image upload."); }
    }
  }
}
