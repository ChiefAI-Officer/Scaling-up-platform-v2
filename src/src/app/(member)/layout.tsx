import "@/styles/su-public-brand.css";
import "@/styles/su-report.css";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <main className="su-public-brand min-h-screen bg-slate-50 text-slate-900">{children}</main>;
}
