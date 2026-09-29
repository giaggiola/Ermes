import { deliveryCredentials } from "@ermes/db";
import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";
import { Resend } from "resend";

import {
  createPreferenceToken,
  isValidEmail,
  normalizeEmail,
} from "@ermes/core";
import { getMessagingService } from "@ermes/db";

import { parseBody, redirectOrJson } from "@/lib/http";
import { enforcePublicRateLimit } from "@/lib/public-security";

export const dynamic = "force-dynamic";

const genericResponse = {
  message:
    "If that address is subscribed, a secure preferences link will arrive shortly.",
  success: true,
};

export async function POST(request: NextRequest) {
  const body = await parseBody(request);
  const email =
    typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!email || !isValidEmail(email)) {
    return redirectOrJson(
      request,
      { ...genericResponse, status: "link-sent" },
      "/preferences",
    );
  }

  const rateLimited = await enforcePublicRateLimit(
    request,
    "preference-link",
    email,
  );
  if (rateLimited) return rateLimited;
  const service = getMessagingService();
  const subscriber = (await service.listEmailSubscribers({ email }))[0];
  const delivery = await deliveryCredentials().catch(() => null);
  if (subscriber && process.env.PREFERENCE_TOKEN_SECRET && delivery) {
    const runtime = await service.getRuntimeSettings();
    const token = createPreferenceToken({
      email,
      purpose: "preferences",
      secret: process.env.PREFERENCE_TOKEN_SECRET,
    });
    const baseUrl = process.env.APP_URL ?? "http://localhost:3025";
    const url = `${baseUrl}/preferences?token=${encodeURIComponent(token)}`;
    const hour = Math.floor(Date.now() / (60 * 60 * 1000));
    const targetHash = createHash("sha256")
      .update(email)
      .digest("hex")
      .slice(0, 24);
    const senderName = runtime.emailSenderName;
    const senderEmail = runtime.emailFrom;
    await new Resend(delivery.apiKey).emails
      .send(
        {
          from: `${senderName} <${senderEmail}>`,
          html: `<p>Use the secure link below to manage your email preferences.</p><p><a href="${url}">Manage email preferences</a></p>`,
          subject: "Your secure email preferences link",
          to: email,
        },
        { idempotencyKey: `preference-link/${targetHash}/${hour}` },
      )
      .catch(() => undefined);
  }
  return redirectOrJson(
    request,
    { ...genericResponse, status: "link-sent" },
    "/preferences",
  );
}
