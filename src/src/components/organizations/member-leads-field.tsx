"use client";

import React from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isCEOFamily } from "@/lib/assessments/respondent-levels";
import { scopeForTeamLeaderRoots } from "@/lib/members/entitlement";
import type { MemberLedTeamSource } from "@/lib/members/led-teams";
import type { ApiTeamNode } from "./members-teams-view";

export type MemberLedTeamView = {
  teamId: string;
  teamName: string;
  source: MemberLedTeamSource;
  createdBy: string;
  createdAt: string | Date;
};

export type AuthorityMember = {
  id: string;
  teamId: string | null;
  roleType: string | null;
  firstName: string;
  lastName: string;
};

export interface MemberLeadsFieldProps {
  roleType: string;
  memberId?: string;
  memberFirstName: string;
  teams: ApiTeamNode[];
  organizationMembers: AuthorityMember[];
  selectedTeamIds: string[];
  assignments: MemberLedTeamView[];
  onChange: (teamIds: string[]) => void;
  onConfirm?: (teamId: string) => void | Promise<void>;
  confirmingTeamIds?: string[];
  disabled?: boolean;
}

function uniqueTeams(teams: ApiTeamNode[]): ApiTeamNode[] {
  const found = new Map<string, ApiTeamNode>();
  const visit = (nodes: ApiTeamNode[]) => {
    for (const team of nodes) {
      if (!found.has(team.id)) found.set(team.id, team);
      visit(team.children);
    }
  };
  visit(teams);
  return [...found.values()];
}

export function MemberLeadsField({
  roleType,
  memberId,
  memberFirstName,
  teams,
  organizationMembers,
  selectedTeamIds,
  assignments,
  onChange,
  onConfirm,
  confirmingTeamIds = [],
  disabled = false,
}: MemberLeadsFieldProps) {
  const availableTeams = uniqueTeams(teams);
  const teamById = new Map(availableTeams.map((team) => [team.id, team]));
  const canLead = roleType === "teamleader";
  const controlDisabled = disabled || !canLead;
  const selected = new Set(selectedTeamIds);
  const inferred = new Map(
    assignments
      .filter((assignment) => assignment.source === "backfill-0040")
      .map((assignment) => [assignment.teamId, assignment]),
  );

  const visibleMemberIds = scopeForTeamLeaderRoots(
    memberId ?? "__new-member__",
    selectedTeamIds,
    organizationMembers.map((member) => ({
      respondentId: member.id,
      teamId: member.teamId,
      roleType: member.roleType,
      deletedAt: null,
      organizationDeletedAt: null,
    })),
    availableTeams.map((team) => ({
      teamId: team.id,
      parentTeamId: team.parentTeamId,
      deletedAt: null,
    })),
  );
  const peerNames: string[] = [];
  for (const member of organizationMembers) {
    if (!visibleMemberIds.has(member.id) || isCEOFamily(member.roleType)) {
      continue;
    }
    if (member.roleType === "teamleader" && member.id !== memberId) {
      peerNames.push(`${member.firstName} ${member.lastName}`.trim());
    }
  }

  const setSelected = (teamId: string, checked: boolean) => {
    const next = checked
      ? [...selectedTeamIds, teamId]
      : selectedTeamIds.filter((id) => id !== teamId);
    onChange([...new Set(next)]);
  };

  return (
    <div className="space-y-2" data-testid="member-leads-field">
      <Label>Leads</Label>
      <div className="rounded-md border border-input bg-background p-2 shadow-sm">
        {selectedTeamIds.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected led teams">
            {selectedTeamIds.map((teamId) => {
              const teamName = teamById.get(teamId)?.name ?? inferred.get(teamId)?.teamName ?? teamId;
              const isInferred = inferred.has(teamId);
              return (
                <span
                  key={teamId}
                  className={isInferred
                    ? "inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                    : "inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-medium text-primary"}
                >
                  {teamName}
                  {isInferred && <span className="font-normal">· inferred</span>}
                  <button
                    type="button"
                    aria-label={`Remove ${teamName}`}
                    onClick={() => setSelected(teamId, false)}
                    disabled={controlDisabled}
                    className="rounded-sm p-0.5 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Choose led teams"
              disabled={controlDisabled}
              className="flex min-h-9 w-full items-center justify-between rounded-sm px-1 text-left text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{canLead ? (selectedTeamIds.length ? "Add another team" : "— no teams —") : "— not available —"}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <p className="px-2 pb-2 text-xs text-muted-foreground">
              Select every team this person leads. Department selections include their child teams.
            </p>
            <div className="max-h-64 overflow-y-auto">
              {availableTeams.map((team) => (
                <label
                  key={team.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={selected.has(team.id)}
                    onChange={(event) => setSelected(team.id, event.target.checked)}
                  />
                  <span className="flex-1">{team.name}</span>
                  {selected.has(team.id) && <Check className="h-4 w-4 text-primary" />}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {!canLead && (
        <p className="text-xs text-muted-foreground">
          Only a Leadership team member can lead a team. CEO/Founder already sees the whole company.
        </p>
      )}

      {canLead && selectedTeamIds.length === 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {memberFirstName || "This member"} will see only their own reports. Choose a team if they should see their department&apos;s results.
        </p>
      )}

      {canLead && selectedTeamIds.length > 0 && peerNames.length === 0 && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          Can read reports for {visibleMemberIds.size} {visibleMemberIds.size === 1 ? "person" : "people"}. Zero, one or several teams are all valid.
        </p>
      )}

      {canLead && peerNames.length > 0 && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          Can read reports for {visibleMemberIds.size} {visibleMemberIds.size === 1 ? "person" : "people"}. A selected team contains {peerNames.length} other Leadership team {peerNames.length === 1 ? "member" : "members"}. {memberFirstName || "This member"} would be able to read {peerNames.join(", ")}&apos;s personal reports. Save anyway, or remove that team.
        </p>
      )}

      {selectedTeamIds
        .filter((teamId) => inferred.has(teamId))
        .map((teamId) => {
          const assignment = inferred.get(teamId)!;
          const confirming = confirmingTeamIds.includes(teamId);
          return (
            <div
              key={teamId}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <p>
                <strong>{assignment.teamName}</strong> was inferred from their team when this feature launched — not chosen by a coach.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Confirm ${assignment.teamName}`}
                  disabled={confirming || disabled || !onConfirm}
                  onClick={() => onConfirm?.(teamId)}
                >
                  {confirming ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  Confirm
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Remove inferred ${assignment.teamName}`}
                  disabled={disabled}
                  onClick={() => setSelected(teamId, false)}
                >
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
    </div>
  );
}
