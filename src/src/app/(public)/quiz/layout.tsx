/**
 * Public quiz layout — wraps every /quiz/* route in .wf-scope so the
 * wireframe-faithful CSS classes apply. Preserves the parent (public)
 * layout's AffiliateCookieScript via Next.js layout composition.
 *
 * Restyle direction: WF17/18/19 from src/public/wireframes-phase2/participant-public/.
 */

import "@/styles/wireframes-scoped.css";
import { assessmentRoboto } from "@/lib/assessments/assessment-fonts";

export default function PublicQuizLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // assessmentRoboto.variable defines --font-assessment-body on this subtree so
  // the pager's .su-assessment-brand font-family actually resolves to Roboto.
  // Kept off <body> and off .wf-scope's tokens — scoped to the participant lane.
  return (
    <div
      className={`wf-scope ${assessmentRoboto.variable}`}
      style={{ minHeight: "100vh" }}
    >
      {children}
    </div>
  );
}
