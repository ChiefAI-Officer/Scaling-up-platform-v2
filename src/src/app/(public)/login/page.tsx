"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCallbackUrl = searchParams.get("callbackUrl");
  const error = searchParams.get("error");
  const wasRegistered = searchParams.get("registered") === "true";
  const showDemoCredentials = process.env.NODE_ENV !== "production";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(error ? "Invalid credentials" : "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: requestedCallbackUrl || "/dashboard",
      });

      if (result?.error) {
        setErrorMessage("Invalid email or password");
      } else if (result?.ok) {
        const session = await getSession();
        const role = (session?.user as { role?: string } | undefined)?.role;
        const destination =
          requestedCallbackUrl || (role === "COACH" ? "/portal/home" : "/dashboard");

        router.push(destination);
        router.refresh();
      }
    } catch {
      setErrorMessage("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Sign in to Scaling Up
          </CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {wasRegistered && (
              <div
                className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm"
              >
                Coach account created. Sign in with your new credentials.
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                aria-live="polite"
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"
              >
                {errorMessage}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@scalingup.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                aria-describedby={errorMessage ? "login-error" : undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-describedby={errorMessage ? "login-error" : undefined}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>

            <p className="text-center text-sm text-gray-600">
              New coach?{" "}
              <Link href="/register" className="font-medium text-blue-600 hover:text-blue-700">
                Create an account
              </Link>
            </p>
          </form>

          {showDemoCredentials && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800 font-medium mb-2">Demo Credentials:</p>
              <p className="text-xs text-blue-700">Email: admin@scalingup.com</p>
              <p className="text-xs text-blue-700">Password: demo123</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
