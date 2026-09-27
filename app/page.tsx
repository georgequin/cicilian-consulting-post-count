import { redirect } from "next/navigation";
import { adminConfigured, currentRole, viewLocked } from "@/lib/auth";
import { databaseUrl, listPosts } from "@/lib/db";
import { uploadsEnabled } from "@/lib/blob";
import PostLog from "@/components/PostLog";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function Home() {
  const missing: string[] = [];
  if (!databaseUrl()) missing.push("DATABASE_URL");
  if (!adminConfigured()) missing.push("ADMIN_PASSWORD");
  if (missing.length) return <SetupNotice missing={missing} />;

  const role = await currentRole();
  if (!role) redirect("/login");

  const posts = await listPosts();
  return (
    <PostLog
      initialPosts={posts}
      isAdmin={role === "admin"}
      uploads={uploadsEnabled()}
      viewLocked={viewLocked()}
    />
  );
}
