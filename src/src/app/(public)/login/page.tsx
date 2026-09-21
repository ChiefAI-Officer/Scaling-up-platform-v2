import { Suspense } from "react";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-muted">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }
    >
      <LoginForm memberPortalEnabled={isMemberPortalEnabled()} />
    </Suspense>
  );
}
