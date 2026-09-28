import { redirect } from "next/navigation";
import { hasAdmin } from "@ermes/db";
import { currentAdmin } from "@/lib/session";
import { AuthForm } from "@/components/auth-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await hasAdmin())) redirect("/setup");
  if (await currentAdmin()) redirect("/messaging");
  return <AuthForm />;
}
