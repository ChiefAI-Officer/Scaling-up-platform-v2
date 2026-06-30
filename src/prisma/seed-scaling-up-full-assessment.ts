/**
 * Seed: Scaling Up Full Assessment Template (v1)
 *
 * Creates an AssessmentTemplate (alias "scaling-up-full") plus its first
 * AssessmentTemplateVersion (language "enUS") with 5 domains, 10 sections,
 * and 61 SLIDER_LIKERT questions (0-10 scale), each with a full 5-stop
 * recommendation set (score stops 0/3/5/7/10 — harvested verbatim from
 * Esperto uniform-fill sample reports with all five stops filled).
 *
 * D2.2 deliverable — built on top of D2.1's engine extensions:
 *   - `scoringConfig.rollup.overall = "meanOfDomains"` (canonical rollup)
 *   - `scoringConfig.scaleUpScore = true` (emits the 0-100 ScaleUp Score)
 *   - Per-question `recommendations[]` resolved by the scoring engine to
 *     a per-question `recommendation` string in ScoreResult
 *   - Per-domain tiers (placeholder thresholds pending Jeff's confirmation)
 *
 * Hard rule (Codex round 2 #4): seed creates the version as DRAFT
 * (`publishedAt: null`). Operators MUST verify content + tier thresholds
 * via the admin editor before clicking Publish — the strict publish schema
 * runs at that point.
 *
 * Idempotency / safety model (6 explicit states):
 *   A — nothing found:            create template + v1 atomically.
 *   B — exact match (hash same):  no-op; log idempotent success and return.
 *   C — mismatch (hash differs):  THROW with a friendly message before the
 *                                 immutability trigger blocks us.
 *   D — half-baked heal:          template exists but v1 missing -> create v1.
 *   E — orphan:                   v1 exists without a template -> THROW.
 *   F — duplicate v1 rows:        defensive paranoia -> THROW.
 *
 * Concurrency: wrapped in a single Prisma interactive transaction whose
 * first statement acquires
 *   pg_advisory_xact_lock(hashtext('assessment-scaling-up-full-v1-seed'))
 *
 * Run: npx tsx prisma/seed-scaling-up-full-assessment.ts
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import {
  ensureTemplateVersionContent,
  type SeedContent,
} from "../src/lib/assessments/seed-template-version";

const db = new PrismaClient();

// ─── Constants ───────────────────────────────────────────────────────────

export const ALIAS = "scaling-up-full";
export const NAME = "Scaling Up Full Assessment";
// v2 (Wave J-1): adds a CEO-only "About your company" background section with
// three NUMBER FTE/freelance questions (non-scored) that feed the mid-survey
// growth-phase tile. The helper appends this as a NEW DRAFT v2 (superseding the
// unpublished DRAFT v1 via forceSupersedeDraft); nothing publishes on seed.
export const VERSION_NUMBER = 2;
export const LANGUAGE = "enUS";

const TEMPLATE_DESCRIPTION =
  "61-question assessment across People, Strategy, Execution, Cash, and You domains. " +
  "Emits a per-domain score plus a 0-100 ScaleUp Score. " +
  "Question content derived from the Scaling Up methodology by Verne Harnish.";

const ADVISORY_LOCK_KEY = "assessment-scaling-up-full-v1-seed";

const INVITATION_SUBJECT =
  "You're invited to take the {{templateName}} survey for {{organizationName}}";

const INVITATION_BODY_MARKDOWN = `Hi {{respondentFirstName}},

{{organizationName}} invited you to complete the {{templateName}}. This 61-question assessment takes about 10 minutes. Your responses help your team identify strengths and growth opportunities across People, Strategy, Execution, Cash, and You.

Click the link below to begin:

{{invitationUrl}}

Your coach will review the results with you afterward.`;

// ─── Tier definitions ────────────────────────────────────────────────────
//
// GLOBAL tiers resolve against the 0-10 rollup value (meanOfDomains).
// Cutoffs are PROVISIONAL — confirmed bands from Esperto sample reports:
//   score 3/19/28 (of 100) → "Not ready" (≤28 confirmed LOW)
//   score 47/62   (of 100) → "On the way" (47-62 confirmed GOOD)
//   score 73/107  (of 100) → "Exemplary"  (≥73 confirmed TOP)
// Dividing by 10 for the 0-10 rollup:
//   cutoff LOW→GOOD lies in (2.8, 4.7] — interpolated as 4.0 (provisional)
//   cutoff GOOD→TOP lies in (6.2, 7.3] — interpolated as 6.5 (provisional)
// Band messages are VERBATIM from the Esperto-rendered sample PDFs.
// Tier boundaries use fractional touching semantics (b.minMetric === a.maxMetric).
const TIERS = [
  {
    minMetric: 0,
    maxMetric: 4.0,
    label: "Not ready",
    message:
      "You have still a lot of focus areas on which you can work within your company. If you want to grow quickly, then your organization is probably not ready yet.",
  },
  {
    minMetric: 4.0,
    maxMetric: 6.5,
    label: "On the way",
    message:
      "A great score. You are pretty well on the way to becoming a strong growth organization.",
  },
  {
    minMetric: 6.5,
    maxMetric: 10,
    label: "Exemplary",
    message:
      "You are doing extremely well and are perhaps an example for others! However, in order to reach the next phase, there is still room for improvement.",
  },
] as const;

// Per-domain tier — single NEUTRAL tier covering the full 0-10 domain.
// Per-domain cutoffs are NOT confirmed in any source file; a single neutral
// tier ensures no fabricated thresholds appear in the admin editor.
// Admins may refine these via the editor UI once Esperto's weighting spec
// is available.
const NEUTRAL_DOMAIN_TIER = [
  { minMetric: 0, maxMetric: 10, label: "—", message: "" },
] as const;

// Keep DOMAIN_TIERS as an alias so any downstream code that references it
// still compiles. The neutral single-tier replaces the old per-domain
// Critical/At Risk/On Track/Strong fabricated tiers.
const DOMAIN_TIERS = NEUTRAL_DOMAIN_TIER;

// ─── Section + domain structure ──────────────────────────────────────────
//
// Mirrors the Scaling Up Full PDF report's TOC:
//   People    -> Your Employees + Company Culture
//   Strategy  -> (flat)
//   Execution -> Leadership Team + Operational Processes + Sales & Marketing + Scalability/Innovation/Technology
//   Cash      -> (flat)
//   You       -> Your Leadership + Internal Communication

interface SectionDef {
  stableKey: string;
  sortOrder: number;
  name: string;
  description: string;
  domain: string;
}

const SECTIONS: SectionDef[] = [
  // Background section (Wave J-1) — CEO-only "About your company" block.
  // Hosts the NON-SCORED NUMBER FTE/freelance questions that drive the
  // mid-survey growth-phase tile (Task B gates CEO-only visibility; this seed
  // only DEFINES the questions). sortOrder 0 places it before "Your Employees"
  // (sortOrder 1). It carries domain "people" purely to satisfy the
  // meanOfDomains publish-time requirement that every section has a domain —
  // it contributes ZERO to scoring because it holds no SLIDER_LIKERT questions
  // (domain/section/ScaleUp rollups only sum SLIDER_LIKERT answers).
  {
    stableKey: "S_BACKGROUND",
    sortOrder: 0,
    name: "About your company",
    description:
      "A few quick numbers about your company. These help us place your company's growth phase — they are not scored.",
    domain: "people",
  },
  // People domain
  {
    stableKey: "S_PEOPLE_YE",
    sortOrder: 1,
    name: "Your Employees",
    description:
      "Recruitment, retention, onboarding, training, and structural choices around how you employ and develop people.",
    domain: "people",
  },
  {
    stableKey: "S_PEOPLE_CC",
    sortOrder: 2,
    name: "Company Culture",
    description:
      "Core values, customer focus, transparency, and the day-to-day health of how your team works together.",
    domain: "people",
  },
  // Strategy domain
  {
    stableKey: "S_STRATEGY",
    sortOrder: 3,
    name: "Strategy",
    description:
      "Long-term goals, annual and quarterly objectives, strategic plan, growth methodology, and acquisitions posture.",
    domain: "strategy",
  },
  // Execution domain
  {
    stableKey: "S_EXEC_LT",
    sortOrder: 4,
    name: "Leadership Team",
    description:
      "How the leadership team is structured, meets, learns together, and divides accountability.",
    domain: "execution",
  },
  {
    stableKey: "S_EXEC_OP",
    sortOrder: 5,
    name: "Operational Processes",
    description:
      "KPIs, real-time data, defect prevention, customer satisfaction measurement, and continuous improvement.",
    domain: "execution",
  },
  {
    stableKey: "S_EXEC_SM",
    sortOrder: 6,
    name: "Sales and Marketing",
    description:
      "Lead generation, sales targets, weekly cadence, sales leadership, and PR/communication strategy.",
    domain: "execution",
  },
  {
    stableKey: "S_EXEC_SIT",
    sortOrder: 7,
    name: "Scalability, Innovation and Technology",
    description:
      "Automation, system readiness for growth, competitive technology posture, and innovation/disruption stance.",
    domain: "execution",
  },
  // Cash domain
  {
    stableKey: "S_CASH",
    sortOrder: 8,
    name: "Cash",
    description:
      "Real-time financial visibility, cash flow planning, growth capital access, early-warning systems, and balance-sheet literacy.",
    domain: "cash",
  },
  // You domain
  {
    stableKey: "S_YOU_LEAD",
    sortOrder: 9,
    name: "Your Leadership",
    description:
      "Personal effectiveness as CEO: time spent on the business, mentorship, network, energy, education, and wellbeing.",
    domain: "you",
  },
  {
    stableKey: "S_YOU_IC",
    sortOrder: 10,
    name: "Internal Communication",
    description:
      "How well employees understand the company's long-term goals, annual goals, vision, mission, and elevator pitch.",
    domain: "you",
  },
];

const DOMAINS = [
  { key: "people", label: "People", tiers: DOMAIN_TIERS },
  { key: "strategy", label: "Strategy", tiers: DOMAIN_TIERS },
  { key: "execution", label: "Execution", tiers: DOMAIN_TIERS },
  { key: "cash", label: "Cash", tiers: DOMAIN_TIERS },
  { key: "you", label: "You", tiers: DOMAIN_TIERS },
] as const;

const SCORING_CONFIG = {
  // Legacy tierMetric retained for BC; superseded by rollup.overall for the
  // global tier resolution.
  tierMetric: "overallAvg",
  // passThreshold: 0 — no hard pass/fail threshold for this assessment;
  // the three global tiers (Not ready / On the way / Exemplary) carry the
  // full interpretive weight.
  passThreshold: 0,
  tiers: TIERS,
  rollup: { overall: "meanOfDomains" },
  scaleUpScore: true,
  domains: DOMAINS,
} as const;

// Auto-generated from matrix.xlsx + sample PDF narrative extraction.
// Source: From Jeff/APP_scaling up assessemnt/other samples/
// Extraction date: 2026-05-19
// 61 questions, full 5-stop (0/3/5/7/10) narrative coverage

interface QuestionSeedDef {
  label: string;
  section: string;
  /** Score stop 0 (worst): maps to band [0, 2] */
  s0: string;
  /** Score stop 3: maps to band [3, 4] */
  s3: string;
  /** Score stop 5: maps to band [5, 6] */
  s5: string;
  /** Score stop 7: maps to band [7, 9] */
  s7: string;
  /** Score stop 10 (best): maps to band [10, 10] */
  s10: string;
}

const QUESTION_DEFS: QuestionSeedDef[] = [
  {
    label: "Effective recruitment process",
    section: "S_PEOPLE_YE",
    s0: "In order to grow, you continuously need new - and good - people. This is often one of the most important challenges for a growth entrepreneur. You indicate that when it comes to finding new employees you find this very difficult. Ultimately, this is a matter of process, attention and time, often especially on the part of the entrepreneur. How much time do you spend on this? More than one day per week?",
    s3: "In order to grow, you continuously need new - and good - people. This is often one of the most important challenges for a growth entrepreneur. You indicate that when it comes to finding new employees you find this very difficult. Ultimately, this is a matter of process, attention and time, often especially on the part of the entrepreneur. How much time do you spend on this? More than one day per week?",
    s5: "In order to grow, you continuously need new - and good - people. This is often one of the most important challenges for a growth entrepreneur. You indicate that when it comes to finding new employees you find this difficult. Ultimately, this is a matter of process, attention and time, often especially on the part of the entrepreneur. How much time do you spend on this? More than one day per week?",
    s7: "In order to grow, you continuously need new - and good - people. This is often one of the most important challenges for a growth entrepreneur. You indicate that when it comes to finding new employees you have this reasonably well under control. That's great. This probably has to do with the time and attention you give this and your network. Try to keep this up when you continue to grow.",
    s10: "In order to grow, you continuously need new - and good - people. This is often one of the most important challenges for a growth entrepreneur. You indicate that when it comes to finding new employees you are very successful. That's great! This probably has to do with the time and attention you give this and your network. Try to keep this up when you continue to grow.",
  },
  {
    label: "High staff retention",
    section: "S_PEOPLE_YE",
    s0: "Your employee turnover is high. Unwanted turnover is often a sign that processes, strategy or management are not in order. It takes an enormous amount of money and effort to continually find and train new employees. Find out what the reasons are, hold exit interviews and ask yourself whether you yourself would want to work at your company.",
    s3: "Your employee turnover is high. Unwanted turnover is often a sign that processes, strategy or management are not in order. It takes an enormous amount of money and effort to continually find and train new employees. Find out what the reasons are, hold exit interviews and ask yourself whether you yourself would want to work at your company.",
    s5: "Your employee turnover is relatively high. Unwanted turnover is often a sign that processes, strategy or management are not in order. It takes an enormous amount of money and effort to continually find and train new employees. Find out what the reasons are, hold exit interviews and ask yourself whether you yourself would want to work at your company.",
    s7: "Your employee turnover is low. Unwanted turnover is often a sign that processes, strategy or management are not in order. It takes an enormous amount of money and effort to continually find and train new employees. This is hardly a problem for you. That's a good sign. Keep a close eye on this and hold exit interviews with people who leave.",
    s10: "Your employee turnover is very little / none. Unwanted turnover is often a sign that processes, strategy or management are not in order. It takes an enormous amount of money and effort to continually find and train new employees. This is not a problem for you. That's a good sign. Keep a close eye on this when you start or continue to grow.",
  },
  {
    label: "Onboarding program",
    section: "S_PEOPLE_YE",
    s0: "Employees do not receive a comprehensive onboarding program at your company. While this is understandable for a company of your size, a well-thought-out onboarding program will be an enormous help to employees with regard to learning their job, becoming familiar with the company's core values and getting to know their coworkers. It will help enormously with scaling up your company. It might be good to start thinking about this already.",
    s3: "Employees do not receive a comprehensive onboarding program at your company. While this is understandable for a company of your size, a well-thought-out onboarding program will be an enormous help to employees with regard to learning their job, becoming familiar with the company's core values and getting to know their coworkers. It will help enormously with scaling up your company. It might be good to start thinking about this already.",
    s5: "Not all employees receive an onboarding program at your company. That really is necessary with a company of your size. A well-thought-out onboarding program will be an enormous help to employees with regard to learning their jobs, becoming familiar with the company's core values and getting to know their coworkers. It will also help with scaling up your company. We recommend that you start taking steps toward this.",
    s7: "Employees do receive a type of onboarding program at your company. That's good, because a well-thought-out onboarding program will be an enormous help to employees with regard to learning their jobs, becoming familiar with the company's core values and getting to know their coworkers. It will also help with scaling up your company.",
    s10: "Employees receive a comprehensive onboarding program at your company. That's good, because a well-thought-out onboarding program will be an enormous help to employees with regard to learning their jobs, becoming familiar with the company's core values and getting to know their coworkers. It will also help with further scaling up your company. So keep it up.",
  },
  {
    label: "Measuring employee satisfaction",
    section: "S_PEOPLE_YE",
    s0: "You do not yet measure employee satisfaction. That's understandable with a company of your size. You usually know quite well what's going on. This is something for the next phase.",
    s3: "You do not yet measure employee satisfaction. That's understandable with a company of your size. You usually know quite well what's going on. This is something for the next phase.",
    s5: "You don't yet systematically measure employee satisfaction. Your company is in the phase where you need to have a systematic understanding of what's going on among your employees. An employee survey is probably a good start in this respect.",
    s7: "You already measure employee satisfaction. That's remarkable for a relatively small company and a good thing! After all, measuring is knowing.",
    s10: "You already measure employee satisfaction. That's remarkable for a relatively small company and a good thing! After all, measuring is knowing.",
  },
  {
    label: "Positive about re-hiring employees",
    section: "S_PEOPLE_YE",
    s0: "You would hire few or none of your current employees again. Ouch. This means that you have either postponed a lot of difficult decisions or you simply have a very bad hiring policy. You should work on this, because without good employees you can't grow.",
    s3: "You would hire few or none of your current employees again. Ouch. This means that you have either postponed a lot of difficult decisions or you simply have a very bad hiring policy. You should work on this, because without good employees you can't grow.",
    s5: "You would hire few of your current employees again. Ouch. This means that you have either postponed a lot of difficult decisions or you simply have a very bad hiring or development policy. You should work on this, because without good employees you can't grow.",
    s7: "You would not hire all of your current employees again. That's not illogical. Sometimes the company changes so fast and employees cannot continue on. But do you already have a plan? Often you know something like this for a long time but postpone difficult decisions.",
    s10: "You would hire all of your current employees again. Congratulations, that's really great. You have worked on your hiring and development policy. Keep it up!",
  },
  {
    label: "Every employee has a training plan",
    section: "S_PEOPLE_YE",
    s0: "Management thinker Tom Peters stated in his latest book 'one of the greatest responsibilities of an employer nowadays is the continuous development of employees'. In fast growing companies, roles are continuously changing, the need for training and education is therefore imperative. In your phase it is logical that this is not up to par, but you might want to start thinking about it.",
    s3: "Management thinker Tom Peters stated in his latest book 'one of the greatest responsibilities of an employer nowadays is the continuous development of employees'. In fast growing companies, roles are continuously changing, the need for training and education is therefore imperative. In your phase it is logical that this is not up to par, but you might want to start thinking about it.",
    s5: "Management thinker Tom Peters stated in his latest book 'one of the greatest responsibilities of an employer nowadays is the continuous development of employees'. In fast growing companies, roles are continuously changing, the need for training and education is therefore imperative. You have this partially executed. You might want to start thinking about bringing it up to par.",
    s7: "Management thinker Tom Peters stated in his latest book 'one of the greatest responsibilities of an employer nowadays is the continuous development of employees'. In fast growing companies, roles are continuously changing, the need for training and education is therefore imperative. You are already working on this. Well done.",
    s10: "Management thinker Tom Peters stated in his latest book 'one of the greatest responsibilities of an employer nowadays is the continuous development of employees'. In fast growing companies, roles are continuously changing, the need for training and education is therefore imperative. You have already implemented this. Tom would be proud.",
  },
  {
    label: "Outsourcing / Offshoring operations",
    section: "S_PEOPLE_YE",
    s0: "You are not active with offshoring or outsourcing, this strategy is completely depending on your product/service, cost and scaling strategy.",
    s3: "You are not active with offshoring or outsourcing, this strategy is completely depending on your product/service, cost and scaling strategy.",
    s5: "You are somewhat active with offshoring or outsourcing, this strategy is completely depending on your product/service, cost and scaling strategy",
    s7: "You are active with offshoring or outsourcing, this strategy is completely depending on your product/service, cost and scaling strategy.",
    s10: "You are very active with offshoring or outsourcing, this strategy is completely depending on your product/service, cost and scaling strategy.",
  },
  {
    label: "We apply flat-management or self-steering/organizing teams",
    section: "S_PEOPLE_YE",
    s0: "You have not implemented new management models, when things work for you, don't change.",
    s3: "You have not implemented new management models, when things work for you, don't change.",
    s5: "You have somewhat implemented new management models. With your company size it is risky to experiment. Please note that changing management models often has great impact on people and culture. Mostly positive, but not always.",
    s7: "You are active with the implementation of new management models. Interesting, we hope this helps scaling your company better and faster.",
    s10: "You have fully implemented a new management model. Well done, we hope it will help you scale and grow.",
  },
  {
    label: "We have Core values",
    section: "S_PEOPLE_CC",
    s0: "Core values are the internal 'rules of the game'. It's essential to have this very clear if you start growing quickly, but in small organizations it's often not yet necessary to make this explicit.",
    s3: "Core values are the internal 'rules of the game'. It's essential to have this very clear if you start growing quickly, but in small organizations it's often not yet necessary to make this explicit.",
    s5: "Core values are the internal 'rules of the game'. It's essential to have absolute clarity on this if you start or continue to grow rapidly. In your phase it's necessary to have a clearer picture on the core values, especially if you regularly hire new people. You have started on this. Finish, refine and communicate, is what we recommend.",
    s7: "Core values are the internal 'rules of the game'. It's essential to have this very clear if you start growing quickly, but in small organizations it's often not yet necessary to make this explicit. But you have certainly come a long way. Try to critically examine the core values on a regular basis. A lot always changes in a small organization.",
    s10: "Core values are the internal 'rules of the game'. It's essential to have this very clear if you start growing quickly, but in small organizations it's often not yet necessary to make this explicit. But at least you are clear on this. Try to critically examine the core values on a regular basis. A lot always changes in a small organization.",
  },
  {
    label: "We have focus on customers' needs",
    section: "S_PEOPLE_CC",
    s0: "Growth often creates increased management attention to internal matters, employees, new premises, computer systems, etc. The most rapidly growing and successful companies keep a sharp focus on the continuously (changing) needs of the customer. Making and keeping this focus and attention explicit is important, especially in this phase of your company.",
    s3: "Growth often creates increased management attention to internal matters, employees, new premises, computer systems, etc. The most rapidly growing and successful companies keep a sharp focus on the continuously (changing) needs of the customer. Making and keeping this focus and attention explicit is important, especially in this phase of your company.",
    s5: "Growth often creates increased management attention to internal matters, employees, new premises, computer systems, etc. The most rapidly growing and successful companies keep a sharp focus on the continuously (changing) needs of the customer. Making and keeping this focus and attention explicit is important, especially in this phase of your company.",
    s7: "Growth often creates increased management attention to internal matters, employees, new premises, computer systems, etc. The most rapidly growing and successful companies keep a sharp focus on the continuously (changing) needs of the customer. You have already gotten far; keep it up!",
    s10: "Growth often creates increased management attention to internal matters, employees, new premises, computer systems, etc. The most rapidly growing and successful companies keep a sharp focus on the continuously (changing) needs of the customer. You have that completely under control. Keep it up, even during your next growth phases.",
  },
  {
    label: "Employees know core values",
    section: "S_PEOPLE_CC",
    s0: "You have not formulated any core values. That's less important in your phase. Because of the small team, everyone subconsciously knows what's important. However, if you grow and hire new employees, it will be increasingly important to make this explicitly clear.",
    s3: "You have not formulated any core values. That's less important in your phase. Because of the small team, everyone subconsciously knows what's important. However, if you grow and hire new employees, it will be increasingly important to make this explicitly clear.",
    s5: "You have formulated core values; however, if these are not paid continuous attention - especially when you grow and regularly hire employees - these will not be effective. In your phase, it's really essential to work hard on this. Start with regular communication and create dialogue around these core values.",
    s7: "You have formulated core values, and your employees are reasonably familiar with them. That's very good in your phase. This will be increasingly important as you grow. Therefore, keep these values alive.",
    s10: "You have formulated core values, and your employees know all of them well and act accordingly. That's really a job well done. Keep this very clear when you continue to grow into the next phase.",
  },
  {
    label: "We are transparent",
    section: "S_PEOPLE_CC",
    s0: "Transparency of information (about customers, sales, goals, growth, etc.) produces greater employee involvement. In addition, it often prevents internal \"politics\". It would be beneficial for you to start considering what information you are willing to share.",
    s3: "Transparency of information (about customers, sales, goals, growth, etc.) produces greater employee involvement. In addition, it often prevents internal \"politics\". It would be beneficial for you to start considering what information you are willing to share.",
    s5: "Transparency of information (about customers, sales, goals, growth, etc.) produces greater employee involvement. In addition, it often prevents internal \"politics\". It would be good if you could start thinking about what information you are even more willing to share.",
    s7: "Transparency of information (about customers, sales, goals, growth, etc.) produces greater employee involvement. In addition, it often prevents internal \"politics\". You have already achieved reasonable transparency, which is good. Maybe you can increase this transparency even more by examining what information you want to share.",
    s10: "Transparency of information (about customers, sales, goals, growth, etc.) produces greater employee involvement. In addition, it often prevents internal \"politics\". You are already doing very well in this area. Keep it up!",
  },
  {
    label: "We have a positive and healthy culture",
    section: "S_PEOPLE_CC",
    s0: "\"Culture eats Strategy for breakfast\" is a famous quote from management guru Peter Drucker. The outside world is changing rapidly, but a positive and healthy culture in which employees take responsibility, think along and always act in the interest of the company is therefore an enormous \"asset\". You still have a small company, but it would be good to start working on such a culture already now.",
    s3: "\"Culture eats Strategy for breakfast\" is a famous quote from management guru Peter Drucker. The outside world is changing rapidly, but a positive and healthy culture in which employees take responsibility, think along and always act in the interest of the company is therefore an enormous \"asset\". You still have a small company, but it would be good to start working on such a culture already now.",
    s5: "\"Culture eats Strategy for breakfast\" is a famous quote from management guru Peter Drucker. The outside world is changing rapidly, but a positive and healthy culture in which employees take responsibility, think along and always act in the interest of the company is therefore an enormous \"asset\". Given your size, it is very important that you quickly start working on such a culture even more consciously.",
    s7: "\"Culture eats Strategy for breakfast\" is a famous quote from management guru Peter Drucker. The outside world is changing rapidly, but a positive and healthy culture in which employees take responsibility, think along and always act in the interest of the company is therefore an enormous \"asset\". You still have a small business and you have made a good start with your culture, make sure you stick with it as you grow.",
    s10: "\"Culture eats Strategy for breakfast\" is a famous quote from management guru Peter Drucker. The outside world is changing rapidly, but a positive and healthy culture in which employees take responsibility, think along and always act in the interest of the company is therefore an enormous \"asset\". You still have a small business and you have a strong and healthy culture, make sure you stick to it as you grow further.",
  },
  {
    label: "We have formulated a long term (non-financial) goal",
    section: "S_STRATEGY",
    s0: "You have not yet formulated a clear long-term goal. That's too bad, because a long-term goal provides direction and context and above all motivation for all employees. Companies that do this effectively are at an enormous advantage.",
    s3: "You have not yet formulated a clear long-term goal. That's too bad, because a long-term goal provides direction and context and above all motivation for all employees. Companies that do this effectively are at an enormous advantage.",
    s5: "You have not yet formulated a clear long-term goal, but you have begun to do so. That's great, because a long-term goal provides direction and context and above all motivation for all employees. Companies that do this effectively are at an enormous advantage. Good luck formulating your goal!",
    s7: "You have already come far with the formulation of your long-term goal. That's great, because a long-term goal provides direction and context and above all motivation for all employees. Companies that do this effectively are at an enormous advantage. Good luck formulating your goal.",
    s10: "You have formulated a long-term goal. That's great, because a long-term goal provides direction and context and above all motivation for all employees. Companies that do this effectively are at an enormous advantage. Try keeping this \"alive\" and repeating it as much as possible.",
  },
  {
    label: "We have formulated yearly goals",
    section: "S_STRATEGY",
    s0: "The clearer and more measurably you formulate your goals (both financially and organizationally or with regard to product or market development), the higher the chance that you will also achieve those goals. This will have a clarifying and motivating effect and ensure growth. It's time to get started!",
    s3: "The clearer and more measurably you formulate your goals (both financially and organizationally or with regard to product or market development), the higher the chance that you will also achieve those goals. This will have a clarifying and motivating effect and ensure growth. It's time to get started!",
    s5: "You do not yet formulate clear, measurable annual goals. The clearer and more measurably you formulate your goals (both financially and organizationally or with regard to product or market development), the higher the chance that you will also achieve those goals. This will have a clarifying and motivating effect and ensure growth. Given the size of your company, we recommend that you implement this as soon as possible.",
    s7: "You are already doing a good job of formulating measurable annual goals. That's good news. The clearer and more measurably you formulate your goals (both financially and organizationally or with regard to product or market development), the higher the chance that you will also achieve those goals. This will have a clarifying and motivating effect and ensure growth.",
    s10: "You have the process of measurable annual goals well under control. That's good news. The clearer and more measurably you formulate your goals (both financially and organizationally or with regard to product or market development), the higher the chance that you will also achieve those goals. Keep it up!",
  },
  {
    label: "We have formulated quarterly/ monthly goals (other than financial goals)",
    section: "S_STRATEGY",
    s0: "You have no monthly or quarterly goals. Ouch. Monthly or quarterly goals give you guidance and direction and ensure that you will achieve your annual goals. Think of them as \"small sprints\" that you have to win in order to achieve your annual goal. Fast growers are very disciplined in this process.",
    s3: "You have no monthly or quarterly goals. Ouch. Monthly or quarterly goals give you guidance and direction and ensure that you will achieve your annual goals. Think of them as \"small sprints\" that you have to win in order to achieve your annual goal. Fast growers are very disciplined in this process.",
    s5: "You have started setting measurable monthly or quarterly goals. Given the size of your company, it's important to continue to implement this quickly. After all, monthly or quarterly goals give you guidance and ensure that you will achieve your annual goals. Think of them as \"small sprints\" that you have to win in order to achieve your annual goal. Fast growers are very disciplined in this process.",
    s7: "You have already come far with measurable monthly or quarterly goals. That's great, because monthly or quarterly goals give you guidance and direction and ensure that you will achieve your annual goals. Try making this into a regular process.",
    s10: "You have the process of monthly and quarterly goals entirely under your thumb. That's good, because the fastest growers are very disciplined in this process.",
  },
  {
    label: "We work with a strategic plan",
    section: "S_STRATEGY",
    s0: "You do not yet have a business plan. Maybe this isn't necessary yet in your phase. But establishing your goals, strategy and action plan can bring about a lot of clarity and teach you to anticipate certain challenges. When should you hire someone? What will the marketing strategy be? You have to make many difficult choices; a complete overview and plan will help you with this.",
    s3: "You do not yet have a business plan. Maybe this isn't necessary yet in your phase. But establishing your goals, strategy and action plan can bring about a lot of clarity and teach you to anticipate certain challenges. When should you hire someone? What will the marketing strategy be? You have to make many difficult choices; a complete overview and plan will help you with this.",
    s5: "You have started putting together a business plan. Given the size of your company this seems quite late. Establishing your goals, strategy and action plan can bring about a lot of clarity and teach you to anticipate certain challenges. When should you hire someone? What will the marketing strategy be? You have to make many difficult choices; a complete overview and plan will help you with this, including in the financial aspect.",
    s7: "You have already come far with working with a business plan; that's good. Establishing your goals, strategy and action plan can bring about a lot of clarity and teach you to anticipate certain challenges. When should you hire someone? What will the marketing strategy be? You have to make many difficult choices; a complete overview and plan will help you with this.",
    s10: "You have a well-thought-out business plan and are working with it; that's super! Establishing your goals, strategy and action plan can bring about a lot of clarity and teach you to anticipate certain challenges. That's the right approach to growing!",
  },
  {
    label: "Each employee has personalized goals",
    section: "S_STRATEGY",
    s0: "You haven't started working on personal goals yet. Team goals and personal goals are the next step in working efficiently. This creates clarity, commitment, personal responsibility and motivation. Think about how this would work at your company.",
    s3: "You haven't started working on personal goals yet. Team goals and personal goals are the next step in working efficiently. This creates clarity, commitment, personal responsibility and motivation. Think about how this would work at your company.",
    s5: "You have started working on personal goals; that's good. Team goals and personal goals are the next step in working efficiently. This creates clarity, commitment, personal responsibility and motivation. Good luck working out your personal goals in further detail.",
    s7: "You have already come far with implementing personal goals; that's good. Team goals and personal goals are the next step in working efficiently. This creates clarity, commitment, personal responsibility and motivation. Good luck with your continued implementation.",
    s10: "You have fully and properly implemented goals at the employee level. That's great! You will have noticed that this creates clarity, commitment, personal responsibility and motivation.",
  },
  {
    label: "We have implemented a growth methodology",
    section: "S_STRATEGY",
    s0: "You have not yet implemented a growth methodology. That is logical in the phase that your company is in. However, it's never too early to start thinking about that.",
    s3: "You have not yet implemented a growth methodology. That is logical in the phase that your company is in. However, it's never too early to start thinking about that.",
    s5: "You have somewhat implemented a growth methodology. The larger you grow, the more difficult it is to implement new ways of working. Now would be the time to speed up implementation of the type of leadership, systems and processes that will propel your growth.",
    s7: "You are actively implementing a growth methodology. Good work! This will create a strong foundation for your future scaling up.",
    s10: "You have already fully implemented a growth methodology, that is remarkable for the phase where your company is in. That will create a strong foundation for scaling up. Well done",
  },
  {
    label: "We have an active acquisitions strategy",
    section: "S_STRATEGY",
    s0: "You are not active with acquisitions, that seems logical for the company your size.",
    s3: "You are not active with acquisitions, that seems logical for the company your size.",
    s5: "You are somewhat active with acquisitions or maybe you are considering it. Please understand that acquisitions consume much leadership time and attention. Note that 70% of the acquisitions turns out to be disappointing.",
    s7: "You are active with acquisitions, that seems illogical for the company your size.",
    s10: "It's exceptional and interesting that in a company of your size you are already making acquisitions. Hopefully you are able to absorb and integrate. The largest challenges usually present themselves in different company cultures.",
  },
  {
    label: "Tasks are properly allocated",
    section: "S_EXEC_LT",
    s0: "You do not yet have an efficient leadership team. That's not unusual in your phase. However, for the next growth step you should start thinking about the form and composition of the management. This will help you create more involvement and make the company less dependent on you.",
    s3: "You do not yet have an efficient leadership team. That's not unusual in your phase. However, for the next growth step you should start thinking about the form and composition of the management. This will help you create more involvement and make the company less dependent on you.",
    s5: "You do not yet have an efficient leadership team. That's very problematic in your phase. Decisions must increasingly be discussed, made, accounted for and above all implemented by the group. Now you are doing most of it yourself, which places unjustified pressure on you as an entrepreneur, manager and leader.",
    s7: "You are already doing well with assembling a leadership team. This will help you create more involvement and make the company less dependent on you.",
    s10: "You have already set up an efficient team. However, you should not make the mistake of only making your original employees leaders. Keep thinking about how best to shape your leadership team, also with a view to the future.",
  },
  {
    label: "We have weekly management meetings.",
    section: "S_EXEC_LT",
    s0: "You have not yet implemented a weekly leadership meeting. In order to create structure, it's good to implement a regular management meeting and systematically determine decisions and actions.",
    s3: "You have not yet implemented a weekly leadership meeting. In order to create structure, it's good to implement a regular management meeting and systematically determine decisions and actions.",
    s5: "You occasionally have meetings with your leaders. This seems very unusual given the size of your company. You should implement a set schedule and systematically make all decisions. Having regular weekly meetings with your most important leaders is essential for making the right decisions together and monitoring progress.",
    s7: "You have leadership meetings on a regular basis. However, weekly management meetings seem to be best. You should consider the weekly meeting primarily as a system for making decisions together and monitoring progress.",
    s10: "You have set leadership meetings. That's good. You should still try to use the weekly meeting for making decisions together and monitoring progress.",
  },
  {
    label: "We have periodic strategic sessions.",
    section: "S_EXEC_LT",
    s0: "You do not yet have strategic sessions. It is important - including in your phase - to involve employees in your long-term planning. That's why you should start planning strategic sessions with all - or your most important - employees.",
    s3: "You do not yet have strategic sessions. It is important - including in your phase - to involve employees in your long-term planning. That's why you should start planning strategic sessions with all - or your most important - employees.",
    s5: "You occasionally have sessions where you develop longer-term plans. Regular mutual consultation about the strategic direction of the company often leads to more effective operations, wider acceptance of decisions and therefore growth.",
    s7: "You have regular sessions where you develop longer-term plans. That's good. Regular mutual consultation about the strategic direction of the company often leads to more effective operations, wider acceptance of decisions and therefore growth.",
    s10: "Your longer-term planning is in order; that's a good start for accelerating growth.",
  },
  {
    label: "Leadership team receives regular training",
    section: "S_EXEC_LT",
    s0: "When your organization is growing rapidly and therefore constantly changing, it is important - even at smaller organizations - for everyone to continue learning. We advise you to start doing this.",
    s3: "When your organization is growing rapidly and therefore constantly changing, it is important - even at smaller organizations - for everyone to continue learning. We advise you to start doing this.",
    s5: "Training and education for your organization's leadership team is not yet in order. It's time to improve this situation.",
    s7: "Most members get training or education from time to time. That's a good start. After all, when your organization is growing rapidly and therefore constantly changing, it is important - even at smaller organizations - for everyone to continue learning.",
    s10: "The members of your management team receive regular training or education. That's good, because when you grow, everything is constantly changing. Continuous learning is important in this case.",
  },
  {
    label: "Our goals are translated into clear KPIs",
    section: "S_EXEC_OP",
    s0: "Making goals measurable is an important step towards creating personal accountability and professionalizing processes. This includes numbers of leads, received applications, IT development, etc. With a company of your size this is usually still a step too early, but it is perhaps something to think about if you start to grow.",
    s3: "Making goals measurable is an important step towards creating personal accountability and professionalizing processes. This includes numbers of leads, received applications, IT development, etc. With a company of your size this is usually still a step too early, but it is perhaps something to think about if you start to grow.",
    s5: "You have already started working on making your goals measurable. That's great; this is an important step towards creating personal accountability and professionalizing processes. This includes numbers of leads, received applications, IT development, etc. This can be especially important if you grow, in order to keep everything under control.",
    s7: "You have already gotten far with making your goals measurable. That's great; this is an important step towards creating personal accountability and professionalizing processes. This includes numbers of leads, received applications, IT development, etc. This can be especially important if you grow, in order to keep everything under control.",
    s10: "You have already translated your goals into measurable indicators. That's great; this is an important step towards creating personal accountability and professionalizing processes. This includes numbers of leads, received applications, IT development, etc. This can be especially important if you grow, in order to keep everything under control.",
  },
  {
    label: "We use real-time data to measure our performance",
    section: "S_EXEC_OP",
    s0: "Because of the size of your company, perhaps you know exactly \"what's going on\". However, if you start to grow you will have to have up-to-date information available, both for yourself as well as for your employees. It's time to think about this.",
    s3: "Because of the size of your company, perhaps you know exactly \"what's going on\". However, if you start to grow you will have to have up-to-date information available, both for yourself as well as for your employees. It's time to think about this.",
    s5: "You have started creating accurate data for guiding your company. That's good, but you should continue down this path because otherwise this will likely increasingly lead to mistakes, wrong decisions and problems and later - if you continue to grow - you'll inevitably end up in trouble.",
    s7: "You have already gotten far with creating accurate data to use to guide your company. That's a good initiative and essential for controlling your continued growth.",
    s10: "Wow, you already have a system in place where you can see exactly how far you have come in achieving your short-term goals. That's great; you'll definitely need this in your next growth phase.",
  },
  {
    label: "We grow with limited mistakes, errors and problems",
    section: "S_EXEC_OP",
    s0: "Work pressure and lack of process often lead to coordination problems and mistakes. That's a shame and could potentially damage your reputation among customers. It's time to take stock of the processes and make clear arrangements. If you don't like doing this yourself, ask an employee to make this number one priority. If you don't resolve this, it will only get worse.",
    s3: "Work pressure and lack of process often lead to coordination problems and mistakes. That's a shame and could potentially damage your reputation among customers. It's time to take stock of the processes and make clear arrangements. If you don't like doing this yourself, ask an employee to make this number one priority. If you don't resolve this, it will only get worse.",
    s5: "You have started coordinating and standardizing, but things still go wrong on a regular basis. It's time to pay even more attention to taking stock of processes and making clear agreements. This is necessary for handling the next growth phase. Scalability is created by standardization, among other things.",
    s7: "Few things go wrong. Do ensure that your processes also run flawlessly if you start to grow. This is not often the case.",
    s10: "You have things well under control. You make extremely few \"error costs.\" Do ensure that your processes also run flawlessly if you start to grow. This is not often the case.",
  },
  {
    label: "We measure customer satisfaction",
    section: "S_EXEC_OP",
    s0: "You do not yet measure customer satisfaction. That's too bad, because this provides important input for the further development of your products and processes. In any case, you should try having regular contact with customers to find out what you can improve.",
    s3: "You do not yet measure customer satisfaction. That's too bad, because this provides important input for the further development of your products and processes. In any case, you should try having regular contact with customers to find out what you can improve.",
    s5: "You have started occasionally measuring your customers' satisfaction. That's great. Try to \"institutionalize\" this process and see what you can improve every day, week or month.",
    s7: "You have already gotten far with measuring your customers' satisfaction. That's great. Try to \"institutionalize\" this process and see what you can improve every day, week or month.",
    s10: "You are already systematically measuring your customers' satisfaction. That's great; keep the results alive and try to act on the input you get as proactively as possible.",
  },
  {
    label: "We have systematic processes for continuous improvement",
    section: "S_EXEC_OP",
    s0: "A system to prevent mistakes and take stock of complaints/feedback is usually not really necessary yet for a company of your size. However, when you start to grow and hire new people, it's often good to structure work processes and set up a system of quality checks and customer feedback. Preventing mistakes is usually significantly cheaper than continually fixing them.",
    s3: "A system to prevent mistakes and take stock of complaints/feedback is usually not really necessary yet for a company of your size. However, when you start to grow and hire new people, it's often good to structure work processes and set up a system of quality checks and customer feedback. Preventing mistakes is usually significantly cheaper than continually fixing them.",
    s5: "You are already doing something in the area of quality management, and that's good. At your level it's good to structure work processes and set up a system of quality checks and customer feedback. Preventing mistakes is usually significantly cheaper than continually fixing them.",
    s7: "Even with size of your company, you are already active in the area of quality management. That's good. This will help with the scalability of the organization in the face of continued growth.",
    s10: "You have an effective quality system, and that's great. This will be a massive advantage for you whilst the company continues to grow, as mistakes will be prevented and adjustments made directly based on customer feedback.",
  },
  {
    label: "We have an effective lead generation process",
    section: "S_EXEC_SM",
    s0: "To grow you need new customers. Often sales are very dependent on the entrepreneur with a company of your size. Then it's wise to start thinking about a lead generation system and process.",
    s3: "To grow you need new customers. Often sales are very dependent on the entrepreneur with a company of your size. Then it's wise to start thinking about a lead generation system and process.",
    s5: "You have already started a lead generation process. That's a good initiative. With a company of your size, allowing the acquisition of new customers to only depend on the entrepreneur or on coincidence is dangerous. For continued growth, it would be wise to implement an effective process and system for this.",
    s7: "You have already gotten far with a lead generation process. That's a good initiative. Often sales are very dependent on the entrepreneur with a company of your size. That's why an independent system and process is so important for continued growth.",
    s10: "You already have an effective lead generation process in place. That's great! An effective system and process is essential for continued rapid growth. Well done.",
  },
  {
    label: "Sales achievement",
    section: "S_EXEC_SM",
    s0: "Having and achieving targets is, of course, the basis for business success and growth. At successful companies this correlation is no coincidence. The sales process will often consist of a combination of targets, bonus schemes, lead generation as well as weekly meetings, coaching, training, motivational sessions, etc. It might be good to start thinking about this already.",
    s3: "Having and achieving targets is, of course, the basis for business success and growth. At successful companies this correlation is no coincidence. The sales process will often consist of a combination of targets, bonus schemes, lead generation as well as weekly meetings, coaching, training, motivational sessions, etc. It might be good to start thinking about this already.",
    s5: "Having and achieving targets is, of course, the basis for business success and growth. At successful companies this correlation is no coincidence. The sales process will often consist of a combination of targets, bonus schemes, lead generation as well as weekly meetings, coaching, training, motivational sessions, etc. It might be good to think about how you can improve this at your company.",
    s7: "Having and achieving targets is, of course, the basis for business success and growth. At successful companies this correlation is no coincidence. The sales process will often consist of a combination of targets, bonus schemes, lead generation as well as weekly meetings, coaching, training, motivational sessions, etc. You are already well on the way. It might be good to think about what improvements you can make, so you can grow even faster.",
    s10: "Having and achieving targets is, of course, the basis for business success and growth. At successful companies this correlation is no coincidence. The sales process will often consist of a combination of targets, bonus schemes, lead generation as well as weekly meetings, coaching, training, motivational sessions, etc. You have this process well under control, so you are all set for further growth.",
  },
  {
    label: "Weekly sales meeting",
    section: "S_EXEC_SM",
    s0: "Stimulating sales is hardly possible without a disciplined process. A weekly sales meeting in which successes as well as setbacks and lessons learned are shared is an important part of the success of fast-growing companies. Often there are also one-on-one meetings with individual sales reps - if applicable. It's time to start with this.",
    s3: "Stimulating sales is hardly possible without a disciplined process. A weekly sales meeting in which successes as well as setbacks and lessons learned are shared is an important part of the success of fast-growing companies. Often there are also one-on-one meetings with individual sales reps - if applicable. It's time to start with this.",
    s5: "Stimulating sales is hardly possible without a disciplined process. A weekly sales meeting in which successes as well as setbacks and lessons learned are shared is an important part of the success of fast-growing companies. Often there are also one-on-one meetings with individual sales reps - if applicable. It's time to quickly get this to a higher level.",
    s7: "You have already gotten far with a disciplined sales process. A weekly sales meeting in which successes as well as setbacks and lessons learned are shared is an important part of the success of fast-growing companies. Often there are also one-on-one meetings with individual sales reps - if applicable. This is very important for making your growth scalable.",
    s10: "You have a disciplined sales process with weekly meetings. That's great. You will have noticed that sharing successes and lessons learned, alongside maintaining a focused team, allows for a stronger grip on the sales funnel. That's an ideal foundation for continued growth.",
  },
  {
    label: "Head of sales is not the entrepreneur",
    section: "S_EXEC_SM",
    s0: "With a company of your size, the entrepreneur is often in charge when it comes to sales. With the increasing pressure on general management tasks, it's good to ensure that you as an entrepreneur free up sufficient time for this. If this is not the case, you will have to start making choices.",
    s3: "With a company of your size, the entrepreneur is often in charge when it comes to sales. With the increasing pressure on general management tasks, it's good to ensure that you as an entrepreneur free up sufficient time for this. If this is not the case, you will have to start making choices.",
    s5: "Also, you can only commit your time once as an entrepreneur. That also applies to sales management. With the increasing pressure on general management tasks, it's good to ensure that you as an entrepreneur free up sufficient time for this. If this is not the case, you will have to start making choices.",
    s7: "As an entrepreneur, you are no longer solely in charge when it comes to sales. That's wise, as this allows the sales process to continue scaling up while you, as an entrepreneur, deal with more general management tasks.",
    s10: "You have made someone else responsible for sales. This seems like a good choice, since now sales is no longer \"an additional task\" for you as an entrepreneur. But be careful! Your best salesperson may not necessarily be a good (sales) manager.",
  },
  {
    label: "We have an effective PR/communication strategy",
    section: "S_EXEC_SM",
    s0: "Nowadays sales and marketing strategies are usually accompanied with an effective content-based communication strategy. This is something you might want to think about.",
    s3: "Nowadays sales and marketing strategies are usually accompanied with an effective content-based communication strategy. This is something you might want to think about.",
    s5: "Nowadays sales and marketing strategies are usually accompanied with an effective content-based communication strategy. You might want to think about implementing this a bit stronger.",
    s7: "Nowadays sales and marketing strategies are usually accompanied with an effective content-based communication strategy. You are active with this strategy. Well done, this might create growth opportunities.",
    s10: "Nowadays sales and marketing strategies are usually accompanied with an effective content-based communication strategy. You have already implemented this fully. Well done, this probably will create growth opportunities.",
  },
  {
    label: "Most processes are automated",
    section: "S_EXEC_SIT",
    s0: "In order to scale, smart application and linking of information technology is essential. Sales, marketing, project management, production, human resources, reporting, etc. This gives structure and clarity, prevents mistakes and makes growing a lot easier. With the size of your company, a lot of systems likely still work independently of each other, or you primarily use Excel. This is customary, but in your next growth phase you will have to start thinking about smart solutions.",
    s3: "In order to scale, smart application and linking of information technology is essential. Sales, marketing, project management, production, human resources, reporting, etc. This gives structure and clarity, prevents mistakes and makes growing a lot easier. With the size of your company, a lot of systems likely still work independently of each other, or you primarily use Excel. This is customary, but in your next growth phase you will have to start thinking about smart solutions.",
    s5: "In order to scale, smart application and linking of information technology is essential. Sales, marketing, project management, production, human resources, reporting, etc. This gives structure and clarity, prevents mistakes and makes growing a lot easier. You have partial automation and a lot of systems probably still work independently of each other. However, with the size of your company, you will quickly have to start thinking about smart (integrated) solutions.",
    s7: "In order to scale, smart application and linking of information technology is essential. Sales, marketing, project management, production, human resources, reporting, etc. This gives structure and clarity, prevents mistakes and makes growing a lot easier. A lot of processes are already being supported by automation at your company. That's great. In the next growth phase, you should also start thinking about integration of the systems.",
    s10: "Most processes are already being supported by automated systems at your company. Sales, marketing, project management, production, human resources, reporting, etc. This gives structure and clarity, prevents mistakes and makes growing a lot easier. Congratulations, on to the next growth phase!",
  },
  {
    label: "Systems prepped for growth",
    section: "S_EXEC_SIT",
    s0: "Your systems are not yet prepared for growth. When you grow, a lot changes at the same time: systems, structures, people, processes, etc. It helps a lot when your systems can handle this growth. Otherwise it's sort of like changing the tires while driving!",
    s3: "Your systems are not yet prepared for growth. When you grow, a lot changes at the same time: systems, structures, people, processes, etc. It helps a lot when your systems can handle this growth. Otherwise it's sort of like changing the tires while driving!",
    s5: "If you grow, a lot changes at the same time: systems, structures, people, processes, etc. It helps a lot when your systems can handle this growth. Otherwise it's sort of like changing the tires while driving! We advise you to quickly start \"thinking ahead\" in terms of structures and systems.",
    s7: "When you grow, a lot changes at the same time: systems, structures, people, processes, etc. It helps a lot when your systems can handle this growth. It looks like you have got this under control. Super. Keep growing!",
    s10: "When you grow, a lot changes at the same time: systems, structures, people, processes, etc. It's great that you already have the systems that can handle this. Keep growing!",
  },
  {
    label: "Better systems than competitors",
    section: "S_EXEC_SIT",
    s0: "Many fast growers have invested in information technology systems that help them be better, smarter, more efficient and more market-oriented than their competitors. You don't have any systems that are better than most of your competitors. Where might IT be able to help you?",
    s3: "Many fast growers have invested in information technology systems that help them be better, smarter, more efficient and more market-oriented than their competitors. You don't have any systems that are better than most of your competitors. Where might IT be able to help you?",
    s5: "Many fast growers have invested in information technology systems that help them be better, smarter, more efficient and more market-oriented than their competitors. You have few systems that are better than most of your competitors. Where might IT be able to help you?",
    s7: "Many fast growers have invested in information technology systems that help them be better, smarter, more efficient and more market-oriented than their competitors. It looks like you pay the same attention to IT systems. That's promising! How can you continue to exploit this advantage?",
    s10: "Many fast growers have invested in information technology systems that help them be better, smarter, more efficient and more market-oriented than their competitors. It looks like that you pay the same attention to IT systems and have superior systems compared to your competitors. How can you continue to exploit this advantage? And how you can hold on to this lead?",
  },
  {
    label: "Knowledge on latest technology",
    section: "S_EXEC_SIT",
    s0: "As an entrepreneur, you always have 1001 focus areas You must keep an eye on technological developments that could enormously affect your business model or company efficiency. You should devote time to this on a regular basis.",
    s3: "As an entrepreneur, you always have 1001 focus areas You must keep an eye on technological developments that could enormously affect your business model or company efficiency. You should devote time to this on a regular basis.",
    s5: "As an entrepreneur, you always have 1001 focus areas. You must keep an eye on technological developments that could enormously affect your business model or company efficiency. You could spend more time on this.",
    s7: "As an entrepreneur, you always have 1001 focus areas. You keep a relatively good eye on technological developments that could enormously affect your business model or company efficiency. Keep a close eye on this.",
    s10: "As an entrepreneur, you always have 1001 focus areas. You keep a good eye on technological developments that could enormously affect your business model or company efficiency. This is a safe situation. No surprises.",
  },
  {
    label: "We are more innovative than competitors",
    section: "S_EXEC_SIT",
    s0: "In this world, where developments are super fast, you can quickly be made less relevant by a competitor if you don't pay attention (for example, by focusing too much on internal issues). It is wise to continuously make improvement and innovation part of the organization's DNA.",
    s3: "In this world, where developments are super fast, you can quickly be made less relevant by a competitor if you don't pay attention (for example, by focusing too much on internal issues). It is wise to continuously make improvement and innovation part of the organization's DNA.",
    s5: "In this world, where developments are super fast, you can quickly be made less relevant by a competitor if you don't pay attention (for example, by focusing too much on internal issues). It is wise to continuously make improvement and innovation part of the organization's DNA.",
    s7: "In this world, where developments are super fast, you can quickly be made less relevant by a competitor if you don't pay attention (for example, by focusing too much on internal issues). You have a good focus on innovation. Keep this up, even when you are growing.",
    s10: "You are more active with innovations than your competitors. That's good. Perhaps you can constantly stay ahead of the market?",
  },
  {
    label: "Our business model is disruptive",
    section: "S_EXEC_SIT",
    s0: "You do not have a disruptive business model. Keep your eyes open for newcomers in your market. Or you might want to think creating a disruptive model yourself.",
    s3: "You do not have a disruptive business model. Keep your eyes open for newcomers in your market. Or you might want to think creating a disruptive model yourself.",
    s5: "You have somewhat of a disruptive business model. That might gold. Further validation, speed and scaling up of the model are the things that now matter most.",
    s7: "You have a somewhat disruptive business model. That is gold. Speed and scaling up are the things that now matter most.",
    s10: "You have a disruptive business model. That's gold. Speed and Scaling Up are now fundamental in conquering most of your market.",
  },
  {
    label: "Real time financial insights",
    section: "S_CASH",
    s0: "You have no up-to-date knowledge of sales and costs. For a growth company, this is the same as driving 90 mph with a blindfold on. Maybe this should be your first priority to tackle tomorrow.",
    s3: "You have no up-to-date knowledge of sales and costs. For a growth company, this is the same as driving 90 mph with a blindfold on. Maybe this should be your first priority to tackle tomorrow.",
    s5: "You hardly have any up-to-date knowledge of sales and costs. For a growth company, this is the same as driving 90 mph with a blindfold on. Maybe this should be your first priority to tackle tomorrow.",
    s7: "You have a reasonably up-to-date picture of your sales and costs. That's good; your aim should be to always have a clear picture of these items.",
    s10: "You have a good picture of sales and costs. No surprises for you. Compliments.",
  },
  {
    label: "Up-to-date cashflow planning",
    section: "S_CASH",
    s0: "You don't employ cash flow planning. As a small business, you always have to look ahead a few months with regard to your cash flow, as otherwise you'll inevitably end up in trouble, especially if you grow.",
    s3: "You don't employ cash flow planning. As a small business, you always have to look ahead a few months with regard to your cash flow, as otherwise you'll inevitably end up in trouble, especially if you grow.",
    s5: "You don't employ strict cash flow planning. As a small business, you always have to look ahead a few months with regard to your cash flow, as otherwise you'll inevitably end up in trouble, especially if you grow.",
    s7: "You have a fair picture of your cash flow. That's good. You have to be able to look ahead a few months. Especially if you grow; no surprises!",
    s10: "You have a perfect picture of your own cash flow; congratulations. This allows you to grow safely.",
  },
  {
    label: "Access to growth capital",
    section: "S_CASH",
    s0: "You have no access to growth capital. This isn't a problem, unless you want to grow a lot. After all, growth gobbles up cash. You could create a list of the various alternatives (friends/fools/family, the bank, factoring, SME bonds, crowd funding, angel investors, private equity, Government Funding, etc.). There are a lot of service providers who can help you with this.",
    s3: "You have no access to growth capital. This isn't a problem, unless you want to grow a lot. After all, growth gobbles up cash. You could create a list of the various alternatives (friends/fools/family, the bank, factoring, SME bonds, crowd funding, angel investors, private equity, Government Funding, etc.). There are a lot of service providers who can help you with this.",
    s5: "You have no clear picture of your access to growth capital. This isn't a problem, unless you want to grow a lot. After all, growth gobbles up cash. You could create a list of the various alternatives (friends/fools/family, the bank, factoring, SME bonds, crowd funding, angel investors, private equity, Government Funding, etc.). There are a lot of service providers who can help you with this.",
    s7: "You have reasonable access to growth capital. That's encouraging, especially if you want to grow. Growth always gobbles up cash. Also think about all the alternatives, such as friends/fools/family, the bank, factoring, SME bonds, crowd funding, angel investors, private equity, Government Funding, etc.). There are a lot of service providers who can help you with this.",
    s10: "You have good access to growth capital. That's encouraging, especially if you want to grow. Growth always gobbles up cash. Also think about all the alternatives, such as friends/fools/family, the bank, factoring, SME bonds, crowd funding, angel investors, private equity, Government Funding, etc.). There are a lot of service providers who can help you with this.",
  },
  {
    label: "Financial alert function",
    section: "S_CASH",
    s0: "It is crucial to have have \"early warning systems\" with regard to financial parameters. The faster you can intervene or take measures, the better. You indicate that this is not the case at your company. That's dangerous. What are you going to do about it?",
    s3: "It is crucial to have \"early warning systems\" with regard to financial parameters. The faster you can intervene or take measures, the better. You indicate that this is not the case at your company. That's dangerous. What are you going to do about it?",
    s5: "It is crucial to have \"early warning systems\" with regard to financial parameters. The faster you can intervene or take measures, the better. You indicate that this is not always the case at your company. That's dangerous. What are you going to do about it?",
    s7: "You indicate that your \"early warning system\" for financial parameters is in order. The faster you can intervene or take measures, the better. But why isn't your score \"perfect\" yet? What are you going to do about it?",
    s10: "You indicate that your \"early warning system\" for financial parameters is perfectly in order. The faster you can intervene or take measures, the better.",
  },
  {
    label: "Leadership understands balance sheet",
    section: "S_CASH",
    s0: "Reading and understanding a balance sheet appears to be a tricky thing for many entrepreneurs. While a balance sheet is a smart blueprint that can expose the dynamics and growth potential behind your company. With a company of your size this is not a priority, but if you grow you should spend a good amount of time and attention on this.",
    s3: "Reading and understanding a balance sheet appears to be a tricky thing for many entrepreneurs. While a balance sheet is a smart blueprint that can expose the dynamics and growth potential behind your company. With a company of your size this is not a priority, but if you grow you should spend a good amount of time and attention on this.",
    s5: "Reading and understanding a balance sheet appears to be a tricky thing for many entrepreneurs. While a balance sheet is a smart blueprint that can expose the dynamics and growth potential behind your company. With a company of your size this is not a priority, but if you grow you should spend a good amount of time and attention on this.",
    s7: "Reading and understanding a balance sheet appears to be a tricky thing for many entrepreneurs. While a balance sheet is a smart blueprint that can expose the dynamics and growth potential behind your company. You are already fairly good at this. This will become increasingly important, especially if you grow.",
    s10: "Reading and understanding a balance sheet appears to be a tricky thing for many entrepreneurs. But not for you. You understand that a balance sheet can be a smart blueprint that can expose the dynamics and growth potential behind your company.",
  },
  {
    label: "CEO works on the company and is able to remove from daily operations",
    section: "S_YOU_LEAD",
    s0: "In this phase you work fully in your company. Perhaps that's logical, since without you there would be no sales. But if you don't put in any time to work on your company as well (systems, structures, processes, management, etc.), then it will be difficult to grow. When do you start?",
    s3: "In this phase you work fully in your company. Perhaps that's logical, since without you there would be no sales. But if you don't put in any time to work on your company as well (systems, structures, processes, management, etc.), then it will be difficult to grow. When do you start?",
    s5: "In this phase you work in your company to a large extent. If you don't put in any time to work on your company as well (systems, structures, processes, management, etc.), then it will be difficult to grow. When do you start?",
    s7: "In this phase you work on your company to a great extent. On to strong growth!",
    s10: "In this phase you work fully on your company. That's excellent. On to strong growth!",
  },
  {
    label: "Have a mentor",
    section: "S_YOU_LEAD",
    s0: "You indicate that you have no mentor. It can be difficult to see when you are stuck. Sometimes choices are a challenge, or you have simply reached the end of your tether. Maybe you need to change to guide the company to its next phase? Whatever it may be, this is where a mentor can be of great assistance.",
    s3: "You indicate that you have no mentor. It can be difficult to see when you are stuck. Sometimes choices are a challenge, or you have simply reached the end of your tether. Maybe you need to change to guide the company to its next phase? Whatever it may be, this is where a mentor can be of great assistance.",
    s5: "You don't really have a permanent mentor. It can be difficult to see when you are stuck. Sometimes choices are a challenge, or you have simply reached the end of your tether. Maybe you need to change to guide the company to its next phase? Whatever it may be, this is where a mentor can be of great assistance.",
    s7: "It can be difficult to see when you are stuck. Sometimes choices are a challenge, or you have simply reached the end of your tether. Maybe you need to change to guide the company to its next phase? Whatever it may be, this is where a mentor can be of great assistance. Good that you have one!",
    s10: "It can be difficult to see when you are stuck. Sometimes choices are a challenge, or you have simply reached the end of your tether. Maybe you need to change to guide the company to its next phase? Whatever it may be, this is where a mentor can be of great assistance. Great that you have a good mentor!",
  },
  {
    label: "Have an entrepreneurial network",
    section: "S_YOU_LEAD",
    s0: "Most entrepreneurs experience the same challenges, highs and lows. Other entrepreneurs you know can often be of great assistance with their experiences. We recommend that you actively look for and invest time in a network of entrepreneurs.",
    s3: "Most entrepreneurs experience the same challenges, highs and lows. Other entrepreneurs you know can often be of great assistance with their experiences. We recommend that you actively look for and invest time in a network of entrepreneurs.",
    s5: "Most entrepreneurs experience the same challenges, highs and lows. Other entrepreneurs you know can often be of great assistance with their experiences. We recommend that you actively look for and invest more time in a good network of entrepreneurs.",
    s7: "Most entrepreneurs experience the same challenges, highs and lows. Other entrepreneurs you know can often be of great assistance with their experiences. You have a network of entrepreneurs that you can consult; well done.",
    s10: "Most entrepreneurs experience the same challenges, highs and lows. Other entrepreneurs you know can often be of great assistance with their experiences. You have an effective network of entrepreneurs that you can consult; well done.",
  },
  {
    label: "Enjoy management of company",
    section: "S_YOU_LEAD",
    s0: "Many entrepreneurs discover that management costs time and energy and is a \"skill\" that requires development. You don't like it. Therefore, you should examine where your strength lies; perhaps it would be better to hire an operations manager directly.",
    s3: "Many entrepreneurs discover that management costs time and energy and is a \"skill\" that requires development. You don't like it. Therefore, you should examine where your strength lies; perhaps it would be better to hire an operations manager directly.",
    s5: "You don't really like managing. Many entrepreneurs find out that managing people costs a lot of time and energy. With a company of your size you probably work with a management team and/or a second-in-command who is good in operations. The challenge is for you not to get in their way and to focus fully on the future of the company.",
    s7: "You like managing somewhat. That's handy because if your company has eight or more employees, you will have to continually develop these skills.",
    s10: "You like managing. That's handy because if your company has eight or more employees, you will have to continually develop these skills.",
  },
  {
    label: "Energized by team and company",
    section: "S_YOU_LEAD",
    s0: "It is not unusual for entrepreneurs to become \"sick\" of their company after about seven years. Employees can change jobs or companies. Entrepreneurs can't. The best solution that doesn't cost money but does deliver is to let your company grow rapidly. Then every year is different.",
    s3: "It is not unusual for entrepreneurs to become \"sick\" of their company after about seven years. Employees can change jobs or companies. Entrepreneurs can't. The best solution that doesn't cost money but does deliver is to let your company grow rapidly. Then every year is different.",
    s5: "It is not unusual for entrepreneurs to become \"sick\" of their company after about seven years. Employees can change jobs or companies. Entrepreneurs can't. The best solution that doesn't cost money but does deliver is to let your company grow hard (again); then every year is different.",
    s7: "You still get energy from your company. That's great; use all this energy to let your company grow.",
    s10: "You still get energy from your company. That's great; use all this energy to let your company grow.",
  },
  {
    label: "Absence of CEO is possible",
    section: "S_YOU_LEAD",
    s0: "You can't leave without things going wrong. You have made the company, the processes and the people too dependent on you. That's not scalable and causes you in particular a lot of work, stress and likely also annoyance. We recommend that you start working on standardization, establishing processes and probably also on hiring better people.",
    s3: "You can't leave without things going wrong. You have made the company, the processes and the people too dependent on you. That's not scalable and causes you in particular a lot of work, stress and likely also annoyance. We recommend that you start working on standardization, establishing processes and probably also on hiring better people.",
    s5: "You still can't leave without some things going wrong. You have made the company, the processes and the people too dependent on you. That's not scalable and causes you in particular a lot of work, stress and likely also annoyance. We recommend that you start working on standardization, establishing processes and probably also on hiring better people.",
    s7: "You can easily leave for three weeks without things going completely wrong. That's quite an accomplishment. You probably have an excellent team working for you, as well as standardized processes. That's a nice scalable model for growth.",
    s10: "You can easily leave for three weeks without things going wrong. That's quite an accomplishment. You probably have an excellent team working for you, as well as standardized processes. Your next challenge is being away for three months; then you'll really have built an independent organization.",
  },
  {
    label: "Read business books",
    section: "S_YOU_LEAD",
    s0: "You never read management books. That's a shame, because in order to grow it will be imperative to have skills, ideas and insights that were documented by others years ago. And don't forget: \"stagnant water will stink.\" This also applies to businesses.",
    s3: "You never read management books. That's a shame, because in order to grow it will be imperative to have skills, ideas and insights that were documented by others years ago. And don't forget: \"stagnant water will stink.\" This also applies to businesses.",
    s5: "You don't often read management books. That's a shame, because in order to grow it will be imperative to have skills, ideas and insights that were documented by others years ago. And don't forget: \"stagnant water will stink.\" This also applies to businesses.",
    s7: "You occasionally read management books. That's great, because in order to grow it will be imperative to have skills, ideas and insights that were documented by others years ago. Keep reading; keep developing yourself.",
    s10: "You read management books on a regular basis. That's great, because in order to grow - and for your next growth phase - it will be imperative to have skills, ideas and insights that were documented by others years ago. Keep reading; keep developing yourself.",
  },
  {
    label: "Receives regular education",
    section: "S_YOU_LEAD",
    s0: "You never follow external education or training courses. That's too bad. Because even as an entrepreneur, you need to develop yourself. Often the entrepreneur him/herself is the most important part of the educational equation. Management guru Peter Drucker said: \"The bottleneck is always on top of the bottle.\" In other words, keep developing yourself in order to let your organization grow.",
    s3: "You never follow external education or training courses. That's too bad. Because even as an entrepreneur, you need to develop yourself. Often the entrepreneur him/herself is the most important part of the educational equation. Management guru Peter Drucker said: \"The bottleneck is always on top of the bottle.\" In other words, keep developing yourself in order to let your organization grow.",
    s5: "You sporadically attend external education or training courses. That's too bad. Because even as an entrepreneur, you need to develop yourself. Often the entrepreneur him/herself is the most important part of the educational equation. Management guru Peter Drucker said: \"The bottleneck is always on top of the bottle.\" In other words, keep developing yourself in order to let your organization grow.",
    s7: "You occasionally attend external or internal training courses. That's very good. Self-development is fundamental for overall company development.",
    s10: "You attend external education or training courses on a regular basis. That's very good. Self-development is fundamental for overall company development.",
  },
  {
    label: "Healthy work - life balance",
    section: "S_YOU_LEAD",
    s0: "You have a poor work-life balance. It is a challenge for many businesses to combine everything. Successful high-growth entrepreneurs teach us that we must always take good care of ourselves. Hard work is sometimes necessary, of course, but you should take enough time for yourself and not skip vacations. Working smart is the solution.",
    s3: "You have a poor work-life balance. It is a challenge for many businesses to combine everything. Successful high-growth entrepreneurs teach us that we must always take good care of ourselves. Hard work is sometimes necessary, of course, but you should take enough time for yourself and not skip vacations. Working smart is the solution.",
    s5: "You have a poor work-life balance. It is a challenge for many entrepreneurs to combine everything. Successful high-growth entrepreneurs teach us that we must always take good care of ourselves. Hard work is sometimes necessary, of course, but you should take enough time for yourself and not skip vacations. Working smart is the solution.",
    s7: "You have a reasonably good work-life balance. It is a challenge for many entrepreneurs to combine everything. Successful high-growth entrepreneurs teach us that we must always take good care of ourselves. You have got that under control; well done.",
    s10: "You have a good work-life balance. It is a challenge for many entrepreneurs to combine everything. Successful high-growth entrepreneurs teach us that we must always take good care of ourselves. You have got that under control; good job.",
  },
  {
    label: "I am happy",
    section: "S_YOU_LEAD",
    s0: "You are absolutely not happy. If this feeling continues, talk to a mentor, another entrepreneur who has been in your shoes. Maybe entrepreneurship is not for you.",
    s3: "You are absolutely not happy. If this feeling continues, talk to a mentor, another entrepreneur who has been in your shoes. Maybe entrepreneurship is not for you.",
    s5: "You are somewhat not happy. If this feeling continues, talk to a mentor, another entrepreneur who has been in your shoes. Maybe entrepreneurship is not for you.",
    s7: "You are mostly happy. Congratulations! Long may it last!",
    s10: "You are entirely happy. Congratulations! Long may it last!",
  },
  {
    label: "Employees know long term goal",
    section: "S_YOU_IC",
    s0: "A long-term goal for the organization gives everyone a clear framework for strategy and decisions - and can be very motivating. With a company of your size it isn't really necessary to establish all of this clearly yet, but it will help. But you can start thinking about it.",
    s3: "A long-term goal for the organization gives everyone a clear framework for strategy and decisions - and can be very motivating. With a company of your size it isn't really necessary to establish all of this clearly yet, but it will help. But you can start thinking about it.",
    s5: "A long-term goal for the organization gives everyone a clear framework for strategy and decisions - and can be very motivating. Good that you have started doing this. It's important for you to finish this quickly.",
    s7: "A long-term goal for the organization gives everyone a clear framework for strategy and decisions - and can be very motivating. Good that you have already come a long way with this. When you start to grow, it's important for all of this to be in order.",
    s10: "A long-term goal for the organization gives everyone a clear framework for strategy and decisions - and can be very motivating. Great that this is already all in place. Ensure you check this annually - verifying a valid long-term goal.",
  },
  {
    label: "Employees know yearly goal",
    section: "S_YOU_IC",
    s0: "Focusing on goals, including annual goals, provides direction and a framework to your business activities. In addition, this information motivates your employees. In this phase you should start thinking about making all of this a bit clearer.",
    s3: "Focusing on goals, including annual goals, provides direction and a framework to your business actions. In addition, this information motivates your employees. In this phase you should start thinking about making all of this a bit clearer.",
    s5: "Focusing on goals, including annual goals, provides direction and a framework to your business activities. In addition, this information motivates your employees. Good that you have already started doing this; try to persevere and especially to communicate about this on a regular basis.",
    s7: "Focusing on goals, including annual goals, provides direction and a framework to your business activities. In addition, this information motivates your employees. Good that you have already come a long way with this. Above all try to keep your goals \"alive\".",
    s10: "Focusing on goals, including annual goals, provides direction and a framework to your business activities. In addition, this information motivates your employees. Fantastic that everyone knows what the annual goal is. Well done!",
  },
  {
    label: "Employees know quarterly/monthly goals",
    section: "S_YOU_IC",
    s0: "Focusing on goals, including monthly goals and KPIs, provides guidance and direction to business activities. Actually, you make a small sprint every month to ensure that you are \"on schedule\". The clearer the goal the clearer it becomes on how to achieve it. Perhaps you can think about how this would work at your company.",
    s3: "Focusing on goals, including monthly goals and KPIs, provides guidance and direction to business activities. Actually, you make a small sprint every month to ensure that you are \"on schedule\". The clearer the goal the clearer it becomes on how to achieve it. Perhaps you can think about how this would work at your company.",
    s5: "Focusing on goals, including monthly goals and KPIs, provides guidance and direction to business activities. Actually, you make a small sprint every month to ensure that you are \"on schedule\". The clearer the goal the clearer it becomes on how to achieve it. Good that you have already started doing this. Hurry up and finish and implement it.",
    s7: "Focusing on goals, including monthly goals and KPIs, provides guidance and direction to business activities. Actually, you make a small sprint every month to ensure that you are \"on schedule\". The clearer the goal the clearer it becomes on how to achieve it. Good that you are already applying this. Think above all about clear and simple communication with respect to the goals.",
    s10: "Focusing on goals, including monthly goals and KPIs, provides guidance and direction to business activities. Actually, you make a small sprint every month to ensure that you are \"on schedule\". The clearer the goal the clearer it becomes on how to achieve it. Great that you have already got this all together in this phase. Well done.",
  },
  {
    label: "Employees know vision and mission",
    section: "S_YOU_IC",
    s0: "As with the long-term goal - it is important for the company's vision and mission to be clear. This motivates employees and provides a clear framework for the activities. In your phase this doesn't all need to be in place yet, but you can start thinking about what that vision and mission might look like.",
    s3: "As with the long-term goal - it is important for the company's vision and mission to be clear. This motivates employees and provides a clear framework for the activities. In your phase this doesn't all need to be in place yet, but you can start thinking about what that vision and mission might look like.",
    s5: "As with the long-term goal - it is important for the company's vision and mission to be clear. This motivates employees and provides a clear framework for the activities. It's good that you have started on this, but it's important to finish quickly.",
    s7: "As with the long-term goal - it is important for the company's vision and mission to be clear. This motivates employees and provides a clear framework for the activities. Good to see that you have already started on this in your phase.",
    s10: "As with the long-term goal - it is important for the company's vision and mission to be clear. This motivates employees and provides a clear framework for the activities. Good to see that you have already got this all together in your phase.",
  },
  {
    label: "Employees know elevator pitch",
    section: "S_YOU_IC",
    s0: "You'd be surprised to hear the stories and answers you get to the question \"What exactly does your company do?\". It is a good idea to formulate a common language and text - and to practice together. Everything will become clearer. Both internally as well as externally.",
    s3: "You'd be surprised to hear the stories and answers you get to the question \"What exactly does your company do?\". It is a good idea to formulate a common language and text - and to practice together. Everything will become clearer. Both internally as well as externally.",
    s5: "You'd be surprised to hear the stories and answers you get to the question \"What exactly does your company do?\". It is a good idea to formulate a common language and text - and to practice together. Everything will become clearer. Both internally as well as externally.",
    s7: "You'd be surprised to hear the stories and answers you get to the question \"What exactly does your company do?\". It is a good idea to formulate a common language and text - and to practice together. It's good that you have already gotten this far with it. We recommend that you check occasionally... don't be surprised to see what you get.",
    s10: "You'd be surprised to hear the stories and answers you get to the question \"What exactly does your company do?\". It is a good idea to formulate a common language and text - and to practice together. You have this under control and that's great. Primarily, don't forget to check and polish occasionally.",
  },
  {
    label: "We frequently have company-wide meetings",
    section: "S_YOU_IC",
    s0: "Research shows that it's crucial to communicate goals and performance to all employees, providing them with context regarding development. Face-to-face, with internal sessions works best. With internal sessions, in other words. With a company of your size this may seem too much \"overkill\" in information and process, but perhaps it would be good to start on it already.",
    s3: "Research shows that it's crucial to communicate goals and performance to all employees, providing them with context regarding development. Face-to-face, with internal sessions works best. With internal sessions, in other words. With a company of your size this may seem too much \"overkill\" in information and process, but perhaps it would be good to start on it already.",
    s5: "Research shows that it's crucial to communicate goals and performance to all employees, providing them with context regarding development. Face-to-face, with internal sessions works best. With internal sessions, in other words. You are already doing this, but still not often enough. We recommend that you increase the frequency of the sessions.",
    s7: "Research shows that it's crucial to communicate goals and performance to all employees, providing them with context regarding development. Face-to-face, with internal sessions works best. With internal sessions, in other words. You are already doing this, but perhaps still not often enough. More often is better... we recommend that you increase the frequency of the sessions.",
    s10: "Research shows that it's crucial to communicate goals and performance to all employees, providing them with context regarding development. Face-to-face, with internal sessions works best. With internal sessions, in other words. You are already doing this, and frequently. Try to keep this up, even in the face of continued growth.",
  },
];
// ─── Derived structures ──────────────────────────────────────────────────

interface SectionPayload {
  stableKey: string;
  sortOrder: number;
  name: string;
  description: string;
  domain: string;
}

interface QuestionPayload {
  stableKey: string;
  sortOrder: number;
  type: "SLIDER_LIKERT";
  label: string;
  sectionStableKey: string;
  isRequired: true;
  scale: {
    min: 0;
    max: 10;
    step: 1;
    anchorMin: string;
    anchorMax: string;
  };
  recommendations: Array<{
    minScore: number;
    maxScore: number;
    text: string;
  }>;
}

const ANCHOR_MIN = "Strongly disagree";
const ANCHOR_MAX = "Strongly agree";

// ─── Background NUMBER questions (Wave J-1) ───────────────────────────────
//
// CEO-only "About your company" headcount questions. These are NUMBER (not
// slider) and are NON-SCORED: scoring.ts only scores SLIDER_LIKERT and skips
// TEXT/NUMBER/MULTI_CHOICE, so they do NOT affect domain/section/ScaleUp
// rollups. Labels are VERBATIM from the Esperto background screen (source
// extract lines 85-86). Q_FTE_CONTRACT (the single combined "permanent or
// temporary contract" FTE field) drives the growth-phase tile (su-full-phase.ts);
// Q_FREELANCE is captured for fidelity but EXCLUDED from the phase calc.
// Visibility is gated to the CEO by the survey plumbing (Task B) — the seed
// only DEFINES these questions.
interface BackgroundNumberPayload {
  stableKey: string;
  sortOrder: number;
  type: "NUMBER";
  label: string;
  sectionStableKey: string;
  isRequired: boolean;
}

// sortOrders 62–63 sit after the 61 SLIDER questions (1–61) so the seed
// integrity guard's duplicate-sortOrder check stays satisfied.
const BACKGROUND_QUESTION_DEFS: BackgroundNumberPayload[] = [
  {
    // The single combined contract-FTE field — drives the growth-phase tile.
    stableKey: "Q_FTE_CONTRACT",
    sortOrder: 62,
    type: "NUMBER",
    label:
      "Number of employees with a permanent or temporary contract (full-time equivalent)",
    sectionStableKey: "S_BACKGROUND",
    isRequired: true,
  },
  {
    stableKey: "Q_FREELANCE",
    sortOrder: 63,
    type: "NUMBER",
    label:
      "Average number of freelance employees (full-time equivalent)",
    // Optional — captured for fidelity, EXCLUDED from the growth-phase calc.
    sectionStableKey: "S_BACKGROUND",
    isRequired: false,
  },
];

type AnyQuestionPayload = QuestionPayload | BackgroundNumberPayload;

function buildSectionsAndQuestions(): {
  sections: SectionPayload[];
  questions: AnyQuestionPayload[];
} {
  const sections: SectionPayload[] = SECTIONS.map((s) => ({
    stableKey: s.stableKey,
    sortOrder: s.sortOrder,
    name: s.name,
    description: s.description,
    domain: s.domain,
  }));

  const sliderQuestions: QuestionPayload[] = QUESTION_DEFS.map((q, idx) => {
    const sortOrder = idx + 1;
    return {
      // Pad to 2 digits so sortOrder ordering matches lexical ordering.
      stableKey: `Q${String(sortOrder).padStart(2, "0")}`,
      sortOrder,
      type: "SLIDER_LIKERT" as const,
      label: q.label,
      sectionStableKey: q.section,
      isRequired: true as const,
      scale: {
        min: 0 as const,
        max: 10 as const,
        step: 1 as const,
        anchorMin: ANCHOR_MIN,
        anchorMax: ANCHOR_MAX,
      },
      recommendations: [
        // 5-stop integer-touching bands: [0-2], [3-4], [5-6], [7-9], [10-10].
        // Every integer in [0, 10] is covered by exactly one band (no overlap, no gap).
        // Stops sourced verbatim from Esperto uniform-fill sample reports.
        { minScore: 0, maxScore: 2, text: q.s0 },
        { minScore: 3, maxScore: 4, text: q.s3 },
        { minScore: 5, maxScore: 6, text: q.s5 },
        { minScore: 7, maxScore: 9, text: q.s7 },
        { minScore: 10, maxScore: 10, text: q.s10 },
      ],
    };
  });

  // Append the CEO-only background NUMBER questions after the 61 sliders.
  const questions: AnyQuestionPayload[] = [
    ...sliderQuestions,
    ...BACKGROUND_QUESTION_DEFS,
  ];

  return { sections, questions };
}

// ─── Public content builder (exported for tests) ─────────────────────────

export function buildTemplateContent(): {
  sections: SectionPayload[];
  questions: AnyQuestionPayload[];
  scoringConfig: typeof SCORING_CONFIG;
} {
  const { sections, questions } = buildSectionsAndQuestions();
  return { sections, questions, scoringConfig: SCORING_CONFIG };
}

// ─── SeedContent builder (new helper-pattern export) ─────────────────────
//
// Returns a SeedContent compatible with ensureTemplateVersionContent().
// This is the canonical export for the new main() and for the
// scaling-up-full-content.test.ts publish-schema assertion.
export function buildScalingUpFullContent(): SeedContent {
  const { sections, questions } = buildSectionsAndQuestions();
  return {
    alias: ALIAS,
    name: NAME,
    description: TEMPLATE_DESCRIPTION,
    invitationSubject: INVITATION_SUBJECT,
    invitationBodyMarkdown: INVITATION_BODY_MARKDOWN,
    language: LANGUAGE,
    sections,
    questions,
    scoringConfig: SCORING_CONFIG,
    reportConfig: null,
    aggregationMode: "FULL_VISIBILITY",
  };
}

// ─── Content hash (deterministic) ────────────────────────────────────────

export function computeContentHash(input: {
  questions: AnyQuestionPayload[];
  sections: SectionPayload[];
  scoringConfig: unknown;
  reportConfig: null;
  invitationSubject: string;
  invitationBodyMarkdown: string | null;
}): string {
  const canonical = {
    questions: input.questions,
    sections: input.sections,
    scoringConfig: input.scoringConfig,
    reportConfig: input.reportConfig,
    invitationSubject: input.invitationSubject,
    invitationBodyMarkdown: input.invitationBodyMarkdown,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

// ─── System user resolution ───────────────────────────────────────────────

const SYSTEM_SEED_EMAIL = "system-seed@scalingup.platform";

async function resolveSystemUser(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
): Promise<{ id: string }> {
  return tx.user.upsert({
    where: { email: SYSTEM_SEED_EMAIL },
    create: {
      email: SYSTEM_SEED_EMAIL,
      role: "STAFF",
      name: "System Seed",
    },
    update: {},
    select: { id: true },
  });
}

// ─── ensureAccessGroupAndTemplateLink ─────────────────────────────────────

async function ensureAccessGroupAndTemplateLink(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  templateId: string,
  groupName: string,
  systemUserId: string,
  defaultCoachEmail = "coach@example.com"
): Promise<void> {
  const existingGroup = await tx.accessGroup.findFirst({
    where: { name: groupName },
    select: { id: true, deletedAt: true },
  });

  let groupId: string;
  if (!existingGroup) {
    const created = await tx.accessGroup.create({
      data: {
        name: groupName,
        description:
          "Default access group seeded with Scaling Up Full Assessment. " +
          "Admins add certified coaches here to grant template access.",
        createdBy: systemUserId,
      },
      select: { id: true },
    });
    groupId = created.id;
  } else {
    if (existingGroup.deletedAt !== null) {
      throw new Error(
        `[seed-scaling-up-full-assessment] AccessGroup "${groupName}" exists ` +
          `but is soft-deleted (deletedAt=${existingGroup.deletedAt.toISOString()}). ` +
          `Refusing to silently un-archive. ` +
          `Operator must un-archive the group via admin UI or set ` +
          `deletedAt = NULL manually before re-seeding.`
      );
    }
    groupId = existingGroup.id;
  }

  await tx.accessGroupTemplate.upsert({
    where: {
      accessGroupId_templateId: {
        accessGroupId: groupId,
        templateId,
      },
    },
    create: {
      accessGroupId: groupId,
      templateId,
      addedBy: systemUserId,
    },
    update: {},
  });

  const defaultCoach = await tx.coach.findUnique({
    where: { email: defaultCoachEmail },
    select: { id: true },
  });
  if (defaultCoach) {
    await tx.accessGroupCoach.upsert({
      where: {
        accessGroupId_coachId: {
          accessGroupId: groupId,
          coachId: defaultCoach.id,
        },
      },
      create: {
        accessGroupId: groupId,
        coachId: defaultCoach.id,
        addedBy: systemUserId,
      },
      update: {},
    });
  }
}

// ─── Core seed logic (exported for testing) ──────────────────────────────

export interface SeedResult {
  state: "A" | "B" | "C" | "D";
  templateId: string;
  versionId: string;
  sectionCount: number;
  questionCount: number;
  contentHash: string;
}

export async function runSeed(client: PrismaClient): Promise<SeedResult> {
  const { sections, questions } = buildSectionsAndQuestions();

  const contentHash = computeContentHash({
    questions,
    sections,
    scoringConfig: SCORING_CONFIG,
    reportConfig: null,
    invitationSubject: INVITATION_SUBJECT,
    invitationBodyMarkdown: INVITATION_BODY_MARKDOWN,
  });

  const result = await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext('${ADVISORY_LOCK_KEY}'))`
    );

    const systemUser = await resolveSystemUser(tx);

    const existingTemplate = await tx.assessmentTemplate.findUnique({
      where: { alias: ALIAS },
      select: { id: true, createdBy: true },
    });

    if (!existingTemplate) {
      // STATE E — orphan defensive check.
      const orphanedV1s = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT v.id
           FROM assessment_template_versions v
           LEFT JOIN assessment_templates t ON t.id = v."templateId"
           WHERE v."versionNumber" = 1
             AND v.language = 'enUS'
             AND t.id IS NULL`
      );
      if (orphanedV1s.length > 0) {
        throw new Error(
          `[seed-scaling-up-full-assessment] Found ${orphanedV1s.length} orphaned ` +
            `v1/enUS AssessmentTemplateVersion row(s) with no matching template ` +
            `(IDs: ${orphanedV1s.map((r) => r.id).join(", ")}). ` +
            `Database invariant violation — the FK to assessment_templates is broken. ` +
            `Investigate before proceeding.`
        );
      }

      // STATE A — nothing found: create template + v1 atomically.
      // NOTE: publishedAt is intentionally null. The seed creates a DRAFT
      // version (Codex round 2 #4); operators verify content + tier
      // thresholds via the admin editor before publishing.
      const template = await tx.assessmentTemplate.create({
        data: {
          name: NAME,
          alias: ALIAS,
          description: TEMPLATE_DESCRIPTION,
          invitationSubject: INVITATION_SUBJECT,
          invitationBodyMarkdown: INVITATION_BODY_MARKDOWN,
          aggregationMode: "FULL_VISIBILITY",
          createdBy: systemUser.id,
        },
        select: { id: true },
      });

      const version = await tx.assessmentTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: VERSION_NUMBER,
          language: LANGUAGE,
          questions: questions as unknown as object,
          sections: sections as unknown as object,
          scoringConfig: SCORING_CONFIG as unknown as object,
          reportConfig: undefined,
          contentHash,
          // DRAFT — publishedAt intentionally null. publishedBy can stay null
          // too; the admin editor's Publish action sets both atomically.
          publishedAt: null,
          publishedBy: null,
        },
        select: { id: true },
      });

      await ensureAccessGroupAndTemplateLink(
        tx,
        template.id,
        "Scaling Up Coaches",
        systemUser.id
      );

      return {
        state: "A" as const,
        templateId: template.id,
        versionId: version.id,
        sectionCount: sections.length,
        questionCount: questions.length,
        contentHash,
      };
    }

    // Template exists — look for v1 / enUS rows.
    const v1Rows = await tx.assessmentTemplateVersion.findMany({
      where: {
        templateId: existingTemplate.id,
        versionNumber: VERSION_NUMBER,
        language: LANGUAGE,
      },
      select: { id: true, contentHash: true },
    });

    if (v1Rows.length > 1) {
      // STATE F — duplicate v1 rows.
      throw new Error(
        `[seed-scaling-up-full-assessment] Found ${v1Rows.length} v1/enUS rows ` +
          `for template ${existingTemplate.id}. Database invariant violation: ` +
          `the unique constraint (templateId, versionNumber, language) is broken. ` +
          `Investigate before proceeding.`
      );
    }

    if (v1Rows.length === 0) {
      // STATE D — half-baked heal. Still DRAFT.
      const version = await tx.assessmentTemplateVersion.create({
        data: {
          templateId: existingTemplate.id,
          versionNumber: VERSION_NUMBER,
          language: LANGUAGE,
          questions: questions as unknown as object,
          sections: sections as unknown as object,
          scoringConfig: SCORING_CONFIG as unknown as object,
          reportConfig: undefined,
          contentHash,
          publishedAt: null,
          publishedBy: null,
        },
        select: { id: true },
      });

      await ensureAccessGroupAndTemplateLink(
        tx,
        existingTemplate.id,
        "Scaling Up Coaches",
        systemUser.id
      );

      return {
        state: "D" as const,
        templateId: existingTemplate.id,
        versionId: version.id,
        sectionCount: sections.length,
        questionCount: questions.length,
        contentHash,
      };
    }

    // Exactly one v1 row.
    const existingVersion = v1Rows[0];

    if (existingVersion.contentHash === contentHash) {
      // STATE B — exact match. Idempotent no-op.
      await ensureAccessGroupAndTemplateLink(
        tx,
        existingTemplate.id,
        "Scaling Up Coaches",
        systemUser.id
      );

      return {
        state: "B" as const,
        templateId: existingTemplate.id,
        versionId: existingVersion.id,
        sectionCount: sections.length,
        questionCount: questions.length,
        contentHash,
      };
    }

    // STATE C — mismatch.
    throw new Error(
      `[seed-scaling-up-full-assessment] Existing v1/enUS version ` +
        `(${existingVersion.id}) has contentHash=${existingVersion.contentHash} ` +
        `which does not match the seed's computed contentHash=${contentHash}. ` +
        `Published assessment versions are immutable. ` +
        `To change v1 content, publish a NEW versionNumber instead of mutating v1. ` +
        `Refusing to silently mutate the immutable published row.`
    );
  }, {
    maxWait: 30_000,
    timeout: 60_000,
  });

  return result;
}

// ─── Extraction audit (called inline before write — guardrail #4) ────────
//
// Verifies the seed's `buildTemplateContent()` output has the expected
// structure BEFORE we touch the DB. If extraction fidelity broke (matrix
// XLSX changed, narratives lost), the seed FAILS rather than shipping a
// half-baked template. Only intentional band-TEXT placeholder gaps are
// allowed to slip through (the strict publish schema catches those when
// the operator clicks Publish).

export function runExtractionAudit(): {
  ok: true;
  questionCount: number;
  sectionCount: number;
  domainCount: number;
} {
  const content = buildTemplateContent();

  // 5 domains exactly
  if (content.scoringConfig.domains.length !== 5) {
    throw new Error(
      `[seed-scaling-up-full-assessment] extraction audit FAILED: expected ` +
        `5 domains, got ${content.scoringConfig.domains.length}`
    );
  }

  // Every section has a domain
  for (const s of content.sections) {
    if (!s.domain) {
      throw new Error(
        `[seed-scaling-up-full-assessment] extraction audit FAILED: section ` +
          `${s.stableKey} has no domain field`
      );
    }
  }

  // Every used domain key appears in domains[]
  const definedDomains = new Set<string>(
    content.scoringConfig.domains.map((d) => d.key as string)
  );
  for (const s of content.sections) {
    if (!definedDomains.has(s.domain)) {
      throw new Error(
        `[seed-scaling-up-full-assessment] extraction audit FAILED: section ` +
          `${s.stableKey} uses domain "${s.domain}" which is not in ` +
          `scoringConfig.domains[]`
      );
    }
  }

  // Question count sanity bound
  if (content.questions.length < 50 || content.questions.length > 70) {
    throw new Error(
      `[seed-scaling-up-full-assessment] extraction audit FAILED: expected ` +
        `between 50 and 70 questions, got ${content.questions.length}`
    );
  }

  // Each SLIDER_LIKERT question: scale [0, 10], 5 recommendation bands.
  // Non-slider questions (the Wave J-1 background NUMBER questions) are
  // intentionally non-scored and carry no scale/recommendations — skip them.
  for (const q of content.questions) {
    if (q.type !== "SLIDER_LIKERT") continue;
    if (q.scale.min !== 0 || q.scale.max !== 10 || q.scale.step !== 1) {
      throw new Error(
        `[seed-scaling-up-full-assessment] extraction audit FAILED: question ` +
          `${q.stableKey} scale is not [0, 10] step 1`
      );
    }
    if (q.recommendations.length !== 5) {
      throw new Error(
        `[seed-scaling-up-full-assessment] extraction audit FAILED: question ` +
          `${q.stableKey} has ${q.recommendations.length} bands; expected 5`
      );
    }
  }

  // Rollup + ScaleUp Score
  if (content.scoringConfig.rollup.overall !== "meanOfDomains") {
    throw new Error(
      `[seed-scaling-up-full-assessment] extraction audit FAILED: ` +
        `rollup.overall must be "meanOfDomains"`
    );
  }
  if (content.scoringConfig.scaleUpScore !== true) {
    throw new Error(
      `[seed-scaling-up-full-assessment] extraction audit FAILED: ` +
        `scaleUpScore must be enabled`
    );
  }

  return {
    ok: true,
    questionCount: content.questions.length,
    sectionCount: content.sections.length,
    domainCount: content.scoringConfig.domains.length,
  };
}

// ─── Main (helper-pattern, mirrors sibling seeds) ────────────────────────
//
// Uses the shared ensureTemplateVersionContent helper for version-aware
// append semantics (no-op on hash match, append DRAFT vN+1 on published
// mismatch, fail-closed on edited unpublished DRAFT).
// The legacy runSeed() and its STATE A–F model are retained as exports for
// backward compatibility with existing tests; they do not run via this main().

async function main(): Promise<void> {
  const content = buildScalingUpFullContent();

  const result = await db.$transaction(async (tx) => {
    // Try to acquire advisory lock. pg_try_advisory_xact_lock returns false
    // (not throws) when another session holds it.
    const lockRows = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      `SELECT pg_try_advisory_xact_lock(hashtext('${ADVISORY_LOCK_KEY}')) AS acquired`
    );
    const acquired = lockRows[0]?.acquired ?? false;
    if (!acquired) {
      throw new Error(
        `[seed-scaling-up-full-assessment] Could not acquire advisory lock ` +
          `"${ADVISORY_LOCK_KEY}" — another seed run is in progress. ` +
          `Try again after the other session completes.`
      );
    }

    const sys = await resolveSystemUser(tx);

    const seedResult = await ensureTemplateVersionContent(
      tx as unknown as Parameters<typeof ensureTemplateVersionContent>[0],
      sys.id,
      content,
      // v2 (Wave J-1) supersedes the existing unpublished DRAFT v1. The helper
      // fail-closes on a differing unpublished DRAFT unless we opt in here. It
      // still APPENDS a new DRAFT v2 (it does NOT mutate v1, and never
      // publishes). On a fresh DB it creates v1 and this flag is a harmless no-op.
      { forceSupersedeDraft: true }
    );

    await ensureAccessGroupAndTemplateLink(
      tx,
      seedResult.templateId,
      "Scaling Up Coaches",
      sys.id
    );

    return { ...seedResult };
  }, {
    maxWait: 30_000,
    timeout: 60_000,
  });

  console.log(
    JSON.stringify({
      seed: "scaling-up-full-assessment",
      action: result.action,
      templateId: result.templateId,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      contentHash: result.contentHash,
      message:
        result.action === "created"
          ? `Appended DRAFT v${result.versionNumber}.`
          : `No-op — latest v${result.versionNumber} already matches.`,
    })
  );
}

// Only run when executed directly (not when imported by tests).
if (require.main === module) {
  main()
    .catch((err) => {
      console.error("[seed-scaling-up-full-assessment] FAILED:", err);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
