// Only field names and reason codes leave the form; never values or raw errors.
export function validationReasons(form) {
  const reasons = new Set();
  for (const input of form.elements) {
    if (!input.willValidate || input.validity.valid) continue;
    if (input.name === "email") {
      reasons.add(input.validity.valueMissing ? "email_required" : "email_invalid");
    } else if (input.name === "consent") {
      reasons.add("consent_required");
    } else if (input.name === "first_name" && input.validity.valueMissing) {
      reasons.add("name_required");
    } else {
      reasons.add("field_invalid");
    }
  }
  return [...reasons].sort();
}

export function responseFailure(status) {
  if (status === 409) return "form_changed";
  if (status === 429) return "rate_limited";
  if (status === 502 || status === 503 || status === 504) return "service_unavailable";
  if (status >= 500) return "server_error";
  return "request_rejected";
}
