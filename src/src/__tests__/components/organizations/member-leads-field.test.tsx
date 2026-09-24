import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemberLeadsField } from "@/components/organizations/member-leads-field";
import { scopeForAuthorityMode } from "@/lib/members/entitlement";

const teams = [
  {
    id: "sales",
    organizationId: "org-1",
    parentTeamId: null,
    name: "Sales",
    type: "department",
    description: null,
    children: [
      {
        id: "sdr",
        organizationId: "org-1",
        parentTeamId: "sales",
        name: "SDR Pod",
        type: "team",
        description: null,
        children: [],
      },
    ],
  },
  {
    id: "exec",
    organizationId: "org-1",
    parentTeamId: null,
    name: "Exec Team",
    type: "team",
    description: null,
    children: [],
  },
];

const members = [
  { id: "self", teamId: "exec", roleType: "teamleader", firstName: "Taylor", lastName: "Morgan" },
  { id: "peer", teamId: "exec", roleType: "teamleader", firstName: "Casey", lastName: "Reed" },
  { id: "seller", teamId: "sales", roleType: "employee", firstName: "Avery", lastName: "Chen" },
  { id: "sdr", teamId: "sdr", roleType: "employee", firstName: "Jordan", lastName: "Patel" },
  { id: "ceo", teamId: "sales", roleType: "ceofounder", firstName: "Riley", lastName: "Stone" },
];

function renderField(overrides: Partial<React.ComponentProps<typeof MemberLeadsField>> = {}) {
  const onChange = jest.fn();
  const onConfirm = jest.fn();
  const result = render(
    <MemberLeadsField
      roleType="teamleader"
      memberId="self"
      memberFirstName="Taylor"
      teams={teams}
      organizationMembers={members}
      selectedTeamIds={[]}
      assignments={[]}
      onChange={onChange}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { ...result, onChange, onConfirm };
}

describe("MemberLeadsField", () => {
  it("disables authority for levels that cannot lead", () => {
    renderField({ roleType: "employee" });

    expect(screen.getByRole("button", { name: /choose led teams/i })).toBeDisabled();
    expect(screen.getByText(/only a leadership team member can lead a team/i)).toBeInTheDocument();
  });

  it("treats a leader with no led teams as a valid own-reports-only state", () => {
    renderField();

    expect(screen.getByText(/Taylor will see only their own reports/i)).toBeInTheDocument();
  });

  it("shows the exact scopeFor count and warns only for leadership peers", async () => {
    renderField({ selectedTeamIds: ["sales", "exec"] });

    const authoritativeScope = await scopeForAuthorityMode(
      { respondentId: "self", organizationId: "org-1", teamId: "exec", roleType: "teamleader" },
      {
        respondentsForOrganization: async () => members.map((member) => ({
          respondentId: member.id,
          organizationId: "org-1",
          teamId: member.teamId,
          roleType: member.roleType,
          deletedAt: null,
          organizationDeletedAt: null,
        })),
        teamsForOrganization: async () => [
          { teamId: "sales", organizationId: "org-1", parentTeamId: null, deletedAt: null },
          { teamId: "sdr", organizationId: "org-1", parentTeamId: "sales", deletedAt: null },
          { teamId: "exec", organizationId: "org-1", parentTeamId: null, deletedAt: null },
        ],
        ledTeamIdsForRespondent: async () => ["sales", "exec"],
      },
      "led-teams",
    );

    expect(authoritativeScope.size).toBe(4);
    expect(screen.getByText(new RegExp(`Can read reports for ${authoritativeScope.size} people`, "i"))).toBeInTheDocument();
    expect(screen.getByText(/contains 1 other Leadership team member/i)).toBeInTheDocument();
    expect(screen.getByText(/Casey Reed/)).toBeInTheDocument();
    expect(screen.queryByText(/Riley Stone/)).not.toBeInTheDocument();
  });

  it("marks inferred assignments and offers explicit confirm and remove actions", () => {
    const { onChange, onConfirm } = renderField({
      selectedTeamIds: ["exec"],
      assignments: [
        {
          teamId: "exec",
          teamName: "Exec Team",
          source: "backfill-0040",
          createdBy: "SYSTEM",
          createdAt: "2026-09-23T00:00:00.000Z",
        },
      ],
    });

    expect(screen.getByText(/inferred from their team/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm exec team/i }));
    expect(onConfirm).toHaveBeenCalledWith("exec");
    fireEvent.click(screen.getByRole("button", { name: /remove inferred exec team/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
