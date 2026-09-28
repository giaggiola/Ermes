// Single source of truth for the sign-up form "block document" — the JSON contract
// shared between the eilish-messaging builder (editor + preview) and storefront
// storefront renderer. Bump SIGNUP_FORM_SCHEMA_VERSION on any breaking change so the
// storefront can guard a document it doesn't understand yet.

export const SIGNUP_FORM_SCHEMA_VERSION = 1;

export type SignupFormType = "popup" | "flyout" | "embedded" | "full-page";
export type SignupFormStatus = "draft" | "published";

export type BlockType =
  | "image"
  | "heading"
  | "text"
  | "email_input"
  | "name_field"
  | "consent"
  | "button"
  | "divider"
  | "spacer"
  | "html";

export interface BlockStyles {
  align?: "left" | "center" | "right";
  color?: string;
  background?: string;
  // typography
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "medium" | "bold";
  lineHeight?: number;
  letterSpacing?: number;
  // spacing
  paddingY?: number;
  paddingX?: number;
  marginTop?: number;
  marginBottom?: number;
  // border
  borderWidth?: number;
  borderColor?: string;
  radius?: number;
  // image blocks
  height?: number;
  objectFit?: "cover" | "contain";
  // button
  fullWidth?: boolean;
  hoverBackground?: string;
  // image / button link target
  href?: string;
  // per-device visibility
  hideOnMobile?: boolean;
  hideOnDesktop?: boolean;
  // spacer/divider
  size?: number;
}

export interface FormBlock {
  id: string;
  type: BlockType;
  // Visible text (heading/text/button label) or placeholder (email_input) or alt (image).
  text?: string;
  // image source
  src?: string;
  styles?: BlockStyles;
}

// A form is a sequence of steps the visitor moves through.
//  - teaser:  optional minimized tab/badge shown before the form opens
//  - opt_in:  the form itself (must contain an email_input + a submit button)
//  - success: confirmation shown after a successful submit
//  - already_subscribed: confirmation shown when the address is already active
export type StepKind = "teaser" | "opt_in" | "success" | "already_subscribed";
export type FormDevice = "desktop" | "mobile";
export type FormDisplayTrigger = "time" | "scroll" | "exit_intent";

export interface FormStep {
  id: string;
  kind: StepKind;
  blocks: FormBlock[];
}

export interface FormTargeting {
  delay_ms: number;
  cooldown_days: number;
  hide_when_logged_in: boolean;
  // Legacy single-trigger field. New documents use `triggers`; storefront
  // renderers keep reading this so already-published forms remain compatible.
  trigger?: FormDisplayTrigger;
  // One or more display conditions. "any" opens after the first condition is
  // met; "all" waits for every selected condition.
  triggers?: FormDisplayTrigger[];
  trigger_match?: "any" | "all";
  scroll_percent?: number;
  devices?: FormDevice[];
  hide_after_submit?: boolean;
  // Devices on which the visible X can dismiss the form. Missing means both.
  close_button_devices?: FormDevice[];
  // Devices on which clicking the popup backdrop can dismiss it. Missing means both.
  dismiss_on_outside_devices?: FormDevice[];
  // Only show on these path prefixes (e.g. "/products"). Empty/absent = all pages.
  page_paths?: string[];
  // Never show on these path prefixes, even if an include path also matches.
  excluded_page_paths?: string[];
}

export interface FormStyles {
  // Desktop side-image (current Eilish popup has a photo on the left).
  image_url?: string | null;
  // Side images stay desktop-only unless the author explicitly enables the
  // stacked mobile treatment.
  image_on_mobile?: boolean;
  accent?: string;
  background?: string;
  width?: number;
  // Brand theme — applied as defaults across blocks by the renderer.
  fontFamily?: string;
  textColor?: string;
  headingColor?: string;
  buttonBackground?: string;
  buttonColor?: string;
  buttonRadius?: number;
}

// The full document persisted on `signup_form.document` and served to the storefront.
export interface SignupFormDocument {
  schema_version: number;
  // "blocks" = the visual block builder (default). "html" = the whole opt-in form is
  // hand-authored markup in `html` (+ optional `css`); email capture is by convention
  // (an `<input type="email" name="email">` + a submit button, read via FormData).
  mode?: "blocks" | "html";
  html?: string;
  css?: string;
  steps: FormStep[];
  targeting: FormTargeting;
  styles: FormStyles;
}

export const DEFAULT_TARGETING: FormTargeting = {
  delay_ms: 5000,
  cooldown_days: 30,
  devices: ["desktop", "mobile"],
  hide_after_submit: true,
  close_button_devices: ["desktop", "mobile"],
  dismiss_on_outside_devices: ["desktop", "mobile"],
  hide_when_logged_in: true,
  trigger_match: "any",
  triggers: ["time"],
};

let blockSeq = 0;
function blockId(type: string): string {
  blockSeq += 1;
  return `blk_${type}_${blockSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeBlock(type: BlockType, overrides: Partial<FormBlock> = {}): FormBlock {
  return { id: blockId(type), type, ...overrides };
}

export function makeStep(kind: StepKind, blocks: FormBlock[]): FormStep {
  return { id: `step_${kind}_${Math.random().toString(36).slice(2, 8)}`, kind, blocks };
}

// Neutral starting point for a new signup form.
export function createDefaultSignupForm(): SignupFormDocument {
  return {
    schema_version: SIGNUP_FORM_SCHEMA_VERSION,
    targeting: { ...DEFAULT_TARGETING },
    styles: { image_url: null, accent: "#111111", background: "#ffffff", width: 480 },
    steps: [
      makeStep("opt_in", [
        makeBlock("heading", { text: "Your store", styles: { align: "center", fontSize: 18, fontWeight: "medium" } }),
        makeBlock("heading", { text: "Stay in the loop", styles: { align: "center", fontSize: 24, fontWeight: "bold" } }),
        makeBlock("text", {
          text: "Sign up to get early access to new drops, styling tips, and member-only discounts delivered straight to your inbox.",
          styles: { align: "center", color: "#666666", fontSize: 13 },
        }),
        makeBlock("email_input", { text: "Email" }),
        makeBlock("button", { text: "SUBSCRIBE", styles: { background: "#111111", color: "#ffffff" } }),
      ]),
      makeStep("success", [
        makeBlock("heading", { text: "Thank you!", styles: { align: "center", fontSize: 20, fontWeight: "medium" } }),
        makeBlock("text", {
          text: "You're on the list. We'll keep you posted with news from our store.",
          styles: { align: "center", color: "#666666" },
        }),
      ]),
      makeStep("already_subscribed", [
        makeBlock("heading", { text: "You're already on the list", styles: { align: "center", fontSize: 20, fontWeight: "medium" } }),
        makeBlock("text", {
          text: "No need to sign up again — we'll keep you posted.",
          styles: { align: "center", color: "#666666" },
        }),
      ]),
    ],
  };
}

function fontWeightValue(weight?: string): number {
  return weight === "bold" ? 700 : weight === "medium" ? 500 : 400;
}

function styleAttr(decls: Record<string, string | number | undefined>): string {
  const body = Object.entries(decls)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  return body ? ` style="${body}"` : "";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// One-way: turn the visual blocks of a step into HTML, used to seed/refresh HTML mode.
// The reverse (HTML -> blocks) is intentionally unsupported — custom HTML is an eject.
export function serializeBlocksToHtml(doc: SignupFormDocument, step: StepKind = "opt_in"): string {
  const theme = doc.styles ?? {};
  const blocks = doc.steps.find((candidate) => candidate.kind === step)?.blocks ?? [];

  const textDecls = (st: BlockStyles, fallbackColor: string, fallbackSize: number, defaultMb: number) => ({
    "text-align": st.align ?? "center",
    color: st.color ?? theme.textColor ?? fallbackColor,
    "font-family": st.fontFamily ?? theme.fontFamily,
    "font-size": `${st.fontSize ?? fallbackSize}px`,
    "font-weight": fontWeightValue(st.fontWeight),
    "line-height": st.lineHeight ?? 1.4,
    "letter-spacing": st.letterSpacing != null ? `${st.letterSpacing}px` : undefined,
    "margin-top": `${st.marginTop ?? 0}px`,
    "margin-bottom": `${st.marginBottom ?? defaultMb}px`,
    "padding-left": st.paddingX != null ? `${st.paddingX}px` : undefined,
    "padding-right": st.paddingX != null ? `${st.paddingX}px` : undefined,
    "padding-top": st.paddingY != null ? `${st.paddingY}px` : undefined,
    "padding-bottom": st.paddingY != null ? `${st.paddingY}px` : undefined,
  });

  const fieldDecls = (st: BlockStyles) => ({
    width: "100%",
    height: "44px",
    padding: "0 14px",
    "margin-top": `${st.marginTop ?? 0}px`,
    "margin-bottom": `${st.marginBottom ?? 10}px`,
    border: `${st.borderWidth ?? 1}px solid ${st.borderColor ?? "#d4d4d4"}`,
    "border-radius": `${st.radius ?? theme.buttonRadius ?? 0}px`,
    "font-family": st.fontFamily ?? theme.fontFamily,
    "font-size": "14px",
    "box-sizing": "border-box",
    background: "#ffffff",
  });

  const parts = blocks.map((block) => {
    const st = block.styles ?? {};
    const text = block.text ?? "";
    switch (block.type) {
      case "heading":
        return `<div${styleAttr(textDecls(st, theme.headingColor ?? theme.textColor ?? "#111111", 18, 8))}>${escapeHtml(text)}</div>`;
      case "text":
        return `<p${styleAttr(textDecls(st, theme.textColor ?? "#666666", 13, 12))}>${escapeHtml(text)}</p>`;
      case "image": {
        if (!block.src) return "";
        const img = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(text)}"${styleAttr({ width: "100%", height: st.height ? `${st.height}px` : "auto", "object-fit": st.objectFit ?? "cover", "border-radius": `${st.radius ?? 0}px`, display: "block", "margin-top": `${st.marginTop ?? 0}px`, "margin-bottom": `${st.marginBottom ?? 0}px` })} />`;
        return st.href ? `<a href="${escapeHtml(st.href)}" target="_blank" rel="noreferrer" style="display:block">${img}</a>` : img;
      }
      case "email_input":
        return `<input type="email" name="email" required placeholder="${escapeHtml(text || "Email")}"${styleAttr(fieldDecls(st))} />`;
      case "name_field":
        return `<input type="text" name="first_name" placeholder="${escapeHtml(text || "First name")}"${styleAttr(fieldDecls(st))} />`;
      case "consent":
        return `<label${styleAttr({ display: "flex", "align-items": "flex-start", gap: "8px", "text-align": "left", "font-size": `${st.fontSize ?? 12}px`, color: st.color ?? theme.textColor ?? "#666666", "font-family": st.fontFamily ?? theme.fontFamily, "margin-top": `${st.marginTop ?? 0}px`, "margin-bottom": `${st.marginBottom ?? 10}px`, "line-height": 1.4 })}><input type="checkbox" name="consent" required style="margin-top:3px" /><span>${escapeHtml(text || "I agree to receive marketing emails.")}</span></label>`;
      case "button":
        return `<button type="submit"${styleAttr({ width: "100%", height: "44px", border: "none", cursor: "pointer", background: st.background ?? theme.buttonBackground ?? "#111111", color: st.color ?? theme.buttonColor ?? "#ffffff", "font-family": st.fontFamily ?? theme.fontFamily, "font-size": `${st.fontSize ?? 13}px`, "font-weight": 600, "letter-spacing": st.letterSpacing != null ? `${st.letterSpacing}px` : "0.06em", "border-radius": `${st.radius ?? theme.buttonRadius ?? 0}px`, "margin-top": `${st.marginTop ?? 0}px`, "margin-bottom": `${st.marginBottom ?? 0}px` })}>${escapeHtml(text)}</button>`;
      case "divider":
        return `<hr${styleAttr({ border: "none", "border-top": `${st.borderWidth ?? 1}px solid ${st.borderColor ?? "#e5e5e5"}`, margin: `${st.size ?? 12}px 0` })} />`;
      case "spacer":
        return `<div${styleAttr({ height: `${st.size ?? 16}px` })}></div>`;
      case "html":
        return text;
      default:
        return "";
    }
  });

  return `<div style="padding:28px">\n  ${parts.filter(Boolean).join("\n  ")}\n</div>`;
}

// Defensive normalizer the storefront/renderer uses on a fetched document so a partial
// or older payload never crashes the render.
export function isSupportedSignupForm(doc: unknown): doc is SignupFormDocument {
  if (!doc || typeof doc !== "object") return false;
  const candidate = doc as Partial<SignupFormDocument>;
  return (
    typeof candidate.schema_version === "number" &&
    candidate.schema_version <= SIGNUP_FORM_SCHEMA_VERSION &&
    Array.isArray(candidate.steps)
  );
}
