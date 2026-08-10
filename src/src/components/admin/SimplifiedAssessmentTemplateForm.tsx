"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

import { WelcomeScreenCard, type WelcomeFieldErrors } from "@/components/admin/template-editor/WelcomeScreenCard";
import {
  GENERIC_INVITED_WELCOME_CONFIG,
  invitedWelcomeAuthoringInputSchema,
  type InvitedWelcomeAuthoringInputV1,
} from "@/lib/assessments/invited-welcome-config";
import { generateTemplateInternalId } from "@/lib/assessments/template-internal-id";

const NAME_ERROR_ID = "template-assessment-name-error";
const INTERNAL_ID_ERROR_ID = "template-internal-id-error";

function initialWelcomeValues(): InvitedWelcomeAuthoringInputV1 {
  return {
    eyebrow: GENERIC_INVITED_WELCOME_CONFIG.eyebrow,
    headingTemplate: GENERIC_INVITED_WELCOME_CONFIG.headingTemplate,
    ledeParagraphs: [...GENERIC_INVITED_WELCOME_CONFIG.ledeParagraphs],
    sharingHeading: GENERIC_INVITED_WELCOME_CONFIG.sharingHeading,
    scoresHeading: GENERIC_INVITED_WELCOME_CONFIG.scoresHeading,
    scoresDescription: GENERIC_INVITED_WELCOME_CONFIG.scoresDescription,
    ctaLabel: GENERIC_INVITED_WELCOME_CONFIG.ctaLabel,
  };
}

export function SimplifiedAssessmentTemplateForm({
  welcomeAuthoringEnabled = false,
}: {
  welcomeAuthoringEnabled?: boolean;
}) {
  const router = useRouter();
  const internalIdRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [internalId, setInternalId] = useState("");
  const [internalIdEdited, setInternalIdEdited] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState("");
  const [internalIdError, setInternalIdError] = useState("");
  const [formError, setFormError] = useState("");
  const [welcomeValues, setWelcomeValues] = useState(initialWelcomeValues);
  const [welcomeExpanded, setWelcomeExpanded] = useState(false);
  const [welcomeErrors, setWelcomeErrors] = useState<WelcomeFieldErrors>({});
  const [welcomeFocusField, setWelcomeFocusField] = useState<
    keyof InvitedWelcomeAuthoringInputV1 | null
  >(null);

  const generatedInternalId = generateTemplateInternalId(name);
  const displayedInternalId = internalIdEdited
    ? internalId
    : generatedInternalId;

  function focusInternalId() {
    requestAnimationFrame(() => internalIdRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    setNameError("");
    setInternalIdError("");
    setFormError("");

    if (!trimmedName) {
      setNameError("Enter an assessment name.");
      return;
    }

    if (!internalIdEdited && !generatedInternalId) {
      setAdvancedOpen(true);
      setInternalIdError("Enter an Internal ID.");
      focusInternalId();
      return;
    }

    if (
      internalIdEdited &&
      (!internalId || !/^[a-z0-9][a-z0-9-]*$/.test(internalId))
    ) {
      setAdvancedOpen(true);
      setInternalIdError(
        "Use lowercase letters, numbers, and hyphens for the Internal ID.",
      );
      focusInternalId();
      return;
    }

    let invitedWelcomeDefault: InvitedWelcomeAuthoringInputV1 | undefined;
    if (welcomeAuthoringEnabled) {
      const parsedWelcome = invitedWelcomeAuthoringInputSchema.safeParse(
        welcomeValues,
      );
      if (!parsedWelcome.success) {
        const errors: WelcomeFieldErrors = {};
        let firstInvalidField: keyof InvitedWelcomeAuthoringInputV1 | null = null;
        for (const issue of parsedWelcome.error.issues) {
          const key = issue.path[0] as
            | keyof InvitedWelcomeAuthoringInputV1
            | undefined;
          if (!key) continue;
          if (errors[key] === undefined) errors[key] = issue.message;
          if (!firstInvalidField) firstInvalidField = key;
        }
        setWelcomeErrors(errors);
        setWelcomeExpanded(true);
        setWelcomeFocusField(firstInvalidField);
        return;
      }
      invitedWelcomeDefault = parsedWelcome.data;
    }

    const payload: {
      creationMode: "simplified";
      name: string;
      internalId?: string;
      invitedWelcomeDefault?: InvitedWelcomeAuthoringInputV1;
    } = {
      creationMode: "simplified",
      name: trimmedName,
      ...(internalIdEdited ? { internalId } : {}),
      ...(invitedWelcomeDefault ? { invitedWelcomeDefault } : {}),
    };

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/assessment-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));

      if (response.status === 409) {
        setAdvancedOpen(true);
        setInternalIdError(
          "That Internal ID is already in use. Choose another one.",
        );
        focusInternalId();
        return;
      }

      if (!response.ok) {
        setFormError(
          response.status === 429
            ? "Too many attempts. Wait a moment and try again."
            : "We couldn't create this assessment. Try again.",
        );
        return;
      }

      const data = body?.data;
      if (typeof data?.id !== "string" || typeof data?.versionId !== "string") {
        setFormError("We couldn't create this assessment. Try again.");
        return;
      }

      router.push(
        `/admin/assessments/templates/${data.id}/versions/${data.versionId}/edit?tab=questions`,
      );
    } catch {
      setFormError("We couldn't create this assessment. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      <div>
        <label
          className="mb-1 block text-sm font-medium text-foreground"
          htmlFor="template-assessment-name"
        >
          Assessment name
        </label>
        <input
          id="template-assessment-name"
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameError("");
            if (!internalIdEdited) setInternalIdError("");
          }}
          required
          maxLength={200}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? NAME_ERROR_ID : undefined}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        {nameError && (
          <p id={NAME_ERROR_ID} className="mt-1 text-sm text-destructive" role="alert">
            {nameError}
          </p>
        )}
      </div>

      {welcomeAuthoringEnabled ? (
        <WelcomeScreenCard
          values={welcomeValues}
          finePrint={null}
          questions={[]}
          sections={[]}
          isReadOnly={false}
          errors={welcomeErrors}
          expanded={welcomeExpanded}
          onExpandedChange={setWelcomeExpanded}
          focusField={welcomeFocusField}
          onChange={(patch) => {
            setWelcomeValues((values) => ({ ...values, ...patch }));
            const [field] = Object.keys(patch) as Array<
              keyof InvitedWelcomeAuthoringInputV1
            >;
            if (field) {
              setWelcomeErrors((errors) => ({ ...errors, [field]: undefined }));
            }
            setWelcomeFocusField(null);
          }}
        />
      ) : null}

      <div>
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls="template-creation-advanced"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Advanced
        </button>
        {advancedOpen && (
          <div id="template-creation-advanced" className="mt-4">
            <label
              className="mb-1 block text-sm font-medium text-foreground"
              htmlFor="template-internal-id"
            >
              Internal ID
            </label>
            <input
              ref={internalIdRef}
              id="template-internal-id"
              type="text"
              value={displayedInternalId}
              maxLength={80}
              aria-invalid={Boolean(internalIdError)}
              aria-describedby={
                internalIdError ? INTERNAL_ID_ERROR_ID : undefined
              }
              onChange={(event) => {
                setInternalIdEdited(true);
                setInternalId(event.target.value);
                setInternalIdError("");
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            {internalIdError && (
              <p
                id={INTERNAL_ID_ERROR_ID}
                className="mt-1 text-sm text-destructive"
                role="alert"
              >
                {internalIdError}
              </p>
            )}
          </div>
        )}
      </div>

      {formError && (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Link
          href="/admin/assessments/templates"
          className="text-sm font-medium text-foreground hover:underline"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Create and start building
        </button>
      </div>
    </form>
  );
}
