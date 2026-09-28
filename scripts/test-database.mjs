import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const id = execFileSync("docker", ["compose", "ps", "-q", "db"], {
  encoding: "utf8",
}).trim();
if (!id)
  throw new Error(
    "Start the isolated Ermes database with docker compose up -d db",
  );
const details = JSON.parse(
  execFileSync("docker", ["inspect", id], { encoding: "utf8" }),
)[0];
const ip = Object.values(details.NetworkSettings.Networks)[0].IPAddress;
// This harness owns only the ermes_test database and resets synthetic fixtures.
execFileSync("docker", [
  "exec",
  id,
  "dropdb",
  "--if-exists",
  "--force",
  "-U",
  "ermes",
  "ermes_test",
]);
execFileSync("docker", ["exec", id, "createdb", "-U", "ermes", "ermes_test"]);
const result = spawnSync("npm", ["test"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...env,
    TEST_DATABASE_URL: `postgresql://ermes:${env.POSTGRES_PASSWORD}@${ip}:5432/ermes_test`,
  },
});
process.exit(result.status ?? 1);
