import { getNestedValue } from "./object-path.js";

export type SegmentOperator =
  | "contains"
  | "equals"
  | "exists"
  | "greater_than"
  | "in"
  | "less_than"
  | "not_contains"
  | "not_equals";

export interface SegmentCondition {
  field: string;
  operator: SegmentOperator;
  value?: unknown;
}

export interface SegmentRuleGroup {
  conditions: SegmentCondition[];
  match: "all" | "any";
}

export function evaluateSegmentRules(
  rules: SegmentRuleGroup,
  profile: Record<string, unknown>,
): boolean {
  if (!rules || !Array.isArray(rules.conditions)) {
    return false;
  }
  if (rules.conditions.length === 0) {
    return true;
  }

  const evaluate = (condition: SegmentCondition): boolean => {
    const actual = getNestedValue(profile, condition.field);
    switch (condition.operator) {
      case "contains":
        return Array.isArray(actual)
          ? actual.includes(condition.value)
          : String(actual ?? "")
              .toLowerCase()
              .includes(String(condition.value ?? "").toLowerCase());
      case "equals":
        return (
          normalizeComparable(actual) === normalizeComparable(condition.value)
        );
      case "exists":
        return actual !== undefined && actual !== null && actual !== "";
      case "greater_than":
        return Number(actual) > Number(condition.value);
      case "in":
        return Array.isArray(condition.value)
          ? condition.value
              .map(normalizeComparable)
              .includes(normalizeComparable(actual))
          : false;
      case "less_than":
        return Number(actual) < Number(condition.value);
      case "not_contains":
        return !evaluate({ ...condition, operator: "contains" });
      case "not_equals":
        return (
          normalizeComparable(actual) !== normalizeComparable(condition.value)
        );
      default:
        return false;
    }
  };

  return rules.match === "any"
    ? rules.conditions.some(evaluate)
    : rules.conditions.every(evaluate);
}

function normalizeComparable(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}
