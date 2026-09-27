import LoginForm from "@/components/LoginForm";
import { viewLocked } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm viewLocked={viewLocked()} />;
}
