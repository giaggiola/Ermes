import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { MAX_IMAGE_BYTES } from "../packages/core/dist/assets.js";
import {
  readImageUpload,
  uploadImage,
  validateImageFile,
} from "../apps/web/src/lib/image-upload.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
  "base64",
);
const credentials = {
  cloudName: "synthetic-cloud",
  apiKey: "123456789012345",
  apiSecret: "synthetic-cloudinary-secret",
};
const imageFile = () =>
  new File([png], "form-image.png", { type: "image/png" });

function requestWith(file: File | string) {
  const body = new FormData();
  body.set("file", file);
  return new Request("http://localhost/api/assets/upload", {
    method: "POST",
    body,
  });
}

test("uploads accept real raster files and reject spoofed types, URLs, empty and oversized files", async () => {
  const parsed = await readImageUpload(requestWith(imageFile()));
  assert.equal(parsed.name, "form-image.png");
  assert.equal(parsed.size, png.length);
  await assert.rejects(
    readImageUpload(requestWith("https://example.test/file.png")),
    /one image file/,
  );
  await assert.rejects(
    validateImageFile(
      new File(["<svg><script>alert(1)</script></svg>"], "fake.png", {
        type: "image/png",
      }),
    ),
    /JPEG/,
  );
  await assert.rejects(
    validateImageFile(new File([png], "fake.jpg", { type: "image/jpeg" })),
    /JPEG/,
  );
  await assert.rejects(
    validateImageFile(new File([], "empty.png", { type: "image/png" })),
    /empty/,
  );
  await assert.rejects(
    validateImageFile(
      new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", {
        type: "image/png",
      }),
    ),
    /10 MB/,
  );
  await assert.rejects(
    readImageUpload(
      new Request("http://localhost", {
        method: "POST",
        body: "invalid",
        headers: { "content-type": "multipart/form-data; boundary=invalid" },
      }),
    ),
    /Could not read/,
  );
});

test("streaming multipart bodies are bounded even without Content-Length", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost", {
    method: "POST",
    body,
    duplex: "half",
    headers: { "content-type": "multipart/form-data; boundary=test" },
  } as RequestInit);
  await assert.rejects(
    readImageUpload(request),
    (error) => error.status === 413,
  );
  assert.equal(cancelled, true);
});

function successfulUpload(body: FormData) {
  const id = body.get("public_id");
  return Response.json({
    public_id: id,
    resource_type: "image",
    type: "upload",
    format: "png",
    secure_url: `https://res.cloudinary.com/synthetic-cloud/image/upload/v1/${id}.png`,
    bytes: png.length,
    width: 1,
    height: 1,
  });
}

test("signed Cloudinary upload saves a durable image record without exposing credentials", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(
      String(url),
      "https://api.cloudinary.com/v1_1/synthetic-cloud/image/upload",
    );
    const form = init?.body as FormData;
    assert.equal(form.get("api_secret"), null);
    assert.equal(form.get("api_key"), credentials.apiKey);
    assert.equal(form.get("overwrite"), "false");
    assert.equal(form.get("allowed_formats"), "jpg,png,gif,webp");
    assert.match(
      String(form.get("public_id")),
      /^ermes\/images\/[a-f0-9-]{36}$/,
    );
    const expected = createHash("sha256")
      .update(
        `allowed_formats=jpg,png,gif,webp&overwrite=false&public_id=${form.get("public_id")}&timestamp=${form.get("timestamp")}${credentials.apiSecret}`,
      )
      .digest("hex");
    assert.equal(form.get("signature"), expected);
    assert.ok(form.get("file") instanceof File);
    return successfulUpload(form);
  };
  let saved;
  await uploadImage(
    imageFile(),
    credentials,
    async (asset) => {
      saved = asset;
      return asset;
    },
    fetcher,
  );
  assert.equal(calls.length, 1);
  assert.equal(saved.filename, "form-image.png");
  assert.equal(saved.cloudName, credentials.cloudName);
  assert.match(saved.url, /^https:\/\/res.cloudinary.com\//);
  assert.doesNotMatch(
    JSON.stringify(saved),
    /synthetic-cloudinary-secret|123456789012345|signature/,
  );
});

test("provider failures are redacted and do not create library records", async () => {
  let saved = false;
  await assert.rejects(
    uploadImage(
      imageFile(),
      credentials,
      async () => {
        saved = true;
      },
      async () =>
        Response.json(
          { error: { message: `Invalid ${credentials.apiSecret}` } },
          { status: 401 },
        ),
    ),
    (error) => {
      assert.equal(error.status, 502);
      assert.doesNotMatch(error.message, /synthetic-cloudinary-secret/);
      return true;
    },
  );
  assert.equal(saved, false);
});

test("failed persistence cleans up only the new image; unsafe provider URLs cannot enter the library", async () => {
  for (const invalidUrl of [false, true]) {
    const calls: { action: string; id: string }[] = [];
    let saveCount = 0;
    const fetcher: typeof fetch = async (url, init) => {
      const form = init?.body as FormData;
      calls.push({
        action: String(url).split("/").pop()!,
        id: String(form.get("public_id")),
      });
      if (String(url).endsWith("/destroy"))
        return Response.json({ result: "ok" });
      const response = await successfulUpload(form).json();
      if (invalidUrl)
        response.secure_url = "https://untrusted.example/image.png";
      return Response.json(response);
    };
    await assert.rejects(
      uploadImage(
        imageFile(),
        credentials,
        async () => {
          saveCount++;
          throw new Error("private database error");
        },
        fetcher,
      ),
      /could not be saved/,
    );
    assert.equal(saveCount, invalidUrl ? 0 : 1);
    assert.deepEqual(
      calls.map((call) => call.action),
      ["upload", "destroy"],
    );
    assert.equal(calls[0].id, calls[1].id);
  }
});
