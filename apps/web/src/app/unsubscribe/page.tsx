import { resolveUnsubscribeEmail } from "@/lib/unsubscribe-token";

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const paramsPromise = searchParams ?? Promise.resolve({});
  return (
    <main className="auth-page">
      <UnsubscribePanel searchParams={paramsPromise} />
    </main>
  );
}

async function UnsubscribePanel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const legacyEmail = typeof params.email === "string" ? params.email : "";
  const status = typeof params.status === "string" ? params.status : "";
  const email = await resolveUnsubscribeEmail(token);
  if (email) {
    return (
      <section className="auth-card">
        <h1>Unsubscribe from marketing emails</h1>
        <p className="muted">
          Confirm below to stop marketing emails from this store.
        </p>
        <form method="post" action="/api/store/email-unsubscribe">
          <input type="hidden" name="token" value={token} />
          <button className="primary" type="submit">
            Unsubscribe
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="auth-card">
      <h1>Unsubscribe</h1>
      {status === "unsubscribed" ? (
        <p className="notice">You have been unsubscribed.</p>
      ) : null}
      {token || status === "link-invalid" ? (
        <p className="notice">
          This secure link is no longer valid. Request a new preferences link
          below.
        </p>
      ) : null}
      <form className="form" method="post" action="/api/preferences/link">
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue={legacyEmail}
          />
        </label>
        <button type="submit">Send secure link</button>
      </form>
    </section>
  );
}
