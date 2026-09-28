import { redirect } from "next/navigation";
import { installationStatus } from "@ermes/db";
import { currentAdmin } from "@/lib/session";
import { Onboarding } from "@/components/onboarding";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await currentAdmin())) redirect("/login");
  return <Onboarding initial={await installationStatus()} />;
}
