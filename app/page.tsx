import { redirect } from "next/navigation";
import { decoyUrl, hiddenLoginSlug } from "@/lib/auth";

export default function Home() {
  if (hiddenLoginSlug()) redirect(decoyUrl());
  redirect("/admin");
}
