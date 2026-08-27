export type SummaryReportType =
  | "SCALING_CEO_FULL"
  | "SCALING_CONDENSED_CEO"
  | "SCALING_SELF_COMPARISON"
  | "LVA_CEO_FULL"
  | "QSP_V1_CEO_FULL"
  | "QSP_V2_CEO_FULL"
  | "ROCKEFELLER_FULL";

export type SummaryReportSourceRole = "CEO" | "TEAM" | "FOCUS" | "EARLIER";

export interface SummaryReportDefinition {
  type: SummaryReportType;
  templateAliases: readonly string[];
  label: string;
  description: string;
  implemented: boolean;
  roles: readonly {
    role: SummaryReportSourceRole;
    min: number;
    max: number | null;
  }[];
  hasRemarksStep: boolean;
  rendererVersion: string;
}
