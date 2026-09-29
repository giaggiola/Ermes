"use client";

// Shared, self-contained renderer for a sign-up form block document. Uses only inline
// styles (no Tailwind / app CSS) so the SAME file can be copied verbatim into the
// host storefront and render identically to the builder preview.
//
// Keep this file dependency-free (React + the core schema types only).

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

import type { BlockStyles, FormBlock, FormStyles, SignupFormDocument, StepKind } from "../../contracts/signup-form-schema";

// Renders admin-authored HTML, sanitized with DOMPurify. dompurify is imported
// dynamically so it never runs during SSR (it needs a real DOM); until it loads on the
// client we render nothing. Used by the `html` block and full HTML mode.
function HtmlContent({ html }: { html: string }) {
  const [clean, setClean] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("dompurify").then((mod) => {
      if (cancelled) return;
      setClean(
        mod.default.sanitize(html, {
          ADD_TAGS: ["form", "style"],
          ADD_ATTR: ["name", "type", "placeholder", "required", "for", "value"],
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [html]);
  if (clean == null) return null;
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}

export interface FormRendererProps {
  document: SignupFormDocument;
  step: StepKind;
  device?: "desktop" | "mobile";
  // Live/interactive props — omit in preview.
  interactive?: boolean;
  email?: string;
  onEmailChange?: (value: string) => void;
  // Called on submit with the captured fields (read from the form via FormData, so it
  // works for both block fields and hand-authored HTML inputs by their `name`).
  onSubmit?: (values: { email: string; first_name?: string; consent?: boolean }) => void;
  submitting?: boolean;
  error?: string | null;
  // Editor hook: wrap each rendered block (e.g. with selection/drag UI). The builder
  // canvas uses this so it shares the exact card shell + block visuals with the live
  // renderer. Omitted everywhere else.
  renderBlock?: (block: FormBlock, node: ReactNode) => ReactNode;
}

const px = (n?: number) => (n != null ? `${n}px` : undefined);

const ALREADY_SUBSCRIBED_FALLBACK: FormBlock[] = [
  {
    id: "fallback_already_subscribed_heading",
    type: "heading",
    text: "You're already on the list",
    styles: { align: "center", fontSize: 20, fontWeight: "medium" },
  },
  {
    id: "fallback_already_subscribed_text",
    type: "text",
    text: "No need to sign up again — we'll keep you posted.",
    styles: { align: "center", color: "#666666" },
  },
];

function textStyle(styles: BlockStyles, theme: FormStyles, fallbackColor: string, fallbackSize: number): CSSProperties {
  const weight = styles.fontWeight === "bold" ? 700 : styles.fontWeight === "medium" ? 500 : 400;
  return {
    textAlign: styles.align ?? "center",
    color: styles.color ?? theme.textColor ?? fallbackColor,
    fontFamily: styles.fontFamily ?? theme.fontFamily,
    fontSize: px(styles.fontSize ?? fallbackSize),
    fontWeight: weight,
    lineHeight: styles.lineHeight ?? 1.4,
    letterSpacing: px(styles.letterSpacing),
    paddingTop: px(styles.paddingY),
    paddingBottom: px(styles.paddingY),
    paddingLeft: px(styles.paddingX),
    paddingRight: px(styles.paddingX),
    marginTop: styles.marginTop ?? 0,
  };
}

function fieldStyle(styles: BlockStyles, theme: FormStyles): CSSProperties {
  return {
    width: "100%",
    height: 44,
    padding: "0 14px",
    marginTop: styles.marginTop ?? 0,
    marginBottom: styles.marginBottom ?? 10,
    border: `${styles.borderWidth ?? 1}px solid ${styles.borderColor ?? "#d4d4d4"}`,
    borderRadius: styles.radius ?? theme.buttonRadius ?? 0,
    fontFamily: styles.fontFamily ?? theme.fontFamily,
    fontSize: 14,
    boxSizing: "border-box",
    background: "#ffffff",
  };
}

export function BlockView({
  block,
  theme = {},
  interactive,
  email,
  onEmailChange,
  submitting,
}: {
  block: FormBlock;
  theme?: FormStyles;
  interactive?: boolean;
  email?: string;
  onEmailChange?: (value: string) => void;
  submitting?: boolean;
}) {
  const styles = block.styles ?? {};

  switch (block.type) {
    case "image": {
      if (!block.src) return null;
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.src}
          alt={block.text ?? ""}
          style={{
            width: "100%",
            height: px(styles.height) ?? "auto",
            objectFit: styles.objectFit ?? "cover",
            borderRadius: styles.radius ?? 0,
            display: "block",
            marginTop: styles.marginTop ?? 0,
            marginBottom: styles.marginBottom ?? 0,
          }}
        />
      );
      return styles.href && interactive ? (
        <a href={styles.href} target="_blank" rel="noreferrer" style={{ display: "block" }}>
          {img}
        </a>
      ) : (
        img
      );
    }

    case "heading":
      return (
        <div style={{ ...textStyle(styles, theme, theme.headingColor ?? theme.textColor ?? "#111111", 18), marginBottom: styles.marginBottom ?? 8 }}>
          {block.text}
        </div>
      );

    case "text":
      return <p style={{ ...textStyle(styles, theme, theme.textColor ?? "#666666", 13), marginBottom: styles.marginBottom ?? 12 }}>{block.text}</p>;

    case "email_input":
      return (
        <input
          type="email"
          name="email"
          required
          disabled={!interactive || submitting}
          value={interactive ? email ?? "" : ""}
          onChange={(event) => onEmailChange?.(event.target.value)}
          placeholder={block.text || "Email"}
          style={fieldStyle(styles, theme)}
        />
      );

    case "name_field":
      return (
        <input
          type="text"
          name="first_name"
          disabled={!interactive || submitting}
          placeholder={block.text || "First name"}
          style={fieldStyle(styles, theme)}
        />
      );

    case "consent":
      return (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            textAlign: "left",
            fontSize: px(styles.fontSize ?? 12),
            color: styles.color ?? theme.textColor ?? "#666666",
            fontFamily: styles.fontFamily ?? theme.fontFamily,
            marginTop: styles.marginTop ?? 0,
            marginBottom: styles.marginBottom ?? 10,
            lineHeight: 1.4,
          }}
        >
          <input type="checkbox" name="consent" required disabled={!interactive || submitting} style={{ marginTop: 3 }} />
          <span>{block.text || "I agree to receive marketing emails."}</span>
        </label>
      );

    case "button": {
      const bg = styles.background ?? theme.buttonBackground ?? "#111111";
      const hover = styles.hoverBackground;
      return (
        <button
          type={interactive ? "submit" : "button"}
          disabled={submitting}
          onMouseEnter={hover ? (e) => (e.currentTarget.style.background = hover) : undefined}
          onMouseLeave={hover ? (e) => (e.currentTarget.style.background = bg) : undefined}
          style={{
            width: "100%",
            height: 44,
            border: "none",
            cursor: submitting ? "not-allowed" : "pointer",
            background: bg,
            color: styles.color ?? theme.buttonColor ?? "#ffffff",
            fontFamily: styles.fontFamily ?? theme.fontFamily,
            fontSize: px(styles.fontSize) ?? 13,
            fontWeight: 600,
            letterSpacing: styles.letterSpacing != null ? `${styles.letterSpacing}px` : "0.06em",
            borderRadius: styles.radius ?? theme.buttonRadius ?? 0,
            marginTop: styles.marginTop ?? 0,
            marginBottom: styles.marginBottom ?? 0,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {block.text}
        </button>
      );
    }

    case "divider":
      return <hr style={{ border: "none", borderTop: `${styles.borderWidth ?? 1}px solid ${styles.borderColor ?? "#e5e5e5"}`, margin: `${styles.size ?? 12}px 0` }} />;

    case "spacer":
      return <div style={{ height: styles.size ?? 16 }} />;

    case "html":
      return <HtmlContent html={block.text ?? ""} />;

    default:
      return null;
  }
}

export function FormRenderer({
  document: doc,
  step,
  device = "desktop",
  interactive = false,
  email,
  onEmailChange,
  onSubmit,
  submitting,
  error,
  renderBlock,
}: FormRendererProps) {
  const current = doc.steps.find((candidate) => candidate.kind === step);
  const blocks = current?.blocks ?? (step === "already_subscribed" ? ALREADY_SUBSCRIBED_FALLBACK : []);
  const styles = doc.styles ?? {};
  const htmlOptIn = doc.mode === "html" && step === "opt_in";
  const showImage =
    step === "opt_in" &&
    !htmlOptIn &&
    Boolean(styles.image_url) &&
    (device === "desktop" || styles.image_on_mobile === true);
  const responsiveWidth = device === "mobile"
    ? "min(100%, 21.25rem)"
    : `min(100%, ${styles.width ?? 480}px)`;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const firstName = data.get("first_name");
    onSubmit?.({
      email: String(data.get("email") ?? ""),
      first_name: typeof firstName === "string" && firstName.trim() ? firstName.trim() : undefined,
      consent: data.get("consent") != null ? true : undefined,
    });
  };

  const content = htmlOptIn ? (
    <div style={{ flex: 1 }}>
      {doc.css ? <style>{doc.css.replace(/<\/style/gi, "<\\/style")}</style> : null}
      <HtmlContent html={doc.html ?? ""} />
      {error ? <p style={{ color: "#e11d48", fontSize: 13, padding: "0 28px 12px", textAlign: "center" }}>{error}</p> : null}
    </div>
  ) : (
    <div
      style={{
        flex: 1,
        padding: "clamp(1.25rem, 6cqi, 1.75rem)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {blocks
        .filter((block) => !(device === "mobile" ? block.styles?.hideOnMobile : block.styles?.hideOnDesktop))
        .map((block) => {
          const node = (
            <BlockView block={block} theme={styles} interactive={interactive} email={email} onEmailChange={onEmailChange} submitting={submitting} />
          );
          if (renderBlock) return <div key={block.id}>{renderBlock(block, node)}</div>;
          return <div key={block.id} style={{ display: "contents" }}>{node}</div>;
        })}
      {error ? <p style={{ color: "#e11d48", fontSize: 13, marginTop: 8, marginBottom: 0, textAlign: "center" }}>{error}</p> : null}
    </div>
  );

  const card = (
    <div
      style={{
        display: htmlOptIn ? "block" : "flex",
        flexDirection: device === "mobile" && showImage ? "column" : "row",
        width: responsiveWidth,
        background: styles.background ?? "#ffffff",
        fontFamily: styles.fontFamily,
        boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
        containerType: "inline-size",
        overflow: "hidden",
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={styles.image_url ?? undefined}
          alt=""
          style={{
            width: device === "mobile" ? "100%" : "45%",
            height: device === "mobile" ? 160 : undefined,
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : null}
      {interactive && step === "opt_in" ? (
        <form onSubmit={handleSubmit} style={{ display: htmlOptIn ? "block" : "flex", flex: 1 }}>
          {content}
        </form>
      ) : (
        content
      )}
    </div>
  );

  return card;
}

export default FormRenderer;
