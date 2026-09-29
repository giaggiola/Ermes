import { installationRow } from "@ermes/db";
import {
  isDisposableEmail,
  isValidEmail,
  normalizeEmail,
} from "@ermes/core/validation";
import { getMessagingService } from "@ermes/db";

import { HttpError } from "@/lib/http";
import {
  newsletterSubscribeSchema,
  type NewsletterSubscribeInput,
} from "@/lib/newsletter-schema";

export { newsletterSubscribeSchema };
export type { NewsletterSubscribeInput };

export async function subscribeToNewsletter(input: unknown) {
  const parsed = newsletterSubscribeSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError("Invalid subscription details", 400);
  }
  const validated = parsed.data;
  const email = normalizeEmail(validated.email);
  const firstName = validated.first_name?.trim() || undefined;
  const source = validated.source?.trim() || "popup";
  const formId = validated.form_id?.trim() || "";

  if (!email) {
    throw new HttpError("Email is required", 400);
  }
  if (!isValidEmail(email, true) || isDisposableEmail(email)) {
    throw new HttpError("Please use a valid email address", 400);
  }

  const service = getMessagingService();
  const subscribed = await service.subscribeWithStatus(email, {
    first_name: firstName,
    properties: {
      ...(validated.consented_at
        ? { consented_at: validated.consented_at }
        : {}),
      signup_source: source,
    },
    source,
  });
  const subscriber = subscribed.subscriber;

  if (formId) {
    await service
      .incrementSignupFormCounter(formId, "submitted")
      .catch(() => undefined);
  }

  if (subscribed.welcomeEligible) {
    const runtime = await service.getRuntimeSettings();
    const storeUrl =
      (await installationRow()).merchant?.storefrontUrl ??
      process.env.STOREFRONT_URL ??
      "https://example.com";
    await service.triggerFlowsForEvent(
      "newsletter.subscribed",
      email,
      {
        email,
        care_guide_url: `${storeUrl}/pages/care-guide`,
        editorial_image_alt: "Your store collection",
        editorial_image_url: process.env.EMAIL_EDITORIAL_IMAGE_URL ?? "",
        first_name: firstName ?? "",
        store_name: runtime.emailSenderName,
        store_url: storeUrl,
        subscribed_at: subscriber.subscribed_at,
      },
      "marketing",
      `newsletter.subscribed:${String(subscriber.id)}:${String(subscriber.subscribed_at)}`,
    );
  }

  return {
    success: true,
    subscriber: {
      email: subscriber.email,
      id: subscriber.id,
      subscribed: subscriber.subscribed,
      subscribed_at: subscriber.subscribed_at,
    },
    welcome_eligible: subscribed.welcomeEligible,
  };
}
