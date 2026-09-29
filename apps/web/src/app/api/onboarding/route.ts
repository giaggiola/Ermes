import { NextResponse, type NextRequest } from "next/server";
import {
  getCredential,
  getPool,
  installationStatus,
  saveIntegrations,
  saveMerchant,
} from "@ermes/db";
import { authenticateBrowser } from "@/lib/session";
import { verifyShopifyConnection } from "@/lib/shopify-connection";
import { setConnectorEnabled } from "@ermes/shopify";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await authenticateBrowser(request);
    return NextResponse.json(await installationStatus());
  } catch {
    return NextResponse.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    await authenticateBrowser(request);
    const raw = await request.text();
    if (raw.length > 8192)
      return NextResponse.json(
        { message: "Request too large" },
        { status: 413 },
      );
    const { action, value } = JSON.parse(raw);
    if (action === "merchant")
      return NextResponse.json(await saveMerchant(value));
    if (action === "integrations")
      return NextResponse.json(await saveIntegrations(value));
    if (action === "import-shopify-store")
      return NextResponse.json(await verifyShopifyConnection(true));
    if (action === "verify-shopify")
      return NextResponse.json(await verifyShopifyConnection());
    if (action === "shopify-sync") {
      if (typeof value?.enabled !== "boolean")
        throw new Error("Choose a sync setting");
      await setConnectorEnabled(value.enabled);
      return NextResponse.json(await installationStatus());
    }
    if (action === "delivery") {
      if (typeof value?.enabled !== "boolean")
        throw new Error("Choose a delivery setting");
      if (value.enabled) {
        const current = await installationStatus();
        if (
          !current.merchant ||
          !(await getCredential("resendApiKey")) ||
          value.confirmedSender !== true
        )
          throw new Error(
            "Save your sender and Resend API key, then confirm the sender domain is verified",
          );
      }
      await getPool().query(
        "UPDATE ermes_installation SET delivery_enabled=$1,updated_at=now() WHERE id=1",
        [value.enabled],
      );
      return NextResponse.json(await installationStatus());
    }
    return NextResponse.json(
      { message: "Unknown setup action" },
      { status: 404 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save settings";
    return NextResponse.json(
      { message },
      { status: message === "Authentication required" ? 401 : 400 },
    );
  }
}
