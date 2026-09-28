import { EmailDeliveryDisabledError } from "@ermes/core/installation";

/** A paused installation must retain work without consuming failure retries. */
export async function withDeliveryGate(input: {
  enabled: () => Promise<boolean>;
  run: () => Promise<void>;
  defer: () => Promise<void>;
}) {
  try {
    if (!(await input.enabled())) throw new EmailDeliveryDisabledError();
    await input.run();
  } catch (error) {
    if (!(error instanceof EmailDeliveryDisabledError)) throw error;
    await input.defer();
  }
}
