import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-muted px-4"
      role="main"
      aria-labelledby="not-found-title"
    >
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <span
            className="text-8xl font-bold text-gray-200"
            aria-hidden="true"
          >
            404
          </span>
        </div>

        <h1
          id="not-found-title"
          className="text-2xl font-bold text-foreground mb-2"
        >
          Page not found
        </h1>

        <p className="text-muted-foreground mb-8">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. It may have
          been moved or deleted.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            asChild
            className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Link href="/">Go to home</Link>
          </Button>
          <Button
            variant="outline"
            asChild
            className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
