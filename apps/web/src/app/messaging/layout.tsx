import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/session";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return <Workspace email={admin.email}>{children}</Workspace>;
}
