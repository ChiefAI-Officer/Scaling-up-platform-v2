/**
 * Esperto historical import — END-TO-END integration test (plan 12a step 10).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §5–§6, §19, §23.
 *
 * Drives the FULL pipeline on the sanitized fixtures with a STATEFUL in-memory
 * mock tx that records created rows in arrays and honors them on re-read:
 *
 *   ROSTER:  parseEspertoExport(members.json)
 *            → buildRosterImportPlan (no existing org/respondents)
 *            → commitRosterImport(statefulDb, …)
 *            ⇒ 1 org + 3 respondents created, each dedupeSource "external",
 *              externalId === its memberid.
 *
 *   RESULTS: parseEspertoExport(report-qsp-v2.json)
 *            → buildResultsImportPlan(LOCKED qspV2Crosswalk, targetOrg, roster)
 *            → commitResultsImport(statefulDb, …)
 *            ⇒ 1 CLOSED campaign (externalId esperto:BDvhuDORxZ), 3 participants,
 *              3 SUBMITTED invitations, 3 submissions (each result a ScoreResult).
 *
 *   IDEMPOTENCY: a SECOND results commit against the same stateful store is a
 *            no-op — no new submissions, no duplicate campaign (create-only
 *            re-import: campaign reused, submissions skipped).
 *
 *   NO-EMAIL: a structural assertion — the two commit module SOURCES import no
 *            email/notifications sender (read via fs; the import is the send
 *            surface, and there is none).
 *
 * The version used for scoring is the REAL QSP v2 content (buildQspV2Content),
 * so scoreSubmission runs for real and every submission carries a genuine
 * ScoreResult (not a stub).
 */

import { readFileSync } from "fs";
import path from "path";

import members from "./fixtures/members.json";
import reportQspV2 from "./fixtures/report-qsp-v2.json";

import { parseEspertoExport } from "../../../../lib/assessments/esperto-import/parse";
import { buildRosterImportPlan } from "../../../../lib/assessments/esperto-import/roster-plan";
import { commitRosterImport } from "../../../../lib/assessments/esperto-import/commit";
import { buildResultsImportPlan } from "../../../../lib/assessments/esperto-import/results-plan";
import { commitResultsImport } from "../../../../lib/assessments/esperto-import/results-commit";
import { qspV2Crosswalk } from "../../../../lib/assessments/esperto-import/crosswalks/qsp-v2";
import type {
  EspertoMembers,
  EspertoReport,
} from "../../../../lib/assessments/esperto-import/types";
import { buildQspV2Content } from "../../../../../prisma/seed-qsp-v2-assessment";

const actor = { userId: "admin-1", email: "admin@example.com" };

// ────────────────────────────────────────────────────────────────────────
// Stateful in-memory tx store
// ────────────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  ownerCoachId: string;
  deletedAt: null;
}
interface RespRow {
  id: string;
  organizationId: string;
  email: string;
  normalizedEmail: string | null;
  externalId: string | null;
  roleType: string | null;
  dedupeSource: string;
  dedupeValue: string | null;
  deletedAt: null;
  [k: string]: unknown;
}
interface CampaignRow {
  id: string;
  externalId: string | null;
  alias: string;
  organizationId: string;
  templateId: string;
  status: string;
  accessMode: string;
  [k: string]: unknown;
}
interface ParticipantRow {
  id: string;
  campaignId: string;
  respondentId: string;
  isCEO: boolean;
  [k: string]: unknown;
}
interface InvitationRow {
  id: string;
  campaignId: string;
  respondentId: string;
  status: string;
  [k: string]: unknown;
}
interface SubmissionRow {
  id: string;
  campaignId: string;
  respondentId: string;
  invitationId: string;
  result: unknown;
  [k: string]: unknown;
}
interface AuditRow {
  id: string;
  entityType: string;
  [k: string]: unknown;
}

/** A simple in-memory store whose delegates honor previously-created rows. */
function makeStatefulStore() {
  const orgs: OrgRow[] = [];
  const respondents: RespRow[] = [];
  const campaigns: CampaignRow[] = [];
  const participants: ParticipantRow[] = [];
  const invitations: InvitationRow[] = [];
  const submissions: SubmissionRow[] = [];
  const audits: AuditRow[] = [];
  let seq = 0;
  const id = (p: string) => `${p}-${seq++}`;

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),

    organization: {
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { ownerCoachId: string; name: string; deletedAt: null };
        }) =>
          Promise.resolve(
            orgs.find(
              (o) =>
                o.ownerCoachId === where.ownerCoachId &&
                o.name === where.name &&
                o.deletedAt === null,
            ) ?? null,
          ),
      ),
      create: jest.fn(
        ({ data }: { data: { name: string; ownerCoachId: string } }) => {
          const row: OrgRow = {
            id: id("org"),
            name: data.name,
            ownerCoachId: data.ownerCoachId,
            deletedAt: null,
          };
          orgs.push(row);
          return Promise.resolve({ id: row.id });
        },
      ),
    },

    orgRespondent: {
      findMany: jest.fn((args: { where: Record<string, unknown> }) => {
        const where = args.where as Record<string, unknown>;
        // Roster path: { organizationId, deletedAt:null }.
        if (typeof where.organizationId === "string") {
          return Promise.resolve(
            respondents
              .filter(
                (r) =>
                  r.organizationId === where.organizationId &&
                  r.deletedAt === null,
              )
              .map((r) => ({
                id: r.id,
                externalId: r.externalId,
                normalizedEmail: r.normalizedEmail,
              })),
          );
        }
        // Results path: { id: { in: [...] } } selecting id + roleType.
        const inSpec = where.id as { in: string[] } | undefined;
        if (inSpec && Array.isArray(inSpec.in)) {
          return Promise.resolve(
            respondents
              .filter((r) => inSpec.in.includes(r.id))
              .map((r) => ({ id: r.id, roleType: r.roleType })),
          );
        }
        return Promise.resolve([]);
      }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row: RespRow = {
          id: id("resp"),
          organizationId: data.organizationId as string,
          email: data.email as string,
          normalizedEmail: (data.normalizedEmail as string) ?? null,
          externalId: (data.externalId as string) ?? null,
          roleType: (data.roleType as string) ?? null,
          dedupeSource: data.dedupeSource as string,
          dedupeValue: (data.dedupeValue as string) ?? null,
          deletedAt: null,
          ...data,
        };
        respondents.push(row);
        return Promise.resolve({ id: row.id });
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { externalId: string };
        }) => {
          const row = respondents.find((r) => r.id === where.id);
          if (row) row.externalId = data.externalId;
          return Promise.resolve({ id: where.id });
        },
      ),
    },

    assessmentCampaign: {
      findUnique: jest.fn(
        ({ where }: { where: { externalId: string } }) =>
          Promise.resolve(
            campaigns.find((c) => c.externalId === where.externalId) ?? null,
          ),
      ),
      findFirst: jest.fn(
        ({ where }: { where: { alias: string } }) =>
          Promise.resolve(
            campaigns.find((c) => c.alias === where.alias)
              ? { id: campaigns.find((c) => c.alias === where.alias)!.id }
              : null,
          ),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row: CampaignRow = {
          id: id("camp"),
          externalId: (data.externalId as string) ?? null,
          alias: data.alias as string,
          organizationId: data.organizationId as string,
          templateId: data.templateId as string,
          status: data.status as string,
          accessMode: data.accessMode as string,
          ...data,
        };
        campaigns.push(row);
        return Promise.resolve({ id: row.id });
      }),
    },

    assessmentCampaignParticipant: {
      upsert: jest.fn(
        ({
          where,
          create,
        }: {
          where: {
            campaignId_respondentId: { campaignId: string; respondentId: string };
          };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const { campaignId, respondentId } = where.campaignId_respondentId;
          const existing = participants.find(
            (p) => p.campaignId === campaignId && p.respondentId === respondentId,
          );
          if (existing) return Promise.resolve({ id: existing.id });
          const row: ParticipantRow = {
            id: id("part"),
            campaignId,
            respondentId,
            isCEO: Boolean(create.isCEO),
            ...create,
          };
          participants.push(row);
          return Promise.resolve({ id: row.id });
        },
      ),
    },

    assessmentInvitation: {
      upsert: jest.fn(
        ({
          where,
          create,
        }: {
          where: {
            campaignId_respondentId: { campaignId: string; respondentId: string };
          };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
          select: { id: true };
        }) => {
          const { campaignId, respondentId } = where.campaignId_respondentId;
          const existing = invitations.find(
            (i) => i.campaignId === campaignId && i.respondentId === respondentId,
          );
          if (existing) return Promise.resolve({ id: existing.id });
          const row: InvitationRow = {
            id: id("inv"),
            campaignId,
            respondentId,
            status: create.status as string,
            ...create,
          };
          invitations.push(row);
          return Promise.resolve({ id: row.id });
        },
      ),
    },

    assessmentSubmission: {
      findUnique: jest.fn(
        ({ where }: { where: { invitationId: string } }) =>
          Promise.resolve(
            submissions.find((s) => s.invitationId === where.invitationId)
              ? { id: submissions.find((s) => s.invitationId === where.invitationId)!.id }
              : null,
          ),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row: SubmissionRow = {
          id: id("sub"),
          campaignId: data.campaignId as string,
          respondentId: data.respondentId as string,
          invitationId: data.invitationId as string,
          result: data.result,
          ...data,
        };
        submissions.push(row);
        return Promise.resolve({ id: row.id });
      }),
    },

    auditLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row: AuditRow = { id: id("audit"), entityType: data.entityType as string, ...data };
        audits.push(row);
        return Promise.resolve({ id: row.id });
      }),
    },
  };

  const db = {
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };

  return {
    db,
    tx,
    state: { orgs, respondents, campaigns, participants, invitations, submissions, audits },
  };
}

/** ctx for the results commit — uses the REAL QSP v2 version for scoring. */
function makeResultsCtx(organizationId: string, templateId = "tmpl-qsp-v2") {
  const c = buildQspV2Content();
  return {
    templateId,
    versionId: "ver-1",
    versionForScoring: {
      questions: c.questions,
      sections: c.sections,
      scoringConfig: c.scoringConfig,
    } as never,
    organizationId,
    ownerCoachId: "coach-1",
    language: "enUS",
    createdByUserId: "admin-1",
  };
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("Esperto import — end-to-end on sanitized fixtures", () => {
  it("ROSTER: parse → plan → commit creates 1 org + 3 external respondents", async () => {
    const { db, state } = makeStatefulStore();

    const parsed = parseEspertoExport(members as unknown as EspertoMembers);
    expect(parsed.kind).toBe("members");
    if (parsed.kind !== "members") throw new Error("unreachable");

    const plan = buildRosterImportPlan({
      parsedMembers: parsed.data,
      ownerCoachId: "coach-1",
      companyName: "Acme Corp",
      existing: { orgId: null, respondents: [] },
    });
    // members.json has 3 active, non-test rows → 3 creates, no skips/blocks.
    expect(plan.orgAction).toBe("create");
    expect(plan.creates).toHaveLength(3);
    expect(plan.skips).toHaveLength(0);
    expect(plan.blocks).toHaveLength(0);

    const result = await commitRosterImport(db as never, plan, actor);
    expect(result.orgAction).toBe("create");
    expect(result.created).toBe(3);

    expect(state.orgs).toHaveLength(1);
    expect(state.respondents).toHaveLength(3);

    // Each respondent is dedupeSource "external" with externalId === memberid.
    for (const r of state.respondents) {
      expect(r.dedupeSource).toBe("external");
      expect(r.externalId).toBe(r.dedupeValue);
      expect(typeof r.externalId).toBe("string");
    }
    const extIds = state.respondents.map((r) => r.externalId).sort();
    expect(extIds).toEqual(["CVMmsiWPTP", "MxRWB1GIwu", "mWSw2H9f6E"].sort());

    // Exactly one audit row for the roster import.
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0].entityType).toBe("EspertoRosterImport");
  });

  it("RESULTS: parse → plan → commit creates 1 CLOSED campaign with 3 SUBMITTED invitations + 3 scored submissions", async () => {
    const { db, state } = makeStatefulStore();

    // Seed the roster first (same store) so externalIds resolve.
    const membersParsed = parseEspertoExport(members as unknown as EspertoMembers);
    if (membersParsed.kind !== "members") throw new Error("unreachable");
    const rosterPlan = buildRosterImportPlan({
      parsedMembers: membersParsed.data,
      ownerCoachId: "coach-1",
      companyName: "Acme Corp",
      existing: { orgId: null, respondents: [] },
    });
    await commitRosterImport(db as never, rosterPlan, actor);
    const orgId = state.orgs[0].id;
    const roster = state.respondents.map((r) => ({
      id: r.id,
      externalId: r.externalId,
    }));

    // Results plan against the LOCKED crosswalk + the seeded roster.
    const reportParsed = parseEspertoExport(reportQspV2 as unknown as EspertoReport);
    expect(reportParsed.kind).toBe("report");
    if (reportParsed.kind !== "report") throw new Error("unreachable");

    const resultsPlan = buildResultsImportPlan({
      parsedReport: reportParsed.data,
      crosswalk: { ...qspV2Crosswalk, locked: true },
      targetOrgId: orgId,
      respondents: roster,
    });
    expect(resultsPlan.blocks).toHaveLength(0);
    expect(resultsPlan.campaigns).toHaveLength(1);
    expect(resultsPlan.campaigns[0].externalId).toBe("esperto:BDvhuDORxZ");
    expect(resultsPlan.campaigns[0].rows).toHaveLength(3);
    expect(resultsPlan.skips).toHaveLength(0);

    const ctx = makeResultsCtx(orgId);
    const result = await commitResultsImport(db as never, resultsPlan, ctx, actor);

    // One campaign created, CLOSED, with the namespaced externalId.
    expect(state.campaigns).toHaveLength(1);
    expect(state.campaigns[0].status).toBe("CLOSED");
    expect(state.campaigns[0].accessMode).toBe("INVITED");
    expect(state.campaigns[0].externalId).toBe("esperto:BDvhuDORxZ");
    expect(result.campaigns[0].campaignAction).toBe("create");

    // 3 participants, 3 invitations (all SUBMITTED), 3 submissions.
    expect(state.participants).toHaveLength(3);
    expect(state.invitations).toHaveLength(3);
    for (const inv of state.invitations) {
      expect(inv.status).toBe("SUBMITTED");
    }
    expect(state.submissions).toHaveLength(3);
    // Each submission carries a real ScoreResult object (not a stub primitive).
    for (const sub of state.submissions) {
      expect(sub.result).toBeTruthy();
      expect(typeof sub.result).toBe("object");
      // QSP v2 is aggregation-only → a single resolved tier label "Submitted".
      const res = sub.result as { tier?: { label?: string } };
      expect(res.tier?.label).toBe("Submitted");
    }

    expect(result.campaigns[0].participantsCreated).toBe(3);
    expect(result.campaigns[0].invitationsCreated).toBe(3);
    expect(result.campaigns[0].submissionsCreated).toBe(3);
  });

  it("IDEMPOTENCY: a SECOND results commit against the same store is a no-op (no new submissions, no duplicate campaign)", async () => {
    const { db, state } = makeStatefulStore();

    // Roster.
    const membersParsed = parseEspertoExport(members as unknown as EspertoMembers);
    if (membersParsed.kind !== "members") throw new Error("unreachable");
    await commitRosterImport(
      db as never,
      buildRosterImportPlan({
        parsedMembers: membersParsed.data,
        ownerCoachId: "coach-1",
        companyName: "Acme Corp",
        existing: { orgId: null, respondents: [] },
      }),
      actor,
    );
    const orgId = state.orgs[0].id;
    const roster = state.respondents.map((r) => ({ id: r.id, externalId: r.externalId }));

    const reportParsed = parseEspertoExport(reportQspV2 as unknown as EspertoReport);
    if (reportParsed.kind !== "report") throw new Error("unreachable");
    const resultsPlan = buildResultsImportPlan({
      parsedReport: reportParsed.data,
      crosswalk: { ...qspV2Crosswalk, locked: true },
      targetOrgId: orgId,
      respondents: roster,
    });
    const ctx = makeResultsCtx(orgId);

    // First commit — establishes the campaign + chain.
    const first = await commitResultsImport(db as never, resultsPlan, ctx, actor);
    expect(first.campaigns[0].campaignAction).toBe("create");
    expect(first.campaigns[0].submissionsCreated).toBe(3);
    expect(state.campaigns).toHaveLength(1);
    expect(state.submissions).toHaveLength(3);

    // Second commit — same store, everything already exists.
    const second = await commitResultsImport(db as never, resultsPlan, ctx, actor);
    expect(second.campaigns[0].campaignAction).toBe("reuse");
    expect(second.campaigns[0].submissionsCreated).toBe(0);
    expect(second.campaigns[0].submissionsSkipped).toBe(3);

    // No duplication in the store.
    expect(state.campaigns).toHaveLength(1);
    expect(state.participants).toHaveLength(3);
    expect(state.invitations).toHaveLength(3);
    expect(state.submissions).toHaveLength(3);
  });
});

describe("Esperto import — NO email-send dependency (structural)", () => {
  const importDir = path.resolve(
    __dirname,
    "../../../../lib/assessments/esperto-import",
  );

  const FORBIDDEN_IMPORT_SUBSTRINGS = [
    "sendAssessmentInvitationEmail",
    "email-sender",
    "services/notifications",
    "../../services/notifications",
    "smtp-transport",
  ];

  it.each(["commit.ts", "results-commit.ts"])(
    "the writer source %s imports no email/notifications sender",
    (file) => {
      const source = readFileSync(path.join(importDir, file), "utf8");
      for (const needle of FORBIDDEN_IMPORT_SUBSTRINGS) {
        expect(source).not.toContain(needle);
      }
    },
  );
});
