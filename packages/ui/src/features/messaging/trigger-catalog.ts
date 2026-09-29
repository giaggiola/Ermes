import type {
  TriggerDefinition,
  TriggerSource,
} from "@ermes/core/trigger-catalog";

export type {
  TriggerDefinition,
  TriggerSource,
} from "@ermes/core/trigger-catalog";
export { TRIGGER_SOURCE_LABELS } from "@ermes/core/trigger-catalog";

// This array is populated from Messaging's versioned contract. Keeping the same
// array identity lets existing editor components import it without maintaining a
// second catalogue in the host application.
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
