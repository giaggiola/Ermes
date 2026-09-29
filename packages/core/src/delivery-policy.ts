import type { MessageKind } from "./events.js";
import type {
  SubscriberProperties,
  TriggerCondition,
  TriggerConditionInput,
} from "./flow-types.js";
import { getNestedValue } from "./object-path.js";

export function getSuppressionDecision(input: {
  activeReasons: Array<"bounce" | "complaint" | "manual" | "unsubscribe">;
  messageKind: MessageKind;
  subscriberEmailStatus?: SubscriberProperties["email_status"];
  subscriberSubscribed?: boolean;
}): { allowed: true } | { allowed: false; reason: string } {
  const hardReason = input.activeReasons.find(
    (reason) =>
      reason === "bounce" || reason === "complaint" || reason === "manual",
  );
  if (hardReason) {
    return { allowed: false, reason: hardReason };
  }

  if (
    input.subscriberEmailStatus === "bounced" ||
    input.subscriberEmailStatus === "complained"
  ) {
    return { allowed: false, reason: input.subscriberEmailStatus };
  }

  if (
    input.messageKind === "marketing" &&
    (input.subscriberSubscribed === false ||
      input.activeReasons.includes("unsubscribe"))
  ) {
    return { allowed: false, reason: "unsubscribe" };
  }

  return { allowed: true };
}

export function getFlowReentryDecision(input: {
  duration?: number;
  mode?: string;
  nowMs?: number;
  previousRuns: Array<{
    completed_at?: Date | string | null;
    started_at?: Date | string | null;
    status?: unknown;
  }>;
  unit?: string;
}): { allowed: true } | { allowed: false; reason: string } {
  if (input.mode === "always") {
    return { allowed: true };
  }

  if (input.mode === "after_duration") {
    const duration = Number(input.duration ?? 0);
    const unit = input.unit ?? "days";
    const multiplier = unit === "hours" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const thresholdTime = new Date(
      (input.nowMs ?? Date.now()) - duration * multiplier,
    );
    const recentRun = input.previousRuns.find((run) => {
      const enteredAt = run.started_at ?? run.completed_at;
      return enteredAt && new Date(enteredAt) > thresholdTime;
    });

    return recentRun
      ? {
          allowed: false,
          reason: `Entered flow within re-entry window (${duration} ${unit})`,
        }
      : { allowed: true };
  }

  if (
    (input.mode === "never" || !input.mode) &&
    input.previousRuns.length > 0
  ) {
    return {
      allowed: false,
      reason: "Already entered flow (no re-entry allowed)",
    };
  }

  return { allowed: true };
}

export function resolveFlowMessageKind(
  flowMessageKind: unknown,
  fallback: MessageKind,
): MessageKind {
  return flowMessageKind === "transactional" || flowMessageKind === "marketing"
    ? flowMessageKind
    : fallback;
}

export function evaluateTriggerConditions(
  input: TriggerConditionInput | null | undefined,
  subscriber: Record<string, unknown> | null,
  context: Record<string, unknown>,
): boolean {
  const group = normalizeTriggerConditionInput(input);
  if (group.conditions.length === 0) {
    return true;
  }

  const subscriberProperties =
    (subscriber?.properties as SubscriberProperties | null) ?? {};

  const evaluate = (condition: TriggerCondition) => {
    let value: unknown;
    if (condition.field.startsWith("subscriber.")) {
      const field = condition.field.replace("subscriber.", "");
      value = subscriberProperties[field] ?? subscriber?.[field];
    } else {
      value =
        getNestedValue(context, condition.field) ??
        subscriberProperties[condition.field];
    }

    switch (condition.operator) {
      case "contains":
        return String(value || "")
          .toLowerCase()
          .includes(String(condition.value).toLowerCase());
      case "equals":
        return String(value) === String(condition.value);
      case "greater_than":
        return Number(value) > Number(condition.value);
      case "has_tag":
        return (subscriberProperties.tags ?? []).includes(
          String(condition.value),
        );
      case "in_list": {
        const list = Array.isArray(condition.value)
          ? condition.value
          : String(condition.value)
              .split(",")
              .map((item) => item.trim());
        return list.includes(String(value));
      }
      case "less_than":
        return Number(value) < Number(condition.value);
      case "not_equals":
        return String(value) !== String(condition.value);
      case "not_has_tag":
        return !(subscriberProperties.tags ?? []).includes(
          String(condition.value),
        );
      default:
        return true;
    }
  };

  return group.match === "any"
    ? group.conditions.some(evaluate)
    : group.conditions.every(evaluate);
}

function normalizeTriggerConditionInput(
  input: TriggerConditionInput | null | undefined,
): { match: "all" | "any"; conditions: TriggerCondition[] } {
  if (Array.isArray(input)) {
    return { match: "all", conditions: input };
  }

  if (input && typeof input === "object" && Array.isArray(input.conditions)) {
    return {
      match: input.match === "any" ? "any" : "all",
      conditions: input.conditions,
    };
  }

  return { match: "all", conditions: [] };
}
