type MessageKind = "marketing" | "transactional";

export type TriggerSource =
  | "newsletter"
  | "order"
  | "product"
  | "customer"
  | "referral";

export interface TriggerDefinition {
  value: string;
  label: string;
  description: string;
  source: TriggerSource;
  messageKind: MessageKind;
  timed?: boolean;
  recommended?: boolean;
}

export const TRIGGER_SOURCE_LABELS: Record<TriggerSource, string> = {
  newsletter: "Newsletter & Lists",
  order: "Orders",
  product: "Products",
  customer: "Customers",
  referral: "Referrals",
};

// This array is populated from Messaging's versioned contract. Keeping the same
// array identity lets existing editor components import it without maintaining a
// second catalogue in the Ops bundle.
export const TRIGGER_CATALOG: TriggerDefinition[] = [];

export function setTriggerCatalogue(catalogue: TriggerDefinition[]) {
  TRIGGER_CATALOG.splice(0, TRIGGER_CATALOG.length, ...catalogue);
}

export function triggerByValue(value: string): TriggerDefinition | undefined {
  return TRIGGER_CATALOG.find((trigger) => trigger.value === value);
}

export function triggerLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const trigger = triggerByValue(value);
  if (trigger) return trigger.label;
  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function recommendedTriggers(): TriggerDefinition[] {
  return TRIGGER_CATALOG.filter((trigger) => trigger.recommended);
}

export function triggersBySource(): Record<TriggerSource, TriggerDefinition[]> {
  const grouped: Record<TriggerSource, TriggerDefinition[]> = {
    newsletter: [],
    order: [],
    product: [],
    customer: [],
    referral: [],
  };
  for (const trigger of TRIGGER_CATALOG) grouped[trigger.source].push(trigger);
  return grouped;
}
