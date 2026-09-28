import { redirect } from "next/navigation";
import { hasAdmin } from "@ermes/db";
import { AuthForm } from "@/components/auth-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (await hasAdmin()) redirect("/login");
  return (
    <AuthForm setup requireSetupKey={Boolean(process.env.ERMES_SETUP_TOKEN)} />
  );
}
