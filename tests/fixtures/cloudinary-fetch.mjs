// Test-only preload: NODE_OPTIONS=--import=.../tests/fixtures/cloudinary-fetch.mjs
// Use only with an isolated browser-test database and synthetic credentials.
import { createHash } from "node:crypto";
if (new URL(process.env.DATABASE_URL).pathname !== "/ermes_images_browser")
  throw new Error(
    "Cloudinary fixture requires the isolated ermes_images_browser database",
  );
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith("https://api.cloudinary.com/"))
    return realFetch(input, init);
  const form = init.body;
  const params = [...form.entries()].filter(
    ([key]) => !["file", "signature", "api_key"].includes(key),
  );
  const signature = createHash("sha256")
    .update(
      params
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("&") + "synthetic-cloudinary-secret",
    )
    .digest("hex");
  if (
    !url.startsWith("https://api.cloudinary.com/v1_1/synthetic-cloud/image/") ||
    form.get("api_key") !== "123456789012345" ||
    signature !== form.get("signature")
  )
    return Response.json(
      { error: { message: "Invalid synthetic credentials" } },
      { status: 401 },
    );
  if (url.endsWith("/destroy")) return Response.json({ result: "ok" });
  return Response.json({
    public_id: form.get("public_id"),
    resource_type: "image",
    type: "upload",
    format: "png",
    secure_url: `https://res.cloudinary.com/synthetic-cloud/image/upload/v1/${form.get("public_id")}.png`,
    bytes: form.get("file").size,
    width: 1,
    height: 1,
  });
};
