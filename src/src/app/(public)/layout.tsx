// Round 16 — Wave 1: public-route-group layout.
// No metadata export — inherits from root layout.tsx.
// No <html>/<body> wrap — root layout owns those.
// Server component (no "use client") so AffiliateCookieScript can read
// env vars during render without leaking to the client bundle.

import { AffiliateCookieScript } from "@/components/affiliate/affiliate-cookie-script";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            {children}
            <AffiliateCookieScript />
        </>
    );
}
