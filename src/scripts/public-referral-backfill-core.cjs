"use strict";

const MAX_MAPPING_ROWS = 1_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;

function normalizedEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizedId(value, field, index) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!ID_PATTERN.test(id)) {
    throw new Error(`Mapping row ${index + 1} has an invalid ${field}`);
  }
  return id;
}

function parseReviewedMappings(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Mapping file must be a non-empty JSON array");
  }
  if (value.length > MAX_MAPPING_ROWS) {
    throw new Error(`Mapping file exceeds ${MAX_MAPPING_ROWS} rows`);
  }

  const seenSubmissions = new Set();
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Mapping row ${index + 1} must be an object`);
    }
    const submissionId = normalizedId(
      row.submissionId,
      "submissionId",
      index,
    );
    const coachId = normalizedId(row.coachId, "coachId", index);
    if (seenSubmissions.has(submissionId)) {
      throw new Error(
        `Duplicate or conflicting submissionId in mapping: ${submissionId}`,
      );
    }
    seenSubmissions.add(submissionId);
    return { submissionId, coachId };
  });
}

function uniqueById(values, entityName) {
  const byId = new Map();
  for (const value of values) {
    if (!value || typeof value.id !== "string" || byId.has(value.id)) {
      throw new Error(`Invalid or duplicate ${entityName} query result`);
    }
    byId.set(value.id, value);
  }
  return byId;
}

function referralEvidence(submission) {
  const rows = Array.isArray(submission.outboxEmails)
    ? submission.outboxEmails.filter(
        (row) => row?.recipientRole === "REFERRING_COACH",
      )
    : [];
  if (rows.length !== 1) {
    throw new Error(
      `Submission ${submission.id} has no unique REFERRING_COACH outbox evidence`,
    );
  }

  const storedReferralEmail = normalizedEmail(
    submission.referringCoachEmail,
  );
  const outboxRecipientEmail = normalizedEmail(rows[0].recipientEmail);
  if (
    !storedReferralEmail ||
    !outboxRecipientEmail ||
    storedReferralEmail !== outboxRecipientEmail
  ) {
    throw new Error(
      `Submission ${submission.id} email evidence conflicts`,
    );
  }
  return { storedReferralEmail, outboxRecipientEmail };
}

function validateReviewedMappings(value, submissions, coaches) {
  const mappings = parseReviewedMappings(value);
  const submissionsById = uniqueById(submissions, "submission");
  const coachesById = uniqueById(coaches, "Coach");

  return mappings.map(({ submissionId, coachId }) => {
    const submission = submissionsById.get(submissionId);
    if (!submission) {
      throw new Error(`Submission does not exist: ${submissionId}`);
    }
    const coach = coachesById.get(coachId);
    if (!coach) {
      throw new Error(`Coach does not exist: ${coachId}`);
    }
    if (submission.campaign?.accessMode !== "PUBLIC") {
      throw new Error(`Submission is not PUBLIC: ${submissionId}`);
    }

    referralEvidence(submission);

    if (
      submission.referringCoachId !== null &&
      submission.referringCoachId !== coachId
    ) {
      throw new Error(
        `Submission ${submissionId} has a conflicting existing owner`,
      );
    }

    return {
      submissionId,
      coachId,
      action:
        submission.referringCoachId === coachId
          ? "already-applied"
          : "update",
    };
  });
}

async function applyReviewedMappings(db, value, bulkApplyNullOwners) {
  if (
    !db ||
    typeof db.$transaction !== "function" ||
    typeof bulkApplyNullOwners !== "function"
  ) {
    throw new Error("Backfill apply dependencies are invalid");
  }

  const mappings = parseReviewedMappings(value);
  const submissionIds = mappings.map((row) => row.submissionId);
  const coachIds = [...new Set(mappings.map((row) => row.coachId))];

  return db.$transaction(
    async (tx) => {
      const submissions = await tx.assessmentSubmission.findMany({
        where: { id: { in: submissionIds } },
        select: {
          id: true,
          referringCoachId: true,
          referringCoachEmail: true,
          campaign: {
            select: {
              accessMode: true,
            },
          },
          outboxEmails: {
            where: { recipientRole: "REFERRING_COACH" },
            select: {
              recipientRole: true,
              recipientEmail: true,
            },
          },
        },
      });
      const coaches = await tx.coach.findMany({
        where: { id: { in: coachIds } },
        select: { id: true },
      });
      const plan = validateReviewedMappings(
        mappings,
        submissions,
        coaches,
      );
      const updates = plan
        .filter((row) => row.action === "update")
        .map(({ submissionId, coachId }) => ({ submissionId, coachId }));

      if (updates.length > 0) {
        const updated = Number(
          await bulkApplyNullOwners(tx, updates),
        );
        if (updated !== updates.length) {
          throw new Error(
            `Ownership compare-and-set conflict: expected ${updates.length} updates, wrote ${updated}`,
          );
        }
      }

      return {
        reviewed: plan.length,
        updated: updates.length,
        alreadyApplied: plan.length - updates.length,
      };
    },
    {
      // The write is one bulk CAS round trip. This explicit ceiling covers the
      // two validation reads plus up to 1,000 VALUES rows without leaving a
      // transaction open indefinitely during a database incident.
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}

function candidateExclusion(submissionId, reason) {
  return { submissionId, reason };
}

function buildReviewCandidates(submissions, coaches) {
  const coachesByEmail = new Map();
  for (const coach of coaches) {
    const email = normalizedEmail(coach?.email);
    if (!email) continue;
    const matches = coachesByEmail.get(email) ?? [];
    matches.push(coach);
    coachesByEmail.set(email, matches);
  }

  const candidates = [];
  const excluded = [];
  for (const submission of submissions) {
    if (submission?.campaign?.accessMode !== "PUBLIC") {
      excluded.push(
        candidateExclusion(submission?.id ?? "", "NOT_PUBLIC"),
      );
      continue;
    }
    if (submission.referringCoachId !== null) {
      excluded.push(
        candidateExclusion(submission.id, "ALREADY_OWNED"),
      );
      continue;
    }

    let evidence;
    try {
      evidence = referralEvidence(submission);
    } catch (error) {
      const reason =
        error instanceof Error && /email evidence conflicts/i.test(error.message)
          ? "EMAIL_EVIDENCE_CONFLICT"
          : "MISSING_OUTBOX_EVIDENCE";
      excluded.push(candidateExclusion(submission.id, reason));
      continue;
    }

    const matchingCoaches =
      coachesByEmail.get(evidence.outboxRecipientEmail) ?? [];
    if (matchingCoaches.length === 0) {
      excluded.push(candidateExclusion(submission.id, "COACH_NOT_FOUND"));
      continue;
    }
    if (matchingCoaches.length !== 1) {
      excluded.push(candidateExclusion(submission.id, "COACH_AMBIGUOUS"));
      continue;
    }

    const coach = matchingCoaches[0];
    const coachName =
      `${String(coach.firstName ?? "").trim()} ${String(coach.lastName ?? "").trim()}`.trim() ||
      evidence.outboxRecipientEmail;
    candidates.push({
      submissionId: submission.id,
      submittedAt:
        submission.submittedAt instanceof Date
          ? submission.submittedAt.toISOString()
          : String(submission.submittedAt ?? ""),
      campaign: {
        id: submission.campaign.id,
        name: submission.campaign.name ?? null,
        templateName: submission.campaign.template?.name ?? null,
      },
      storedReferralEmail: evidence.storedReferralEmail,
      outboxRecipientEmail: evidence.outboxRecipientEmail,
      candidateCoach: {
        id: coach.id,
        name: coachName,
        email: normalizedEmail(coach.email),
      },
      reviewStatus: "REQUIRES_HUMAN_CONFIRMATION",
    });
  }

  return { candidates, excluded };
}

module.exports = {
  MAX_MAPPING_ROWS,
  applyReviewedMappings,
  buildReviewCandidates,
  normalizedEmail,
  parseReviewedMappings,
  validateReviewedMappings,
};
