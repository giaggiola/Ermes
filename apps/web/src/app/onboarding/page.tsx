import { redirect } from "next/navigation";
import { installationStatus } from "@ermes/db";
import { currentAdmin } from "@/lib/session";
import { Onboarding } from "@/components/onboarding";
import { shopifySetupInfo } from "@ermes/shopify";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  if (!(await currentAdmin())) redirect("/login");
  const initial = await installationStatus();
  const steps: Record<string, number> = {
    shopify: 0,
    store: 1,
    email: 2,
    images: 3,
    ready: 4,
  };
  return (
    <Onboarding
      initial={initial}
      shopifySetup={shopifySetupInfo(process.env.APP_URL)}
      initialStep={
        steps[(await searchParams).step ?? ""] ?? (initial.merchant ? 1 : 0)
      }
    />
  );
}
