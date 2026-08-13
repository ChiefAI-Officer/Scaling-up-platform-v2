import Link from "next/link";
import { DeleteSurveyTemplateButton } from "@/components/surveys/delete-survey-template-button";
import { ResponsiveActionsItem } from "@/components/ui/responsive-actions-menu";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";
import {
  ResponsiveRecord,
  ResponsiveRecordActions,
  ResponsiveRecordHeader,
  ResponsiveRecordMeta,
} from "@/components/ui/responsive-record";
import { SURVEY_TYPE_LABELS } from "@/lib/surveys/survey-types";
import type { SurveyType } from "@/lib/surveys/survey-types";
import { formatTimestamp } from "@/lib/utils";

export interface SurveyTemplateListItem {
  id: string;
  name: string;
  description: string | null;
  surveyType: string;
  isActive: boolean;
  updatedAt: Date | string;
  questions: Array<{ id: string }>;
  _count: { surveys: number };
}

export function SurveyTemplatesView({
  templates,
  responsiveEnabled = false,
}: {
  templates: SurveyTemplateListItem[];
  responsiveEnabled?: boolean;
}) {
  const wide = (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Questions</th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Responses</th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {templates.map((template) => (
            <tr key={template.id} className="hover:bg-accent">
              <td className="px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-foreground">{template.name}</div>
                  {template.description && <div className="text-sm text-muted-foreground">{template.description}</div>}
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info">
                  {SURVEY_TYPE_LABELS[template.surveyType as SurveyType] || template.surveyType}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-foreground">{template.questions.length}</td>
              <td className="px-6 py-4 text-sm text-foreground">{template._count.surveys}</td>
              <td className="px-6 py-4">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${template.isActive ? "bg-success/10 text-success" : "bg-muted text-foreground"}`}>
                  {template.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Link href={`/admin/surveys/templates/${template.id}`} className={responsiveEnabled ? "inline-flex min-h-11 items-center text-sm font-medium text-primary hover:text-primary/80" : "text-sm font-medium text-primary hover:text-primary/80"}>Edit</Link>
                  {template._count.surveys > 0 && <Link href={`/admin/surveys/templates/${template.id}?tab=results`} className={responsiveEnabled ? "inline-flex min-h-11 items-center text-sm font-medium text-success hover:text-success/80" : "text-sm font-medium text-success hover:text-success/80"}>Results</Link>}
                  <DeleteSurveyTemplateButton templateId={template.id} templateName={template.name} surveyCount={template._count.surveys} responsiveEnabled={responsiveEnabled} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ResponsiveDataView
      enabled={responsiveEnabled}
      label="Survey templates"
      wideRegionLabel="Survey templates table"
      compact={<div className="space-y-3">{templates.map((template) => (
        <ResponsiveRecord key={template.id}>
          <ResponsiveRecordHeader
            title={template.name}
            status={<span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${template.isActive ? "bg-success/10 text-success" : "bg-muted text-foreground"}`}>{template.isActive ? "Active" : "Inactive"}</span>}
          />
          {template.description && <p className="mt-2 break-words text-sm text-muted-foreground">{template.description}</p>}
          <ResponsiveRecordMeta items={[
            { label: "Type", value: SURVEY_TYPE_LABELS[template.surveyType as SurveyType] || template.surveyType },
            { label: "Questions", value: template.questions.length },
            { label: "Responses", value: template._count.surveys },
            { label: "Updated", value: formatTimestamp(template.updatedAt) },
          ]} />
          <ResponsiveRecordActions
            primary={<Link href={`/admin/surveys/templates/${template.id}`} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Open template</Link>}
            menuLabel={`More actions for ${template.name}`}
            secondary={<>
              {template._count.surveys > 0 && <ResponsiveActionsItem asChild><Link href={`/admin/surveys/templates/${template.id}?tab=results`} className="flex min-h-11 items-center rounded-md px-3 text-sm outline-none hover:bg-accent">Results</Link></ResponsiveActionsItem>}
              <DeleteSurveyTemplateButton templateId={template.id} templateName={template.name} surveyCount={template._count.surveys} responsiveEnabled menuItem />
            </>}
          />
        </ResponsiveRecord>
      ))}</div>}
      wide={wide}
    />
  );
}
