import {
  invitedWelcomeConfigSchema,
  resolveLegacyInvitedWelcomeConfig,
  type InvitedWelcomeConfig,
} from "./invited-welcome-config";

interface InvitedWelcomeSnapshotTx {
  assessmentTemplate: {
    findUnique(args: {
      where: { id: string };
      select: { alias: true; invitedWelcomeDefault: true };
    }): Promise<{
      alias: string;
      invitedWelcomeDefault: unknown;
    } | null>;
  };
}

function fresh(config: InvitedWelcomeConfig): InvitedWelcomeConfig {
  return { ...config, ledeParagraphs: [...config.ledeParagraphs] };
}

/**
 * Resolve the Welcome copy at campaign-creation time through the same
 * transaction client that inserts the campaign. Callers persist the returned
 * value as an immutable campaign snapshot.
 */
export async function loadInvitedWelcomeSnapshot(
  tx: InvitedWelcomeSnapshotTx,
  templateId: string,
): Promise<InvitedWelcomeConfig> {
  const template = await tx.assessmentTemplate.findUnique({
    where: { id: templateId },
    select: { alias: true, invitedWelcomeDefault: true },
  });
  if (!template) {
    throw new Error(`Assessment template ${templateId} not found`);
  }
  const parsed = invitedWelcomeConfigSchema.safeParse(
    template.invitedWelcomeDefault,
  );
  return parsed.success
    ? fresh(parsed.data)
    : resolveLegacyInvitedWelcomeConfig(template.alias);
}
