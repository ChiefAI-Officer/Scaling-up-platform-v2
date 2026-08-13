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

import React, { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronDown, Building2, Users, UserPlus, Upload, FolderPlus, Pencil, FileDown } from "lucide-react";
import { levelLabel } from "@/lib/assessments/respondent-levels";
import { AddTeamModal } from "./add-team-modal";
import type { CreatedResult } from "./add-team-modal";
import { AddMemberModal } from "./add-member-modal";
import type { MemberCreatedResult } from "./add-member-modal";
import { EditTeamModal, excludeTeamSubtree } from "./edit-team-modal";
import type { EditTeamModalTeam } from "./edit-team-modal";
import { EditMemberModal } from "./edit-member-modal";
import type { EditMemberModalMember } from "./edit-member-modal";
import { EditOrganizationModal } from "./edit-organization-modal";
import type { EditOrganizationModalOrg } from "./edit-organization-modal";
import { ImportMembersModal } from "./import-members-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal org shape passed from the server page */
export interface OrgSummary {
  id: string;
  name: string;
  ownerCoachId: string;
  /**
   * #86 — owning coach's display name, for the admin "by coach" grouping.
   * Optional: the coach portal never groups, so it needn't supply it; null
   * when an org has no owning coach.
   */
  ownerCoachName?: string | null;
  externalId: string | null;
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
  /**
   * Wave Z (Z-3) — gates the "Add Company or Team" (+) button. Default true
   * (coach portal). The admin host passes false: its company-create path
   * `POST /api/organizations` 403s for a non-coach actor ("Only coaches can
   * create organizations"), and the button is the only entry point to that
   * flow. Admin still manages EXISTING rosters/teams via node actions + CSV
   * import; creating brand-new companies/teams from the admin oversight page
   * is out of scope this wave.
   */
  allowOrgCreate?: boolean;
  /**
   * Wave Z (Z-3) — hides the "Import from Esperto" link, which points at the
   * coach-only `/portal/members/import` route (a `requireCoach()` bounce for
   * admin). Default false (coach portal). Admin has its own
   * `/admin/assessments/import`.
   */
  hideEspertoImport?: boolean;
  /**
   * #86 — enables the admin-only "Organizations by coach" view toggle. Default
   * false (coach portal, which only ever shows one coach's orgs, so grouping is
   * meaningless). When true, a small A–Z / By coach switch appears above the
   * company list; "By coach" groups companies under their owning-coach header.
   */
  allowGroupByCoach?: boolean;
  /** Enables the adaptive compact drill-in presentation. */
  responsiveEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// State shapes
// ---------------------------------------------------------------------------

interface OrgState {
  expanded: boolean;
  teams: ApiTeamNode[] | null; // null = not yet loaded
  loadingTeams: boolean;
  teamsError: boolean;
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
  responsiveEnabled = false,
}: {
  label: string;
  selected: boolean;
  depth: number;
  icon?: React.ReactNode;
  onClick: () => void;
  responsiveEnabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      {...(responsiveEnabled ? { "data-touch-target": true } : {})}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      className={[
        "w-full flex items-center gap-2 py-1.5 pr-3 rounded-md text-sm text-left transition-colors",
        ...(responsiveEnabled ? ["min-h-11"] : []),
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

export function MembersTeamsView({
  initialOrganizations,
  allowOrgCreate = true,
  hideEspertoImport = false,
  allowGroupByCoach = false,
  responsiveEnabled = false,
}: MembersTeamsViewProps) {
  // Companies list — may grow when a new Company is created via the modal
  const [organizations, setOrganizations] = useState<OrgSummary[]>(initialOrganizations);

  // #86 — admin "by coach" grouping toggle (only offered when allowGroupByCoach).
  const [groupByCoach, setGroupByCoach] = useState(false);

  // Per-org expansion + team data state
  const [orgStates, setOrgStates] = useState<Record<string, OrgState>>(() => {
    const init: Record<string, OrgState> = {};
    for (const org of initialOrganizations) {
      init[org.id] = { expanded: false, teams: null, loadingTeams: false, teamsError: false };
    }
    return init;
  });

  // Add Team modal state
  const [addTeamOpen, setAddTeamOpen] = useState(false);

  // Add Member modal state
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  // Import Members (bulk CSV) modal state
  const [importMembersOpen, setImportMembersOpen] = useState(false);

  // Edit Team modal state — null when closed
  const [editingTeam, setEditingTeam] = useState<EditTeamModalTeam | null>(null);

  // Edit Member modal state — null when closed
  const [memberBeingEdited, setMemberBeingEdited] = useState<EditMemberModalMember | null>(null);

  // Edit Organization modal state — null when closed
  const [orgBeingEdited, setOrgBeingEdited] = useState<EditOrganizationModalOrg | null>(null);

  // Selected node drives the right panel
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  // Presentation-only compact navigation; selectedNode remains the domain selection.
  const [compactDetailOpen, setCompactDetailOpen] = useState(false);

  // Members for the currently selected node
  const [members, setMembers] = useState<ApiRespondent[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState(false);

  // Sequence counters for request-ordering guards (prevent stale responses overwriting newer ones)
  const memberSeqRef = useRef(0);
  // Per-org team sequence counters: orgId → latest seq number
  const teamSeqRef = useRef<Record<string, number>>({});

  // --------------------------------------------------------------------------
  // Fetch helpers
  // --------------------------------------------------------------------------

  const loadTeams = useCallback(async (orgId: string) => {
    // Increment per-org sequence; capture this call's seq
    const prevSeq = teamSeqRef.current[orgId] ?? 0;
    const mySeq = prevSeq + 1;
    teamSeqRef.current = { ...teamSeqRef.current, [orgId]: mySeq };

    setOrgStates((prev) => ({
      ...prev,
      [orgId]: { ...prev[orgId], loadingTeams: true, teamsError: false },
    }));
    try {
      const res = await fetch(`/api/organizations/${orgId}/teams`);
      const json = await res.json();
      // Bail if a newer call has started for this org
      if (teamSeqRef.current[orgId] !== mySeq) return;
      if (!res.ok || !json.success) {
        setOrgStates((prev) => ({
          ...prev,
          [orgId]: { ...prev[orgId], teams: null, loadingTeams: false, teamsError: true },
        }));
        return;
      }
      setOrgStates((prev) => ({
        ...prev,
        [orgId]: {
          ...prev[orgId],
          teams: json.data as ApiTeamNode[],
          loadingTeams: false,
          teamsError: false,
        },
      }));
    } catch {
      if (teamSeqRef.current[orgId] !== mySeq) return;
      setOrgStates((prev) => ({
        ...prev,
        [orgId]: { ...prev[orgId], teams: null, loadingTeams: false, teamsError: true },
      }));
    }
  }, []);

  const loadMembers = useCallback(async (node: TreeNode) => {
    // Increment sequence; capture this call's seq
    const mySeq = memberSeqRef.current + 1;
    memberSeqRef.current = mySeq;

    setLoadingMembers(true);
    setMembers([]);
    setMembersError(false);
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
      // Bail if a newer call has started
      if (memberSeqRef.current !== mySeq) return;
      if (!res.ok || !json.success) {
        setMembersError(true);
        return;
      }
      let data = json.data as ApiRespondent[];
      // For the unassigned bucket, filter to only unteamed respondents
      if (node.kind === "unassigned") {
        data = data.filter((r) => r.teamId === null);
      }
      setMembers(data);
    } catch {
      if (memberSeqRef.current !== mySeq) return;
      setMembersError(true);
    } finally {
      // Only clear loading if this call is still the latest
      if (memberSeqRef.current === mySeq) {
        setLoadingMembers(false);
      }
    }
  }, []);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const showCompactDetail = useCallback(() => {
    if (responsiveEnabled) setCompactDetailOpen(true);
  }, [responsiveEnabled]);

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
      showCompactDetail();
    },
    [orgStates, loadTeams, loadMembers, showCompactDetail]
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
      showCompactDetail();
    },
    [loadMembers, showCompactDetail]
  );

  const handleUnassignedClick = useCallback(
    async (orgId: string) => {
      const node: TreeNode = { kind: "unassigned", orgId };
      setSelectedNode(node);
      await loadMembers(node);
      showCompactDetail();
    },
    [loadMembers, showCompactDetail]
  );

  // --------------------------------------------------------------------------
  // AddTeamModal callback
  // --------------------------------------------------------------------------

  const handleCreated = useCallback(
    async (result: CreatedResult) => {
      if (result.kind === "organization") {
        // Add the new company to the local list + bootstrap its org state
        setOrganizations((prev) => [result.org, ...prev]);
        setOrgStates((prev) => ({
          ...prev,
          [result.org.id]: { expanded: false, teams: null, loadingTeams: false, teamsError: false },
        }));
      } else {
        // Expand the org so the new team is visible, then refresh its team tree
        setOrgStates((prev) => ({
          ...prev,
          [result.orgId]: { ...(prev[result.orgId] ?? { teams: null, loadingTeams: false, teamsError: false }), expanded: true },
        }));
        await loadTeams(result.orgId);
      }
    },
    [loadTeams]
  );

  // AddMemberModal callback — refresh the right panel after create
  const handleMemberCreated = useCallback(
    async (_result: MemberCreatedResult) => {
      if (selectedNode) {
        await loadMembers(selectedNode);
      }
    },
    [selectedNode, loadMembers]
  );

  // Build the loadedTeams map the modal needs for its Parent select
  const loadedTeamsForModal: Record<string, ApiTeamNode[]> = {};
  for (const org of organizations) {
    const state = orgStates[org.id];
    if (state?.teams) {
      loadedTeamsForModal[org.id] = state.teams;
    } else {
      loadedTeamsForModal[org.id] = [];
    }
  }

  // --------------------------------------------------------------------------
  // Render — LEFT panel
  // --------------------------------------------------------------------------

  function renderLeftPanel() {
    // #86 — when grouping by coach, order companies by owning-coach name
    // ("No owning coach" last), then by company name; a header is injected
    // before each coach's first company in the map below.
    const NO_COACH_LABEL = "No owning coach";
    // Grouped + headed by the coach's display NAME (spec: "by coach"). Two
    // distinct coaches with an identical name would share one header — accepted
    // for this display-only overview; every company row is still individually
    // selectable, so no data is conflated, only the grouping label.
    const coachLabelOf = (org: OrgSummary) =>
      (org.ownerCoachName ?? "").trim() || NO_COACH_LABEL;
    const displayOrgs = groupByCoach
      ? [...organizations].sort((a, b) => {
          const aNo = coachLabelOf(a) === NO_COACH_LABEL;
          const bNo = coachLabelOf(b) === NO_COACH_LABEL;
          if (aNo !== bNo) return aNo ? 1 : -1;
          const byCoach = coachLabelOf(a).localeCompare(coachLabelOf(b));
          return byCoach !== 0 ? byCoach : a.name.localeCompare(b.name);
        })
      : organizations;
    return (
      <div
        data-testid={responsiveEnabled ? "members-browse-panel" : undefined}
        className={responsiveEnabled
          ? compactDetailOpen
            ? "hidden min-w-0 overflow-y-auto md:block md:border-r md:border-border"
            : "min-w-0 overflow-y-auto md:block md:border-r md:border-border"
          : "flex-none w-64 border-r border-border overflow-y-auto"}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Teams
          </h2>
          {allowOrgCreate && (
            <button
              type="button"
              onClick={() => setAddTeamOpen(true)}
              title="Add Company or Team"
              className={responsiveEnabled
                ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                : "p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"}
              aria-label="Add Company or Team"
              {...(responsiveEnabled ? { "data-touch-target": true } : {})}
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* #86 — admin-only A–Z / By coach view switch */}
        {allowGroupByCoach && organizations.length > 0 && (
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground mr-1">View:</span>
            <button
              type="button"
              aria-pressed={!groupByCoach}
              onClick={() => setGroupByCoach(false)}
              {...(responsiveEnabled ? { "data-touch-target": true } : {})}
              className={[
                "px-2 py-0.5 rounded text-xs transition-colors",
                ...(responsiveEnabled ? ["min-h-11"] : []),
                !groupByCoach
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              A–Z
            </button>
            <button
              type="button"
              aria-pressed={groupByCoach}
              onClick={() => setGroupByCoach(true)}
              {...(responsiveEnabled ? { "data-touch-target": true } : {})}
              className={[
                "px-2 py-0.5 rounded text-xs transition-colors",
                ...(responsiveEnabled ? ["min-h-11"] : []),
                groupByCoach
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              By coach
            </button>
          </div>
        )}

        {organizations.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No companies yet. Create one to get started.
          </p>
        )}

        <div className="p-2 space-y-0.5">
          {displayOrgs.map((org, i) => {
            const state = orgStates[org.id];
            const orgNode: TreeNode = { kind: "organization", id: org.id, name: org.name };
            const isSelected = isSameNode(selectedNode, orgNode);
            // #86 — a coach header precedes the first company of each coach group.
            const showCoachHeader =
              groupByCoach &&
              (i === 0 || coachLabelOf(displayOrgs[i - 1]) !== coachLabelOf(org));

            return (
              <div key={org.id}>
                {showCoachHeader && (
                  <div className="px-2 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {coachLabelOf(org)}
                  </div>
                )}
                {/* Company root node — wrapped in group for Edit affordance */}
                <div className="group relative flex items-center">
                  <button
                    type="button"
                    aria-label={org.name}
                    aria-pressed={isSelected}
                    aria-expanded={state.expanded}
                    onClick={() => {
                      if (responsiveEnabled && !compactDetailOpen && isSelected) {
                        showCompactDetail();
                        return;
                      }
                      void handleOrgClick(org);
                    }}
                    {...(responsiveEnabled ? { "data-touch-target": true } : {})}
                    className={[
                      "flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                      ...(responsiveEnabled ? ["min-h-11 min-w-0 pr-12"] : []),
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
                  {/* Edit affordance — shown on hover or when org row is selected */}
                  <button
                    type="button"
                    aria-label={`Edit organization ${org.name}`}
                    title={`Edit ${org.name}`}
                    data-testid={`edit-org-${org.id}`}
                    {...(responsiveEnabled ? { "data-touch-target": true } : {})}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOrgBeingEdited({
                        id: org.id,
                        name: org.name,
                        externalId: org.externalId,
                      });
                    }}
                    className={[
                      "absolute right-1 top-1/2 -translate-y-1/2",
                      responsiveEnabled
                        ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        : "p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                      responsiveEnabled
                        ? "opacity-100"
                        : isSelected
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    ].join(" ")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expanded children */}
                {state.expanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {state.loadingTeams && (
                      <p className="pl-8 py-1 text-xs text-muted-foreground">Loading…</p>
                    )}

                    {!state.loadingTeams && state.teamsError && (
                      <div className="pl-8 py-1 flex items-center gap-2">
                        <p className="text-xs text-destructive" role="alert">Failed to load teams.</p>
                        <button
                          type="button"
                          onClick={() => loadTeams(org.id)}
                          className={responsiveEnabled
                            ? "inline-flex min-h-11 items-center px-2 text-xs text-primary underline hover:no-underline"
                            : "text-xs text-primary underline hover:no-underline"}
                          {...(responsiveEnabled ? { "data-touch-target": true } : {})}
                        >
                          Retry
                        </button>
                      </div>
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
                          <div key={tn.id} className="group relative flex items-center">
                            {/* The clickable name row — fills available width */}
                            <NodeButton
                              label={tn.name}
                              selected={isTeamSelected}
                              depth={depth}
                              icon={<Users className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />}
                              responsiveEnabled={responsiveEnabled}
                              onClick={() => {
                                if (responsiveEnabled && !compactDetailOpen && isTeamSelected) {
                                  showCompactDetail();
                                  return;
                                }
                                void handleTeamClick(tn, org.id);
                              }}
                            />
                            {/* Edit affordance — shown on hover or when row is selected */}
                            <button
                              type="button"
                              aria-label={`Edit ${tn.name}`}
                              title="Edit team"
                              data-testid={`edit-team-${tn.id}`}
                              {...(responsiveEnabled ? { "data-touch-target": true } : {})}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTeam({
                                  id: tn.id,
                                  orgId: org.id,
                                  name: tn.name,
                                  type: tn.type ?? undefined,
                                  description: tn.description ?? undefined,
                                  parentTeamId: tn.parentTeamId,
                                });
                              }}
                              className={[
                                "absolute right-1 top-1/2 -translate-y-1/2",
                                responsiveEnabled
                                  ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  : "p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                                responsiveEnabled
                                  ? "opacity-100"
                                  : isTeamSelected
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                              ].join(" ")}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}

                    {/* "Not associated with any team" pseudo-node */}
                    {state.teams !== null && (
                      <NodeButton
                        label="Not associated with any team"
                        selected={isSameNode(selectedNode, { kind: "unassigned", orgId: org.id })}
                        depth={1}
                        icon={<Users className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground opacity-50" />}
                        responsiveEnabled={responsiveEnabled}
                        onClick={() => {
                          const unassignedNode: TreeNode = { kind: "unassigned", orgId: org.id };
                          if (
                            responsiveEnabled &&
                            !compactDetailOpen &&
                            isSameNode(selectedNode, unassignedNode)
                          ) {
                            showCompactDetail();
                            return;
                          }
                          void handleUnassignedClick(org.id);
                        }}
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
        ? organizations.find((o) => o.id === selectedNode.id)?.name ?? "Organization"
        : selectedNode.kind === "team"
        ? selectedNode.name
        : "Not associated with any team"
      : null;

    return (
      <div
        data-testid={responsiveEnabled ? "members-detail-panel" : undefined}
        className={responsiveEnabled
          ? compactDetailOpen
            ? "min-w-0 overflow-y-auto md:block"
            : "hidden min-w-0 overflow-y-auto md:block"
          : "flex-1 overflow-y-auto"}
      >
        {responsiveEnabled && (
          <button
            type="button"
            data-touch-target
            onClick={() => setCompactDetailOpen(false)}
            className="inline-flex min-h-11 items-center gap-1 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to organizations
          </button>
        )}
        <div className={responsiveEnabled
          ? "flex flex-col items-stretch gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
          : "flex items-center justify-between px-6 py-3 border-b border-border"}
        >
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            {panelTitle ? `Members — ${panelTitle}` : "Members"}
          </h2>
          <div className="flex items-center gap-1">
            {/* Import historical data from Esperto (own lane / page). Hidden on
                the admin host — the link targets the coach-only portal route. */}
            {!hideEspertoImport && (
              <Link
                href="/portal/members/import"
                title="Import from Esperto"
                aria-label="Import from Esperto"
                className={responsiveEnabled
                  ? "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  : "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"}
                {...(responsiveEnabled ? { "data-touch-target": true } : {})}
              >
                <FileDown className="w-4 h-4" />
                Import from Esperto
              </Link>
            )}

            {/* Import members (bulk CSV) */}
            <button
              type="button"
              disabled={!selectedNode}
              onClick={() => {
                if (!selectedNode) return;
                setImportMembersOpen(true);
              }}
              title={selectedNode ? "Import members" : "Select a company or team first"}
              className={[
                responsiveEnabled
                  ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors"
                  : "p-1 rounded-md transition-colors",
                selectedNode
                  ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                  : "text-muted-foreground opacity-40 cursor-not-allowed",
              ].join(" ")}
              aria-label={selectedNode ? "Import members" : "Import members (select a node first)"}
              {...(responsiveEnabled ? { "data-touch-target": true } : {})}
            >
              <Upload className="w-4 h-4" />
            </button>

            {/* Add single member */}
            <button
              type="button"
              disabled={!selectedNode}
              onClick={() => {
                if (!selectedNode) return;
                // Resolve the org for this node and lazy-load teams if not yet fetched
                const modalOrgId =
                  selectedNode.kind === "organization" ? selectedNode.id :
                  selectedNode.kind === "team"         ? selectedNode.orgId :
                  /* unassigned */                       selectedNode.orgId;
                if (orgStates[modalOrgId]?.teams === null && !orgStates[modalOrgId]?.loadingTeams) {
                  loadTeams(modalOrgId);
                }
                setAddMemberOpen(true);
              }}
              title={selectedNode ? "Add Member" : "Select a company or team first"}
              className={[
                responsiveEnabled
                  ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors"
                  : "p-1 rounded-md transition-colors",
                selectedNode
                  ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                  : "text-muted-foreground opacity-40 cursor-not-allowed",
              ].join(" ")}
              aria-label={selectedNode ? "Add Member" : "Add Member (select a node first)"}
              {...(responsiveEnabled ? { "data-touch-target": true } : {})}
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>
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

        {selectedNode && !loadingMembers && membersError && (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-sm text-destructive" role="alert">Failed to load members.</p>
            <button
              type="button"
              onClick={() => loadMembers(selectedNode)}
              className={responsiveEnabled
                ? "inline-flex min-h-11 items-center px-3 text-sm text-primary underline hover:no-underline"
                : "text-sm text-primary underline hover:no-underline"}
              {...(responsiveEnabled ? { "data-touch-target": true } : {})}
            >
              Retry
            </button>
          </div>
        )}

        {selectedNode && !loadingMembers && !membersError && members.length === 0 && (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm text-muted-foreground">No members found.</p>
          </div>
        )}

        {selectedNode && !loadingMembers && !membersError && members.length > 0 && (
          <div
            role={responsiveEnabled ? "region" : undefined}
            aria-label={responsiveEnabled ? `Members for ${panelTitle}` : undefined}
            tabIndex={responsiveEnabled ? 0 : undefined}
            className={responsiveEnabled ? "min-w-0 p-3 sm:overflow-x-auto sm:p-0" : "overflow-x-auto"}
          >
            <table className={responsiveEnabled ? "block w-full text-sm sm:table" : "w-full text-sm"}>
              <thead className={responsiveEnabled ? "hidden sm:table-header-group" : undefined}>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-6 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-2.5 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-6 py-2.5 text-left font-medium text-muted-foreground">Level</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-12"></th>
                </tr>
              </thead>
              <tbody className={responsiveEnabled ? "block space-y-3 sm:table-row-group sm:space-y-0" : undefined}>
                {members.map((m) => {
                  // Resolve orgId from the selected node for the Edit modal
                  const memberOrgId =
                    selectedNode!.kind === "organization" ? selectedNode!.id :
                    selectedNode!.kind === "team"         ? selectedNode!.orgId :
                    /* unassigned */                        selectedNode!.orgId;

                  // Flatten the org's loaded teams for the Team selector in the edit modal
                  function flattenForModal(nodes: ApiTeamNode[]): ApiTeamNode[] {
                    const result: ApiTeamNode[] = [];
                    for (const n of nodes) {
                      result.push(n);
                      result.push(...flattenForModal(n.children));
                    }
                    return result;
                  }

                  return (
                    <tr
                      key={m.id}
                      className={responsiveEnabled
                        ? "group block space-y-2 rounded-lg border border-border p-4 transition-colors hover:bg-muted/20 sm:table-row sm:space-y-0 sm:rounded-none sm:border-0 sm:border-b sm:p-0"
                        : "border-b border-border hover:bg-muted/20 transition-colors group"}
                      data-testid={`member-row-${m.id}`}
                    >
                      <td className={responsiveEnabled
                        ? "block min-w-0 break-words py-1 font-medium text-foreground sm:table-cell sm:px-6 sm:py-3"
                        : "px-6 py-3 text-foreground font-medium"}
                      >
                        {m.firstName} {m.lastName}
                      </td>
                      <td className={responsiveEnabled
                        ? "block min-w-0 break-all py-1 text-muted-foreground sm:table-cell sm:px-6 sm:py-3"
                        : "px-6 py-3 text-muted-foreground"}
                      >
                        {responsiveEnabled && (
                          <span className="mr-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
                            Email
                          </span>
                        )}
                        {m.email}
                      </td>
                      <td className={responsiveEnabled
                        ? "block py-1 text-muted-foreground sm:table-cell sm:px-6 sm:py-3"
                        : "px-6 py-3 text-muted-foreground"}
                      >
                        {responsiveEnabled && (
                          <span className="mr-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
                            Level
                          </span>
                        )}
                        {levelLabel(m.roleType)}
                      </td>
                      <td className={responsiveEnabled
                        ? "block py-1 text-left sm:table-cell sm:px-3 sm:py-3 sm:text-right"
                        : "px-3 py-3 text-right"}
                      >
                        <button
                          type="button"
                          aria-label={`Edit ${m.firstName} ${m.lastName}`}
                          title="Edit member"
                          data-testid={`edit-member-${m.id}`}
                          {...(responsiveEnabled ? { "data-touch-target": true } : {})}
                          onClick={() => {
                            setMemberBeingEdited({
                              id: m.id,
                              orgId: memberOrgId,
                              firstName: m.firstName,
                              lastName: m.lastName,
                              email: m.email,
                              jobTitle: m.jobTitle ?? null,
                              teamId: m.teamId ?? null,
                              roleType: m.roleType ?? null,
                            });
                            // Lazy-load teams if not yet fetched
                            if (
                              orgStates[memberOrgId]?.teams === null &&
                              !orgStates[memberOrgId]?.loadingTeams
                            ) {
                              loadTeams(memberOrgId);
                            }
                          }}
                          className={responsiveEnabled
                            ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
    <>
      <div className={responsiveEnabled
        ? "grid min-h-[500px] min-w-0 overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[minmax(16rem,35%)_minmax(0,65%)]"
        : "flex h-full min-h-[500px] rounded-xl border border-border bg-card overflow-hidden"}
      >
        {renderLeftPanel()}
        {renderRightPanel()}
      </div>

      <AddTeamModal
        open={addTeamOpen}
        onClose={() => setAddTeamOpen(false)}
        onCreated={handleCreated}
        organizations={organizations}
        loadedTeams={loadedTeamsForModal}
      />

      {/* ImportMembersModal — only mount when we have an org context */}
      {selectedNode && (() => {
        const importOrgId =
          selectedNode.kind === "organization" ? selectedNode.id :
          selectedNode.kind === "team"         ? selectedNode.orgId :
          /* unassigned */                       selectedNode.orgId;
        const importOrg = organizations.find((o) => o.id === importOrgId);
        return (
          <ImportMembersModal
            open={importMembersOpen}
            onClose={() => setImportMembersOpen(false)}
            onUpdated={async () => {
              if (selectedNode) {
                await loadMembers(selectedNode);
              }
            }}
            orgId={importOrgId}
            orgName={importOrg?.name ?? importOrgId}
          />
        );
      })()}

      {/* AddMemberModal — only mount when we have an org context */}
      {selectedNode && (() => {
        // Resolve orgId + defaultTeamId from the current node
        const modalOrgId =
          selectedNode.kind === "organization" ? selectedNode.id :
          selectedNode.kind === "team"         ? selectedNode.orgId :
          /* unassigned */                       selectedNode.orgId;

        const modalDefaultTeamId =
          selectedNode.kind === "team" ? selectedNode.id : null;

        // Flatten the org's loaded teams for the Team selector
        function flattenForModal(nodes: ApiTeamNode[]): ApiTeamNode[] {
          const result: ApiTeamNode[] = [];
          for (const n of nodes) {
            result.push(n);
            result.push(...flattenForModal(n.children));
          }
          return result;
        }
        const modalTeams = flattenForModal(orgStates[modalOrgId]?.teams ?? []);

        return (
          <AddMemberModal
            open={addMemberOpen}
            onClose={() => setAddMemberOpen(false)}
            onCreated={handleMemberCreated}
            orgId={modalOrgId}
            teams={modalTeams}
            defaultTeamId={modalDefaultTeamId}
            loadingTeams={orgStates[modalOrgId]?.loadingTeams ?? false}
          />
        );
      })()}

      {/* EditTeamModal — only mount when a team is being edited */}
      {editingTeam && (() => {
        const teamsForOrg = orgStates[editingTeam.orgId]?.teams ?? [];
        // Defense in depth: prune self + descendants from the picker. The
        // modal also re-prunes internally.
        const prunedTeams = excludeTeamSubtree(teamsForOrg, editingTeam.id);
        return (
          <EditTeamModal
            open={true}
            onClose={() => setEditingTeam(null)}
            onUpdated={async () => {
              // Refresh the affected org's team tree so the rename/move is visible
              await loadTeams(editingTeam.orgId);
              // If the edited team was selected, its display may have changed
              if (selectedNode && selectedNode.kind === "team" && selectedNode.id === editingTeam.id) {
                // Re-fetch members (no-op for membership change, but cheap and consistent)
                await loadMembers(selectedNode);
              }
            }}
            team={editingTeam}
            teams={prunedTeams}
          />
        );
      })()}

      {/* EditMemberModal — only mount when a member is being edited */}
      {memberBeingEdited && (() => {
        // Flatten the org's loaded teams for the Team selector
        function flattenTeamsForEdit(nodes: ApiTeamNode[]): ApiTeamNode[] {
          const result: ApiTeamNode[] = [];
          for (const n of nodes) {
            result.push(n);
            result.push(...flattenTeamsForEdit(n.children));
          }
          return result;
        }
        const editMemberTeams = flattenTeamsForEdit(
          orgStates[memberBeingEdited.orgId]?.teams ?? []
        );
        return (
          <EditMemberModal
            open={true}
            onClose={() => setMemberBeingEdited(null)}
            onUpdated={async () => {
              // Refresh the right pane so the updated member details are visible
              if (selectedNode) {
                await loadMembers(selectedNode);
              }
            }}
            member={memberBeingEdited}
            teams={editMemberTeams}
          />
        );
      })()}

      {/* EditOrganizationModal — only mount when an org is being edited */}
      {orgBeingEdited && (
        <EditOrganizationModal
          open={true}
          onClose={() => setOrgBeingEdited(null)}
          onUpdated={async () => {
            // Close the modal BEFORE fetching so a second edit cannot fire
            // onUpdated again while the fetch is in flight (race-safe ordering).
            const editedId = orgBeingEdited.id;
            setOrgBeingEdited(null);
            const res = await fetch(`/api/organizations/${editedId}`);
            const json = await res.json();
            if (res.ok && json.success && json.data) {
              const updated = json.data as { id: string; name: string; externalId: string | null };
              setOrganizations((prev) =>
                prev.map((o) =>
                  o.id === updated.id
                    ? { ...o, name: updated.name, externalId: updated.externalId }
                    : o
                )
              );
            }
          }}
          organization={orgBeingEdited}
        />
      )}
    </>
  );
}
