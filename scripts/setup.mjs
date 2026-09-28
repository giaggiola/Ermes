import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const target = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(target)) {
  console.log(".env already exists; existing keys were preserved.");
  process.exit(0);
}
const secret = () => randomBytes(32).toString("hex");
writeFileSync(
  target,
  `# Keep this file private and back up the encryption/preference keys.\nAPP_URL=http://localhost:3025\nERMES_PORT=3025\nPOSTGRES_PASSWORD=${secret()}\nERMES_ENCRYPTION_KEY=${secret()}\n# Optional: require a key when creating the first owner account.\nERMES_SETUP_TOKEN=\nOPS_MESSAGING_SHARED_SECRET=${secret()}\nCOMMERCE_EVENT_WEBHOOK_SECRET=${secret()}\nPREFERENCE_TOKEN_SECRET=${secret()}\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Created .env with independent random keys. Set APP_URL to your address, then run docker compose up --build -d. Open APP_URL and create your owner account with an email and password.",
);
