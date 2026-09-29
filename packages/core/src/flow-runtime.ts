import type {
  FlowConditionClause,
  FlowStep,
  FlowStepCondition,
  FlowStepDelay,
  FlowStepEmail,
} from "./flow-types.js";
import { getNestedValue } from "./object-path.js";
import { normalizeEmail } from "./validation.js";

export function flowStepAtPath(
  steps: FlowStep[],
  path: string,
): FlowStep | undefined {
  const parts = path.split(".");
  let currentSteps = steps;
  let step: FlowStep | undefined;

  for (let index = 0; index < parts.length; index += 2) {
    const stepIndex = Number(parts[index]);
    if (!Number.isInteger(stepIndex) || stepIndex < 0) return undefined;
    step = currentSteps[stepIndex];
    if (!step || index === parts.length - 1) return step;

    const branchName = parts[index + 1];
    if (
      step.type !== "condition" ||
      (branchName !== "true" && branchName !== "false")
    ) {
      return undefined;
    }
    currentSteps =
      (branchName === "true" ? step.true_branch : step.false_branch) ?? [];
  }

  return step;
}

export function nextFlowStepPath(
  steps: FlowStep[],
  path: string,
): string | null {
  const parts = path.split(".");
  const currentIndex = Number(parts[parts.length - 1]);
  if (!Number.isInteger(currentIndex) || currentIndex < 0) return null;

  const parentPath = parts.slice(0, -1);
  const siblingPath = [...parentPath, String(currentIndex + 1)].join(".");
  if (flowStepAtPath(steps, siblingPath)) {
    return siblingPath;
  }
  if (parts.length === 1) {
    return null;
  }

  // Strip the branch name and index, then continue after the owning condition.
  return nextFlowStepPath(steps, parts.slice(0, -2).join("."));
}

export function calculateFlowDelay(
  step: FlowStepDelay,
  nowMs = Date.now(),
): number {
  const multiplier =
    step.unit === "days"
      ? 24 * 60 * 60 * 1000
      : step.unit === "hours"
        ? 60 * 60 * 1000
        : 60 * 1000;
  let target = new Date(nowMs + Number(step.duration || 0) * multiplier);

  if (step.until_time_of_day && step.time_of_day) {
    const [hour, minute] = step.time_of_day.split(":").map(Number);
    if (
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23 &&
      Number.isInteger(minute) &&
      minute >= 0 &&
      minute <= 59
    ) {
      target.setHours(hour, minute, 0, 0);
      if (target.getTime() < nowMs) {
        target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
      }
    }
  }

  if (step.until_days_of_week && step.days_of_week?.length) {
    const allowedDays = new Set(
      step.days_of_week.filter(
        (day) => Number.isInteger(day) && day >= 0 && day <= 6,
      ),
    );
    if (allowedDays.size > 0) {
      while (!allowedDays.has(target.getDay())) {
        target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
      }
    }
  }

  return Math.max(0, target.getTime() - nowMs);
}

export function evaluateFlowCondition(
  step: FlowStepCondition,
  context: Record<string, unknown>,
): boolean {
  const group = normalizeFlowConditionGroup(step);
  if (group.conditions.length === 0) {
    return false;
  }

  const evaluate = (condition: FlowConditionClause) => {
    if (!condition.field) {
      return false;
    }

    const value = getNestedValue(context, condition.field);

    switch (condition.operator) {
      case "contains":
        return String(value || "").includes(condition.value || "");
      case "equals":
        return value === condition.value;
      case "greater_than":
        return Number(value) > Number(condition.value);
      case "is_not_set":
        return value === undefined || value === null || value === "";
      case "is_set":
        return value !== undefined && value !== null && value !== "";
      case "less_than":
        return Number(value) < Number(condition.value);
      case "not_equals":
        return value !== condition.value;
      default:
        return false;
    }
  };

  return group.match === "any"
    ? group.conditions.some(evaluate)
    : group.conditions.every(evaluate);
}

export function selectFlowEmailVariant(
  step: FlowStepEmail,
  email: string,
): {
  key: string;
  subject_override?: string;
  template_id: string;
  template_version_id?: string;
} | null {
  if (!step.ab_test_enabled || !step.ab_variants) {
    return null;
  }

  const variants = Object.entries(step.ab_variants).filter(
    (
      entry,
    ): entry is [
      string,
      {
        template_id: string;
        template_version_id?: string;
        subject_override?: string;
      },
    ] => Boolean(entry[1]?.template_id),
  );
  if (variants.length === 0) {
    return null;
  }

  let hash = 0;
  for (const character of normalizeEmail(email)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  const [key, variant] = variants[hash % variants.length];
  return { key, ...variant };
}

export interface FlowValidationReport {
  errors: string[];
  valid: boolean;
  warnings: string[];
}

export type FlowSimulationStep = {
  branch?: "true" | "false";
  delay_ms?: number;
  duration?: number;
  matches?: boolean;
  path: string;
  step_status?: "live" | "disabled";
  skip_if_event_types_since_start?: string[];
  skip_if_event_types_since_start_order_scoped?: boolean;
  skip_recently_emailed?: boolean;
  skip_recently_emailed_hours?: number;
  template_id?: string;
  type: FlowStep["type"];
  unit?: "minutes" | "hours" | "days";
};

export function simulateFlowSteps(
  steps: FlowStep[],
  context: Record<string, unknown>,
  prefix = "",
): FlowSimulationStep[] {
  const result: FlowSimulationStep[] = [];

  steps.forEach((step, index) => {
    const path = prefix ? `${prefix}.${index}` : String(index);
    if (step.type === "condition") {
      const matches = evaluateFlowCondition(step, context);
      const branch = matches ? "true" : "false";
      result.push({ branch, matches, path, type: step.type });
      const branchSteps = matches ? step.true_branch : step.false_branch;
      if (branchSteps?.length) {
        result.push(
          ...simulateFlowSteps(branchSteps, context, `${path}.${branch}`),
        );
      }
      return;
    }

    if (step.type === "delay") {
      result.push({
        delay_ms: calculateFlowDelay(step),
        duration: step.duration,
        path,
        type: step.type,
        unit: step.unit,
      });
      return;
    }

    if (step.type === "email") {
      result.push({
        path,
        skip_if_event_types_since_start: step.skip_if_event_types_since_start,
        skip_if_event_types_since_start_order_scoped:
          step.skip_if_event_types_since_start_order_scoped,
        skip_recently_emailed: step.skip_recently_emailed,
        skip_recently_emailed_hours: step.skip_recently_emailed_hours,
        step_status: step.step_status ?? "live",
        template_id: step.template_id,
        type: step.type,
      });
      return;
    }

    result.push({ path, type: step.type });
  });

  return result;
}

export function validateFlowSteps(steps: FlowStep[]): FlowValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stableIds = new Set<string>();

  if (!Array.isArray(steps) || steps.length === 0) {
    errors.push("Flow must contain at least one step");
  }

  const visit = (items: FlowStep[], prefix = "") => {
    items.forEach((step, index) => {
      const path = prefix ? `${prefix}.${index}` : String(index);
      if (step.step_id) {
        if (stableIds.has(step.step_id)) {
          errors.push(`Step ${path} reuses stable ID ${step.step_id}`);
        }
        stableIds.add(step.step_id);
      } else {
        warnings.push(`Step ${path} will receive a stable ID when next saved`);
      }

      if (step.type === "email" && !step.template_id?.trim()) {
        errors.push(`Email step ${path} needs a template`);
      } else if (
        step.type === "delay" &&
        (!Number.isFinite(step.duration) || step.duration <= 0)
      ) {
        errors.push(`Delay step ${path} needs a positive duration`);
      } else if (step.type === "condition") {
        if (!step.conditions?.length && !step.field) {
          errors.push(`Condition step ${path} needs at least one condition`);
        }
        visit(step.true_branch ?? [], `${path}.true`);
        visit(step.false_branch ?? [], `${path}.false`);
      } else if (step.type === "discount") {
        if (!step.code_prefix?.trim()) {
          errors.push(`Discount step ${path} needs a code prefix`);
        }
        if (!Number.isFinite(step.discount_value) || step.discount_value <= 0) {
          errors.push(`Discount step ${path} needs a positive value`);
        }
      }
    });
  };
  visit(steps);

  return { errors, valid: errors.length === 0, warnings };
}

function normalizeFlowConditionGroup(step: FlowStepCondition): {
  match: "all" | "any";
  conditions: FlowConditionClause[];
} {
  if (Array.isArray(step.conditions) && step.conditions.length > 0) {
    return {
      match: step.match === "any" ? "any" : "all",
      conditions: step.conditions,
    };
  }

  return {
    match: step.match === "any" ? "any" : "all",
    conditions: [
      {
        field: step.field ?? "",
        operator: step.operator ?? "equals",
        value: step.value ?? "",
      },
    ],
  };
}
