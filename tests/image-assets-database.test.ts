import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { getPool, runMigrations, listImageAssets, saveImageAsset, saveIntegrations, getCredential, installationStatus } from "../packages/db/dist/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
after(async () => { if (databaseUrl) await getPool().end(); });

test("image credentials remain encrypted; the library persists, searches literal names and paginates", {
  skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured",
}, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/ermes_test");
  process.env.ERMES_ENCRYPTION_KEY = "ab".repeat(32);
  await runMigrations();
  await getPool().query("TRUNCATE ermes_image_asset");
  await saveIntegrations({ cloudinaryCloudName: "fixture-cloud", cloudinaryApiKey: "123456789012345", cloudinaryApiSecret: "fixture-cloudinary-secret" });
  await saveIntegrations({});
  assert.equal(await getCredential("cloudinaryApiSecret"), "fixture-cloudinary-secret");
  const status = await installationStatus();
  assert.equal(status.credentials.cloudinaryApiSecret, true);
  assert.doesNotMatch(JSON.stringify(status), /fixture-cloudinary-secret|123456789012345/);
  const { rows } = await getPool().query("SELECT credentials FROM ermes_installation WHERE id=1");
  assert.doesNotMatch(JSON.stringify(rows), /fixture-cloudinary-secret|123456789012345|fixture-cloud/);
  for (let index = 0; index < 42; index++) {
    const id = randomUUID();
    const asset = await saveImageAsset({ id, cloudName: "fixture-cloud", publicId: `ermes/images/${id}`,
      filename: index === 0 ? "50%_offer.png" : `image-${index}.png`,
      url: `https://res.cloudinary.com/fixture-cloud/image/upload/${id}.png`,
      bytes: 100, width: 1, height: 1, mimeType: "image/png" });
    assert.ok(asset.createdAt);
    assert.equal("cloudName" in asset, false);
    assert.equal("publicId" in asset, false);
  }
  const first = await listImageAssets();
  assert.equal(first.assets.length, 40);
  assert.equal(first.nextOffset, 40);
  const second = await listImageAssets("", first.nextOffset!);
  assert.equal(second.assets.length, 2);
  assert.equal(second.nextOffset, null);
  assert.equal(new Set([...first.assets, ...second.assets].map(asset => asset.id)).size, 42);
  assert.equal((await listImageAssets("%_")).assets.length, 1);
  assert.equal((await listImageAssets("' OR 1=1 --")).assets.length, 0);
});
