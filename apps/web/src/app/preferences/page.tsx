export default function PreferencesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const paramsPromise = searchParams ?? Promise.resolve({});
  return (
    <main className="shell">
      <PreferencesPanel searchParams={paramsPromise} />
    </main>
  );
}

async function PreferencesPanel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const legacyEmail = typeof params.email === "string" ? params.email : "";
  const status = typeof params.status === "string" ? params.status : "";
  const claims = verifyPreferenceToken({
    previousSecret: process.env.PREFERENCE_TOKEN_PREVIOUS_SECRET,
    purpose: "preferences",
    secret: process.env.PREFERENCE_TOKEN_SECRET ?? "",
    token,
  });
  const subscriber = claims
    ? (await getMessagingService().listEmailSubscribers({ email: claims.email }))[0]
    : null;

  return (
    <section className="panel narrow">
      <h1>Preferences</h1>
      {status === "saved" ? <p className="notice">Preferences saved.</p> : null}
      {status === "link-sent" ? (
        <p className="notice">
          If that address is subscribed, a secure link will arrive shortly.
        </p>
      ) : null}
      {claims ? (
        <form className="form" method="post" action="/api/preferences">
          <input name="token" type="hidden" value={token} />
          <label className="checkboxRow">
            <input
              name="marketing_email"
              type="checkbox"
              defaultChecked={subscriber?.subscribed !== false}
            />
            Marketing email
          </label>
          <button type="submit">Save</button>
        </form>
      ) : (
        <>
          {token ? (
            <p className="notice">
              This secure link is no longer valid. Request a new one below.
            </p>
          ) : null}
          <form className="form" method="post" action="/api/preferences/link">
            <label>
              Email
              <input name="email" type="email" required defaultValue={legacyEmail} />
            </label>
            <button type="submit">Send secure link</button>
          </form>
        </>
      )}
    </section>
  );
}
import { verifyPreferenceToken } from "@ermes/core";
import { getMessagingService } from "@ermes/db";
