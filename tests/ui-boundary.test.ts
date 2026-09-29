import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createAdminTransport } from "../packages/ui/src/transport.ts";

test("the same UI transport supports standalone and embedded applications", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.credentials, "same-origin");
    return Response.json({ ok: true });
  };
  const standalone = createAdminTransport({
    apiBase: "/api/admin",
    fetch: fetcher,
  });
  const embedded = createAdminTransport({
    apiBase: "/api/messaging",
    fetch: fetcher,
  });
  await standalone("email-flows");
  await embedded("email-flows");
  assert.deepEqual(calls, [
    "/api/admin/email-flows",
    "/api/messaging/email-flows",
  ]);
  assert.throws(() =>
    createAdminTransport({ apiBase: "https://private-admin.invalid" }),
  );
  assert.throws(() => standalone("../settings"));
});
test("shared UI contains no imports from the host app or private services", () => {
  const root = new URL("../packages/ui/src/", import.meta.url);
  for (const name of readdirSync(root, { recursive: true }).filter((name) =>
    /\.(ts|tsx)$/.test(String(name)),
  )) {
    const source = readFileSync(new URL(String(name), root), "utf8");
    assert.doesNotMatch(source, /from\s+["']@\//, String(name));
    assert.doesNotMatch(
      source,
      /from\s+["'](?:@ermes\/(?:db|shopify)|node:)|process\.env\./,
      String(name),
    );
  }
});
