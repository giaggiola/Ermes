const strictEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const disposableDomains = new Set(["tempmail.com", "throwaway.com", "mailinator.com", "guerrillamail.com"]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string, strict = false): boolean {
  const normalized = email.trim();
  return strict ? strictEmailRegex.test(normalized) : basicEmailRegex.test(normalized);
}

export function isDisposableEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@")[1];
  return domain ? disposableDomains.has(domain) : false;
}
