import "@/styles/wireframes-scoped.css";

export default function OrgSurveyLayout({
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
