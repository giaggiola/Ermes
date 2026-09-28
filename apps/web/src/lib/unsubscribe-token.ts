import { verifyPreferenceToken } from "@ermes/core";
import { getMessagingService } from "@ermes/db";

export async function resolveUnsubscribeEmail(token: string) {
  if (!token) return null;

  const service = getMessagingService();
  const opaqueLink = await service.resolveEmailPreferenceLink(
    token,
    "unsubscribe",
  );
  if (opaqueLink) return opaqueLink.email;

  const legacyClaims = verifyPreferenceToken({
    previousSecret: process.env.PREFERENCE_TOKEN_PREVIOUS_SECRET,
    purpose: "unsubscribe",
    secret: process.env.PREFERENCE_TOKEN_SECRET ?? "",
    token,
  });
  return legacyClaims?.email ?? null;
}
