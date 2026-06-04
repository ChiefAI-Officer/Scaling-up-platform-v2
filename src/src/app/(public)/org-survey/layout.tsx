import "@/styles/wireframes-scoped.css";
import { assessmentRoboto } from "@/lib/assessments/assessment-fonts";

export default function OrgSurveyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // assessmentRoboto.variable defines --font-assessment-body on this subtree so
  // the pager's .su-assessment-brand font-family actually resolves to Roboto.
  // Kept off <body> and off .wf-scope's tokens — scoped to the participant lane.
  return (
    <div
      className={`wf-scope su-assessment-brand ${assessmentRoboto.variable}`}
      style={{ minHeight: "100vh" }}
    >
      {children}
    </div>
  );
}
