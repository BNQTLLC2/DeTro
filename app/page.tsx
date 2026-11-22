import { redirect } from "next/navigation";
import { decoyUrl, hiddenLoginSlug, isAdmin } from "@/lib/auth";

export default async function Home() {
  if (await isAdmin()) redirect("/admin");
  if (hiddenLoginSlug()) redirect(decoyUrl());
  redirect("/admin");
}
