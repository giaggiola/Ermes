import { redirect } from "next/navigation";
import { installationStatus } from "@ermes/db";
import { currentAdmin } from "@/lib/session";
import { Onboarding } from "@/components/onboarding";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  if (!(await currentAdmin())) redirect("/login");
  return <Onboarding initial={await installationStatus()} initialStep={(await searchParams).step === "images" ? 3 : 0} />;
}
