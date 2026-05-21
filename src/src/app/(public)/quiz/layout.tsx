/**
 * Public quiz layout — wraps every /quiz/* route in .wf-scope so the
 * wireframe-faithful CSS classes apply. Preserves the parent (public)
 * layout's AffiliateCookieScript via Next.js layout composition.
 *
 * Restyle direction: WF17/18/19 from src/public/wireframes-phase2/participant-public/.
 */

import "@/styles/wireframes-scoped.css";

export default function PublicQuizLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="wf-scope" style={{ minHeight: "100vh" }}>
      {children}
    </div>
  );
}
