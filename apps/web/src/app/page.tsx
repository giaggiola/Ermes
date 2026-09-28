import { redirect } from "next/navigation";
import { hasAdmin } from "@ermes/db";
import { currentAdmin } from "@/lib/session";
export const dynamic="force-dynamic";
export default async function Page(){if(!await hasAdmin())redirect("/setup");redirect(await currentAdmin()?"/messaging":"/login");}
