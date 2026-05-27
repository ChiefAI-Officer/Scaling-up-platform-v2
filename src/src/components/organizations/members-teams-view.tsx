"use client";

/**
 * MembersTeamsView — two-panel read-only display of a coach's companies,
 * their team hierarchy, and the members in each team.
 *
 * LEFT panel:  company root nodes (expandable) → OrgTeam tree + "not associated" bucket
 * RIGHT panel: respondent list for the selected node (Name, Email, Level)
 *
 * All data fetched on demand from existing REST APIs:
 *   GET /api/organizations/[id]/teams
 *   GET /api/organizations/[id]/respondents?teamId=<id>
 */

import React, { useState, useCallback } from "react";
import { ChevronRight, ChevronDown, Building2, Users, UserPlus, FolderPlus } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal org shape passed from the server page */
export interface OrgSummary {
  id: string;
  name: string;
  ownerCoachId: string;
}

/** Shape returned by GET /api/organizations/[id]/teams (nested tree) */
export interface ApiTeamNode {
  id: string;
  organizationId: string;
  parentTeamId: string | null;
  name: string;
  type: string | null;
  description: string | null;
  children: ApiTeamNode[];
}

/** Shape returned by GET /api/organizations/[id]/respondents */
export interface ApiRespondent {
  id: string;
  organizationId: string;
  teamId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  roleType: string | null;
  jobTitle?: string | null;
}

/**
 * Discriminated union for every selectable / expandable node.
 * Every handler branches on `kind`.
 */
export type TreeNode =
  | { kind: "organization"; id: string; name: string }
  | { kind: "team"; id: string; orgId: string; name: string; parentTeamId: string | null }
  | { kind: "unassigned"; orgId: string };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MembersTeamsViewProps {
  initialOrganizations: OrgSummary[];
}

// ---------------------------------------------------------------------------
// State shapes
// ---------------------------------------------------------------------------

interface OrgState {
  expanded: boolean;
  teams: ApiTeamNode[] | null; // null = not yet loaded
  loadingTeams: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flatten a nested tree into a breadth-first list for rendering */
function flattenTree(
  nodes: ApiTeamNode[],
  orgId: string,
  depth: number
): Array<{ node: ApiTeamNode; depth: number; orgId: string }> {
  const result: Array<{ node: ApiTeamNode; depth: number; orgId: string }> = [];
  for (const n of nodes) {
    result.push({ node: n, depth, orgId });
    result.push(...flattenTree(n.children, orgId, depth + 1));
  }
  return result;
}

/** Check two TreeNode values for equality */
function isSameNode(a: TreeNode | null, b: TreeNode): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "organization" && b.kind === "organization") return a.id === b.id;
  if (a.kind === "team" && b.kind === "team") return a.id === b.id;
  if (a.kind === "unassigned" && b.kind === "unassigned") return a.orgId === b.orgId;
  return false;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NodeButton({
  label,
  selected,
  depth,
  icon,
  onClick,
}: {
  label: string;
  selected: boolean;
  depth: number;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      className={[
        "w-full flex items-center gap-2 py-1.5 pr-3 rounded-md text-sm text-left transition-colors",
        selected
          ? "bg-primary/10 text-primary font-medium"
          : "text-foreground hover:bg-muted",
      ].join(" ")}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MembersTeamsView({ initialOrganizations }: MembersTeamsViewProps) {
  // Per-org expansion + team data state
  const [orgStates, setOrgStates] = useState<Record<string, OrgState>>(() => {
    const init: Record<string, OrgState> = {};
    for (const org of initialOrganizations) {
      init[org.id] = { expanded: false, teams: null, loadingTeams: false };
    }
    return init;
  });

  // Selected node drives the right panel
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  // Members for the currently selected node
  const [members, setMembers] = useState<ApiRespondent[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // --------------------------------------------------------------------------
  // Fetch helpers
  // --------------------------------------------------------------------------

  const loadTeams = useCallback(async (orgId: string) => {
    setOrgStates((prev) => ({
      ...prev,
      [orgId]: { ...prev[orgId], loadingTeams: true },
    }));
    try {
      const res = await fetch(`/api/organizations/${orgId}/teams`);
      const json = await res.json();
      setOrgStates((prev) => ({
        ...prev,
        [orgId]: {
          ...prev[orgId],
          teams: json.success ? (json.data as ApiTeamNode[]) : [],
          loadingTeams: false,
        },
      }));
    } catch {
      setOrgStates((prev) => ({
        ...prev,
        [orgId]: { ...prev[orgId], teams: [], loadingTeams: false },
      }));
    }
  }, []);

  const loadMembers = useCallback(async (node: TreeNode) => {
    setLoadingMembers(true);
    setMembers([]);
    try {
      let url: string;
      if (node.kind === "organization") {
        url = `/api/organizations/${node.id}/respondents`;
      } else if (node.kind === "team") {
        url = `/api/organizations/${node.orgId}/respondents?teamId=${node.id}`;
      } else {
        // unassigned — fetch all, then filter client-side to those with teamId === null
        url = `/api/organizations/${node.orgId}/respondents`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        let data = json.data as ApiRespondent[];
        // For the unassigned bucket, filter to only unteamed respondents
        if (node.kind === "unassigned") {
          data = data.filter((r) => r.teamId === null);
        }
        setMembers(data);
      }
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const handleOrgClick = useCallback(
    async (org: OrgSummary) => {
      const state = orgStates[org.id];
      const isExpanding = !state.expanded;

      // Toggle expansion
      setOrgStates((prev) => ({
        ...prev,
        [org.id]: { ...prev[org.id], expanded: isExpanding },
      }));

      // Lazy-load teams on first expand
      if (isExpanding && state.teams === null) {
        await loadTeams(org.id);
      }

      // Select the org node for member display
      const node: TreeNode = { kind: "organization", id: org.id, name: org.name };
      setSelectedNode(node);
      await loadMembers(node);
    },
    [orgStates, loadTeams, loadMembers]
  );

  const handleTeamClick = useCallback(
    async (teamNode: ApiTeamNode, orgId: string) => {
      const node: TreeNode = {
        kind: "team",
        id: teamNode.id,
        orgId,
        name: teamNode.name,
        parentTeamId: teamNode.parentTeamId,
      };
      setSelectedNode(node);
      await loadMembers(node);
    },
    [loadMembers]
  );

  const handleUnassignedClick = useCallback(
    async (orgId: string) => {
      const node: TreeNode = { kind: "unassigned", orgId };
      setSelectedNode(node);
      await loadMembers(node);
    },
    [loadMembers]
  );

  // --------------------------------------------------------------------------
  // Render — LEFT panel
  // --------------------------------------------------------------------------

  function renderLeftPanel() {
    return (
      <div className="flex-none w-64 border-r border-border overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Teams
          </h2>
          <button
            type="button"
            disabled
            title="Add Team (coming soon)"
            className="p-1 rounded-md text-muted-foreground opacity-40 cursor-not-allowed"
            aria-label="Add Team (coming soon)"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>

        {initialOrganizations.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No companies yet. Create one to get started.
          </p>
        )}

        <div className="p-2 space-y-0.5">
          {initialOrganizations.map((org) => {
            const state = orgStates[org.id];
            const orgNode: TreeNode = { kind: "organization", id: org.id, name: org.name };
            const isSelected = isSameNode(selectedNode, orgNode);

            return (
              <div key={org.id}>
                {/* Company root node */}
                <button
                  type="button"
                  aria-label={org.name}
                  aria-pressed={isSelected}
                  aria-expanded={state.expanded}
                  onClick={() => handleOrgClick(org)}
                  className={[
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                    isSelected
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {state.expanded ? (
                    <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <Building2 className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate font-medium">{org.name}</span>
                </button>

                {/* Expanded children */}
                {state.expanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {state.loadingTeams && (
                      <p className="pl-8 py-1 text-xs text-muted-foreground">Loading…</p>
                    )}

                    {/* Nested team tree */}
                    {state.teams &&
                      flattenTree(state.teams, org.id, 1).map(({ node: tn, depth }) => {
                        const teamNode: TreeNode = {
                          kind: "team",
                          id: tn.id,
                          orgId: org.id,
                          name: tn.name,
                          parentTeamId: tn.parentTeamId,
                        };
                        const isTeamSelected = isSameNode(selectedNode, teamNode);
                        return (
                          <NodeButton
                            key={tn.id}
                            label={tn.name}
                            selected={isTeamSelected}
                            depth={depth}
                            icon={<Users className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />}
                            onClick={() => handleTeamClick(tn, org.id)}
                          />
                        );
                      })}

                    {/* "Not associated with any team" pseudo-node */}
                    {state.teams !== null && (
                      <NodeButton
                        label="Not associated with any team"
                        selected={isSameNode(selectedNode, { kind: "unassigned", orgId: org.id })}
                        depth={1}
                        icon={<Users className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground opacity-50" />}
                        onClick={() => handleUnassignedClick(org.id)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render — RIGHT panel
  // --------------------------------------------------------------------------

  function renderRightPanel() {
    const panelTitle = selectedNode
      ? selectedNode.kind === "organization"
        ? initialOrganizations.find((o) => o.id === selectedNode.id)?.name ?? "Organization"
        : selectedNode.kind === "team"
        ? selectedNode.name
        : "Not associated with any team"
      : null;

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            {panelTitle ? `Members — ${panelTitle}` : "Members"}
          </h2>
          <button
            type="button"
            disabled
            title="Add Member (coming soon)"
            className="p-1 rounded-md text-muted-foreground opacity-40 cursor-not-allowed"
            aria-label="Add Member (coming soon)"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>

        {!selectedNode && (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm text-muted-foreground">
              Select a company or team to view its members.
            </p>
          </div>
        )}

        {selectedNode && loadingMembers && (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm text-muted-foreground">Loading members…</p>
          </div>
        )}

        {selectedNode && !loadingMembers && members.length === 0 && (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm text-muted-foreground">No members found.</p>
          </div>
        )}

        {selectedNode && !loadingMembers && members.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-6 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-2.5 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-6 py-2.5 text-left font-medium text-muted-foreground">Level</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border hover:bg-muted/20 transition-colors"
                    data-testid={`member-row-${m.id}`}
                  >
                    <td className="px-6 py-3 text-foreground font-medium">
                      {m.firstName} {m.lastName}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{m.email}</td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {m.roleType ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Root render
  // --------------------------------------------------------------------------

  return (
    <div className="flex h-full min-h-[500px] rounded-xl border border-border bg-card overflow-hidden">
      {renderLeftPanel()}
      {renderRightPanel()}
    </div>
  );
}
