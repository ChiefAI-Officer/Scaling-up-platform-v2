import path from "node:path";

import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { ScalingCeoFullSnapshot } from "../canonical";

Font.registerHyphenationCallback((word) => [word]);

export const SCALING_CEO_FULL_RENDERER_VERSION = "scaling-ceo-full-pdf-v1";

const COLOR = {
  purple: "#6d58a8",
  blue: "#3aa3d9",
  orange: "#f2a900",
  dark: "#25212b",
  muted: "#6f6977",
  palePurple: "#f2eff8",
  paleBlue: "#eaf6fb",
  border: "#ded9e7",
  white: "#ffffff",
} as const;

const LOCAL_LOGO = path.join(
  process.cwd(),
  "public",
  "brand",
  "su-logo-white.png",
);

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingRight: 36,
    paddingBottom: 54,
    paddingLeft: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLOR.dark,
    backgroundColor: COLOR.white,
  },
  cover: {
    paddingTop: 36,
    paddingRight: 36,
    paddingBottom: 54,
    paddingLeft: 36,
    fontFamily: "Helvetica",
    color: COLOR.white,
    backgroundColor: COLOR.purple,
  },
  coverStripe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: COLOR.orange,
  },
  logo: { width: 180, height: 24, objectFit: "contain" },
  coverCoach: { marginTop: 8, fontSize: 9, color: "#e9e4f4" },
  coverRule: {
    width: 70,
    height: 5,
    marginTop: 132,
    marginBottom: 22,
    backgroundColor: COLOR.blue,
  },
  coverKind: {
    fontSize: 11,
    color: "#e9e4f4",
  },
  coverTitle: {
    maxWidth: 450,
    marginTop: 14,
    fontFamily: "Helvetica-Bold",
    fontSize: 38,
    lineHeight: 1.08,
  },
  coverMeta: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 96,
    borderTopWidth: 1,
    borderTopColor: "#8e7bb9",
    paddingTop: 18,
  },
  coverFor: { fontFamily: "Helvetica-Bold", fontSize: 15 },
  coverDate: { marginTop: 7, fontSize: 10, color: "#e9e4f4" },
  provenance: {
    marginBottom: 18,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLOR.blue,
    backgroundColor: COLOR.paleBlue,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  provenanceColumn: { width: "48%" },
  eyebrow: {
    marginBottom: 3,
    fontSize: 6.8,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: COLOR.muted,
  },
  provenanceValue: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  section: { marginBottom: 18 },
  sectionHeading: {
    marginBottom: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 17,
    color: COLOR.purple,
  },
  sectionIntro: { marginBottom: 10, fontSize: 8.5, color: COLOR.muted },
  table: {
    width: "100%",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderColor: COLOR.border,
  },
  tableHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLOR.palePurple,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.purple,
  },
  tableRow: {
    minHeight: 23,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
  },
  tableCell: {
    height: "100%",
    paddingTop: 6,
    paddingRight: 6,
    paddingBottom: 6,
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: COLOR.border,
  },
  tableHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.2,
    color: COLOR.purple,
  },
  labelCell: { width: "40%" },
  numberCell: { width: "20%", textAlign: "right" },
  peerLabelCell: { width: "36%" },
  peerNumberCell: { width: "16%", textAlign: "right" },
  muted: { color: COLOR.muted },
  ceoValue: { fontFamily: "Helvetica-Bold", color: COLOR.purple },
  scoreCards: { flexDirection: "row", marginTop: 4 },
  scoreCard: {
    width: "24%",
    minHeight: 74,
    marginRight: "1.33%",
    padding: 10,
    borderTopWidth: 4,
    borderTopColor: COLOR.blue,
    backgroundColor: COLOR.paleBlue,
  },
  scoreCardLast: { marginRight: 0 },
  scoreLabel: {
    minHeight: 20,
    fontSize: 6.8,
    lineHeight: 1.2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLOR.muted,
  },
  scoreValue: {
    marginTop: 7,
    fontFamily: "Helvetica-Bold",
    fontSize: 23,
    color: COLOR.dark,
  },
  scoreValueUnavailable: { fontSize: 14 },
  scoreValuePurple: { color: COLOR.purple },
  tier: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingTop: 5,
    paddingRight: 10,
    paddingBottom: 5,
    paddingLeft: 10,
    borderRadius: 12,
    backgroundColor: COLOR.orange,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLOR.dark,
  },
  questionHeader: {
    minHeight: 27,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLOR.purple,
  },
  questionRow: {
    minHeight: 31,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderLeftWidth: 1,
    borderColor: COLOR.border,
  },
  questionLabel: { width: "52%", padding: 6 },
  questionScore: { width: "24%", padding: 5 },
  questionHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.2,
    color: COLOR.white,
  },
  barTrack: {
    height: 8,
    marginTop: 3,
    borderRadius: 2,
    backgroundColor: "#ece9f1",
  },
  ceoBar: { height: 8, borderRadius: 2, backgroundColor: COLOR.purple },
  teamBar: { height: 8, borderRadius: 2, backgroundColor: COLOR.blue },
  barValue: { fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  appendixIntro: {
    marginBottom: 10,
    padding: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLOR.orange,
    backgroundColor: "#fff8e7",
    color: COLOR.muted,
  },
  footer: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 20,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: COLOR.border,
    fontSize: 7,
    textAlign: "right",
    color: COLOR.muted,
  },
  coverFooter: { borderTopColor: "#8e7bb9", color: "#e9e4f4" },
});

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Not available";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function formatGap(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Not available";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? "+" : ""}${rounded}`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function footerText(snapshot: ScalingCeoFullSnapshot): string {
  return `${snapshot.destination.campaignName} | ${SCALING_CEO_FULL_RENDERER_VERSION}`;
}

function Footer({
  snapshot,
  cover = false,
  pageKey,
}: {
  snapshot: ScalingCeoFullSnapshot;
  cover?: boolean;
  pageKey: string;
}) {
  return (
    <Text
      key={pageKey}
      style={[styles.footer, cover ? styles.coverFooter : {}]}
      fixed
      render={({ pageNumber, totalPages }) =>
        `${footerText(snapshot)} | Page ${pageNumber} / ${totalPages}`
      }
    />
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <Text style={styles.sectionHeading} minPresenceAhead={70}>
      {children}
    </Text>
  );
}

interface ComparisonRow {
  key: string;
  label: string;
  ceo: number | null;
  teamAvg: number | null;
  dev: number | null;
}

function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <View style={styles.table}>
      <View key="header" style={styles.tableHeader}>
        <View key="area" style={[styles.tableCell, styles.labelCell]}>
          <Text style={styles.tableHeaderText}>Area</Text>
        </View>
        <View key="ceo" style={[styles.tableCell, styles.numberCell]}>
          <Text style={styles.tableHeaderText}>CEO</Text>
        </View>
        <View key="team" style={[styles.tableCell, styles.numberCell]}>
          <Text style={styles.tableHeaderText}>Team avg</Text>
        </View>
        <View key="gap" style={[styles.tableCell, styles.numberCell]}>
          <Text style={styles.tableHeaderText}>Gap</Text>
        </View>
      </View>
      {rows.map((row) => (
        <View key={row.key} style={styles.tableRow} wrap={false}>
          <View key="area" style={[styles.tableCell, styles.labelCell]}>
            <Text>{row.label}</Text>
          </View>
          <View key="ceo" style={[styles.tableCell, styles.numberCell]}>
            <Text style={styles.ceoValue}>{formatNumber(row.ceo)}</Text>
          </View>
          <View key="team" style={[styles.tableCell, styles.numberCell]}>
            <Text style={row.teamAvg == null ? styles.muted : {}}>
              {formatNumber(row.teamAvg)}
            </Text>
          </View>
          <View key="gap" style={[styles.tableCell, styles.numberCell]}>
            <Text style={row.dev == null ? styles.muted : {}}>
              {formatGap(row.dev)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

interface PeerRow {
  key: string;
  label: string;
  ceo: number | null;
  teamAvg: number | null;
  peers?: number | null;
  devPeers?: number | null;
}

function PeerTable({ rows }: { rows: PeerRow[] }) {
  return (
    <View style={styles.table}>
      <View key="header" style={styles.tableHeader}>
        <View key="area" style={[styles.tableCell, styles.peerLabelCell]}>
          <Text style={styles.tableHeaderText}>Area</Text>
        </View>
        <View key="ceo" style={[styles.tableCell, styles.peerNumberCell]}>
          <Text style={styles.tableHeaderText}>CEO</Text>
        </View>
        <View key="team" style={[styles.tableCell, styles.peerNumberCell]}>
          <Text style={styles.tableHeaderText}>Team</Text>
        </View>
        <View key="peers" style={[styles.tableCell, styles.peerNumberCell]}>
          <Text style={styles.tableHeaderText}>Peers</Text>
        </View>
        <View key="gap" style={[styles.tableCell, styles.peerNumberCell]}>
          <Text style={styles.tableHeaderText}>CEO vs peers</Text>
        </View>
      </View>
      {rows.map((row) => (
        <View key={row.key} style={styles.tableRow} wrap={false}>
          <View key="area" style={[styles.tableCell, styles.peerLabelCell]}>
            <Text>{row.label}</Text>
          </View>
          <View key="ceo" style={[styles.tableCell, styles.peerNumberCell]}>
            <Text style={styles.ceoValue}>{formatNumber(row.ceo)}</Text>
          </View>
          <View key="team" style={[styles.tableCell, styles.peerNumberCell]}>
            <Text style={row.teamAvg == null ? styles.muted : {}}>
              {formatNumber(row.teamAvg)}
            </Text>
          </View>
          <View key="peers" style={[styles.tableCell, styles.peerNumberCell]}>
            <Text>{formatNumber(row.peers)}</Text>
          </View>
          <View key="gap" style={[styles.tableCell, styles.peerNumberCell]}>
            <Text>{formatGap(row.devPeers)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function ScoreBar({
  value,
  variant,
}: {
  value: number | null;
  variant: "ceo" | "team";
}) {
  if (value == null || !Number.isFinite(value)) {
    return <Text style={[styles.barValue, styles.muted]}>Not available</Text>;
  }
  return (
    <View>
      <Text style={styles.barValue}>{formatNumber(value)}</Text>
      <View style={styles.barTrack}>
        <View
          style={[
            variant === "ceo" ? styles.ceoBar : styles.teamBar,
            { width: `${Math.max(2, Math.min(100, value * 10))}%` },
          ]}
        />
      </View>
    </View>
  );
}

function ScalingCeoFullDocument({
  snapshot,
}: {
  snapshot: ScalingCeoFullSnapshot;
}) {
  const scored = snapshot.reportModel.scored;
  if (!scored)
    throw new Error("Scaling CEO Full requires a scored report model");

  const ceoSource = snapshot.sources.find((source) => source.role === "CEO");
  const ceoName = ceoSource?.respondent.displayName ?? "CEO";
  const teamCount = snapshot.sources.filter(
    (source) => source.role === "TEAM",
  ).length;
  const sectionRows: ComparisonRow[] = scored.sections.map((row) => ({
    key: row.stableKey,
    label: row.name,
    ceo: row.ceo,
    teamAvg: row.teamAvg,
    dev: row.dev,
  }));
  const domainRows: ComparisonRow[] = (scored.domains ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    ceo: row.ceo,
    teamAvg: row.teamAvg,
    dev: row.dev,
  }));
  const peerRows: PeerRow[] = [
    ...scored.sections.map((row) => ({
      key: `section:${row.stableKey}`,
      label: row.name,
      ceo: row.ceo,
      teamAvg: row.teamAvg,
      peers: row.peers,
      devPeers: row.devPeers,
    })),
    ...(scored.domains ?? []).map((row) => ({
      key: `domain:${row.key}`,
      label: row.label,
      ceo: row.ceo,
      teamAvg: row.teamAvg,
      peers: row.peers,
      devPeers: row.devPeers,
    })),
  ].filter((row) => row.peers != null && Number.isFinite(row.peers));
  const questionPages = chunkRows(scored.questions, 17);
  const createdAt = new Date(snapshot.createdAt);

  return (
    <Document
      title={`Scaling Up Group Report - ${snapshot.destination.campaignName}`}
      author="Scaling Up Platform"
      subject="Scaling CEO Full summary report"
      creator={SCALING_CEO_FULL_RENDERER_VERSION}
      producer="Scaling Up Platform"
      language={snapshot.destination.language}
      creationDate={createdAt}
      modificationDate={createdAt}
    >
      <Page size="A4" orientation="portrait" style={styles.cover}>
        <View style={styles.coverStripe} />
        {/* React-PDF ImageProps does not expose the HTML alt attribute. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={LOCAL_LOGO} style={styles.logo} />
        {snapshot.provenance.coachName ? (
          <Text style={styles.coverCoach}>
            Coached by {snapshot.provenance.coachName}
          </Text>
        ) : null}
        <View style={styles.coverRule} />
        <Text style={styles.coverKind}>Group Report</Text>
        <Text style={styles.coverTitle}>
          Your Scaling Up Full Assessment Report
        </Text>
        <View style={styles.coverMeta}>
          <Text style={styles.coverFor}>
            For {snapshot.destination.organizationName} | Leadership Team
          </Text>
          <Text style={styles.coverDate}>{formatDate(snapshot.createdAt)}</Text>
        </View>
        <Footer snapshot={snapshot} pageKey="cover" cover />
      </Page>

      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.provenance}>
          <View style={styles.provenanceColumn}>
            <Text style={styles.eyebrow}>CEO source</Text>
            <Text style={styles.provenanceValue}>{ceoName}</Text>
            <Text style={[styles.eyebrow, { marginTop: 9 }]}>Campaign</Text>
            <Text style={styles.provenanceValue}>
              {snapshot.destination.campaignName}
            </Text>
          </View>
          <View style={styles.provenanceColumn}>
            <Text style={styles.eyebrow}>Frozen at</Text>
            <Text style={styles.provenanceValue}>
              {formatDate(snapshot.createdAt)}
            </Text>
            <Text style={[styles.eyebrow, { marginTop: 9 }]}>Composition</Text>
            <Text style={styles.provenanceValue}>1 CEO | {teamCount} Team</Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading>Alignment Profile</SectionHeading>
          <Text style={styles.sectionIntro}>
            CEO vs Team average (excludes CEO). A missing Team cohort is shown
            as Not available; no Team value is inferred from the CEO.
          </Text>
          <ComparisonTable rows={sectionRows} />
        </View>

        {scored.domains && scored.domains.length > 0 ? (
          <View style={styles.section}>
            <SectionHeading>CEO vs Team by Domain</SectionHeading>
            <Text style={styles.sectionIntro}>
              Domain scores use the frozen creation-time model. Team average
              excludes the selected CEO source.
            </Text>
            <ComparisonTable rows={domainRows} />
          </View>
        ) : null}
        <Footer snapshot={snapshot} pageKey="alignment" />
      </Page>

      <Page size="A4" orientation="portrait" style={styles.page}>
        {peerRows.length > 0 ? (
          <View style={styles.section}>
            <SectionHeading>Peer Comparison</SectionHeading>
            <Text style={styles.sectionIntro}>
              Peer values are the benchmark set frozen into this report. They
              are not recalculated when the artifact is viewed.
            </Text>
            <PeerTable rows={peerRows} />
          </View>
        ) : null}

        {scored.scaleUpScore ? (
          <View style={styles.section}>
            <SectionHeading>ScaleUp Score</SectionHeading>
            <View style={styles.scoreCards} wrap={false}>
              <View style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>CEO</Text>
                <Text style={[styles.scoreValue, styles.scoreValuePurple]}>
                  {formatNumber(scored.scaleUpScore.ceo)}
                </Text>
              </View>
              <View style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>Team avg (excludes CEO)</Text>
                <Text
                  style={[
                    styles.scoreValue,
                    scored.scaleUpScore.teamAvg == null
                      ? styles.scoreValueUnavailable
                      : {},
                  ]}
                  wrap={false}
                >
                  {formatNumber(scored.scaleUpScore.teamAvg)}
                </Text>
              </View>
              <View style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>Peers</Text>
                <Text style={styles.scoreValue}>
                  {formatNumber(scored.scaleUpScore.peers)}
                </Text>
              </View>
              <View style={[styles.scoreCard, styles.scoreCardLast]}>
                <Text style={styles.scoreLabel}>CEO vs peers</Text>
                <Text style={styles.scoreValue}>
                  {formatGap(scored.scaleUpScore.devPeers)}
                </Text>
              </View>
            </View>
            {scored.tier.ceo ? (
              <Text style={styles.tier}>CEO tier: {scored.tier.ceo}</Text>
            ) : null}
          </View>
        ) : null}
        <Footer snapshot={snapshot} pageKey="peer-score" />
      </Page>

      {questionPages.map((questions, pageIndex) => (
        <Page
          key={`question-detail:${pageIndex}`}
          size="A4"
          orientation="portrait"
          style={styles.page}
        >
          <View style={styles.section}>
            <SectionHeading>
              {pageIndex === 0
                ? "Question Detail"
                : "Question Detail (continued)"}
            </SectionHeading>
            {pageIndex === 0 ? (
              <Text style={styles.sectionIntro}>
                Every question shows the frozen CEO score and the selected Team
                average excluding the CEO. Team 0 remains Not available.
              </Text>
            ) : null}
            <View key="header" style={styles.questionHeader}>
              <View style={styles.questionLabel}>
                <Text style={styles.questionHeaderText}>Question</Text>
              </View>
              <View style={styles.questionScore}>
                <Text style={styles.questionHeaderText}>CEO</Text>
              </View>
              <View style={styles.questionScore}>
                <Text style={styles.questionHeaderText}>Team avg</Text>
              </View>
            </View>
            {questions.map((question) => (
              <View
                key={question.stableKey}
                style={styles.questionRow}
                wrap={false}
              >
                <View style={styles.questionLabel}>
                  <Text>{question.label}</Text>
                </View>
                <View style={styles.questionScore}>
                  <ScoreBar value={question.ceo} variant="ceo" />
                </View>
                <View style={styles.questionScore}>
                  <ScoreBar value={question.teamMean} variant="team" />
                </View>
              </View>
            ))}
          </View>
          <Footer
            snapshot={snapshot}
            pageKey={`question-detail:${pageIndex}`}
          />
        </Page>
      ))}

      <Page size="A4" orientation="portrait" style={styles.page}>
        <Footer snapshot={snapshot} pageKey="appendix-b" />
        <View style={styles.section}>
          <SectionHeading>
            Appendix B - Team Members (Anonymized)
          </SectionHeading>
          <Text style={styles.appendixIntro}>
            Individual Team identities are intentionally omitted. Non-CEO rows
            use deterministic Person labels in selected source order.
          </Text>
          <View style={styles.table}>
            <View key="header" style={styles.tableHeader}>
              <View style={[styles.tableCell, styles.labelCell]}>
                <Text style={styles.tableHeaderText}>Member</Text>
              </View>
              {(["People", "Strategy", "Execution", "Cash"] as const).map(
                (label) => (
                  <View
                    key={label}
                    style={[styles.tableCell, styles.numberCell]}
                  >
                    <Text style={styles.tableHeaderText}>{label}</Text>
                  </View>
                ),
              )}
            </View>
            {(scored.appendixB ?? []).map((row) => (
              <View key={row.personLabel} style={styles.tableRow} wrap={false}>
                <View style={[styles.tableCell, styles.labelCell]}>
                  <Text>{row.personLabel}</Text>
                </View>
                {(["people", "strategy", "execution", "cash"] as const).map(
                  (key) => (
                    <View
                      key={key}
                      style={[styles.tableCell, styles.numberCell]}
                    >
                      <Text>{formatNumber(row.domainScores[key])}</Text>
                    </View>
                  ),
                )}
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

export { ScalingCeoFullDocument };
