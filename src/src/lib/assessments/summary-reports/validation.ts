import type { SelectedSummarySource } from "./canonical";
import type { SummaryReportDefinition, SummaryReportSourceRole } from "./types";

export interface CompositionValidationError {
  code: string;
  message: string;
  submissionId?: string;
}

export type CompositionValidationResult =
  | { ok: true }
  | { ok: false; errors: CompositionValidationError[] };

function hasSequentialPositions(sources: readonly SelectedSummarySource[]): boolean {
  const positions = sources.map((source) => source.position).sort((left, right) => left - right);
  return positions.every((position, index) => Number.isInteger(position) && position === index);
}

/** Validates an explicitly selected source composition against its registry role contract. */
export function validateComposition(
  definition: SummaryReportDefinition,
  sources: readonly SelectedSummarySource[],
): CompositionValidationResult {
  const errors: CompositionValidationError[] = [];
  const roleContracts = new Map(definition.roles.map((contract) => [contract.role, contract]));
  const seenSubmissionIds = new Set<string>();
  const sourcesByRole = new Map<SummaryReportSourceRole, SelectedSummarySource[]>();

  for (const source of sources) {
    if (seenSubmissionIds.has(source.submissionId)) {
      errors.push({
        code: "duplicate_submission",
        message: "A submission may only be selected once.",
        submissionId: source.submissionId,
      });
    } else {
      seenSubmissionIds.add(source.submissionId);
    }

    if (!roleContracts.has(source.role)) {
      errors.push({
        code: "unknown_role",
        message: `Role ${source.role} is not allowed for this report type.`,
        submissionId: source.submissionId,
      });
      continue;
    }

    const roleSources = sourcesByRole.get(source.role) ?? [];
    roleSources.push(source);
    sourcesByRole.set(source.role, roleSources);
  }

  for (const contract of definition.roles) {
    const roleSources = sourcesByRole.get(contract.role) ?? [];
    const count = roleSources.length;

    if (count < contract.min) {
      errors.push({
        code: "role_minimum",
        message: `Role ${contract.role} requires at least ${contract.min} source${contract.min === 1 ? "" : "s"}.`,
      });
    }
    if (contract.max !== null && count > contract.max) {
      errors.push({
        code: "role_maximum",
        message: `Role ${contract.role} allows at most ${contract.max} source${contract.max === 1 ? "" : "s"}.`,
      });
    }
    if (!hasSequentialPositions(roleSources)) {
      errors.push({
        code: "invalid_role_positions",
        message: `Role ${contract.role} positions must be unique sequential integers beginning at 0.`,
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
