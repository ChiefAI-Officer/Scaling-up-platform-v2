/**
 * Seed: Scaling Up Full Assessment Template (v1)
 *
 * Creates an AssessmentTemplate (alias "scaling-up-full") plus its first
 * AssessmentTemplateVersion (language "enUS") with 5 domains, 10 sections,
 * and 61 SLIDER_LIKERT questions (0-10 scale), each with a 3-band
 * recommendation set (LOW / MEDIUM / HIGH).
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

const db = new PrismaClient();

// ─── Constants ───────────────────────────────────────────────────────────

export const ALIAS = "scaling-up-full";
export const NAME = "Scaling Up Full Assessment";
export const VERSION_NUMBER = 1;
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
// Placeholder thresholds pending Jeff's confirmation. Tiles [0, 10] without
// gaps and without overlap — the engine requires "touching" tier boundaries
// (b.minMetric === a.maxMetric) so fractional rollup values resolve cleanly.
// Tier resolution is first-match-wins: a value equal to a boundary lands in
// the LOWER tier.
const TIERS = [
  {
    minMetric: 0,
    maxMetric: 3,
    label: "Critical",
    message:
      "Significant gaps across this area. Most fundamentals are not yet in place; this is where the biggest leverage is right now.",
  },
  {
    minMetric: 3,
    maxMetric: 5,
    label: "At Risk",
    message:
      "Foundations are partially in place but inconsistent. Focused work over the next quarter will move the needle quickly.",
  },
  {
    minMetric: 5,
    maxMetric: 7,
    label: "On Track",
    message:
      "Solid footing with clear room to strengthen. Pick the two or three sub-areas that drag the average down and tighten them.",
  },
  {
    minMetric: 7,
    maxMetric: 10,
    label: "Strong",
    message:
      "This area is well-developed. Continue to invest in maintaining excellence while focusing your incremental energy elsewhere.",
  },
] as const;

// Domains use the same tier shape as the global rollup.
const DOMAIN_TIERS = TIERS;

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
  passThreshold: 7,
  tiers: TIERS,
  rollup: { overall: "meanOfDomains" },
  scaleUpScore: true,
  domains: DOMAINS,
} as const;

// Auto-generated from matrix.xlsx + sample PDF narrative extraction.
// Source: From Jeff/APP_scaling up assessemnt/other samples/
// Extraction date: 2026-05-19
// 61 questions, full 3-band narrative coverage

interface QuestionSeedDef {
  label: string;
  section: string;
  low: string;
  mid: string;
  high: string;
}

const QUESTION_DEFS: QuestionSeedDef[] = [
  {
    label: "Effective recruitment process",
    section: "S_PEOPLE_YE",
    low: "In order to grow, you continuously need new - and good - people. This is often one of the most important challenges for a growth entrepreneur. You indicate that when it comes to finding new employees you find this very difficult. Ultimately, this is a matter of process, attention and time, often especially on the part of the entrepreneur. How much time do you spend on this? More than one day per week?",
    mid: "In order to grow, you continuously need new - and good - people. This is often one of the most important challenges for a growth entrepreneur. You indicate that when it comes to finding new employees you find this difficult. Ultimately, this is a matter of process, attention and time, often especially on the part of the entrepreneur. How much time do you spend on this? More than one day per week?",
    high: "In order to grow, you continuously need new - and good - people. This is often one of the most important challenges for a growth entrepreneur. You indicate that when it comes to finding new employees you have this reasonably well under control. That's great. This probably has to do with the time and attention you give this and your network. Try to keep this up when you continue to grow.",
  },
  {
    label: "High staff retention",
    section: "S_PEOPLE_YE",
    low: "Your employee turnover is high. Unwanted turnover is often a sign that processes, strategy or management are not in order. It takes an enormous amount of money and effort to continually find and train new employees. Find out what the reasons are, hold exit interviews and ask yourself whether you yourself would want to work at your company.",
    mid: "Your employee turnover is relatively high. Unwanted turnover is often a sign that processes, strategy or management are not in order. It takes an enormous amount of money and effort to continually find and train new employees. Find out what the reasons are, hold exit interviews and ask yourself whether you yourself would want to work at your company.",
    high: "Your employee turnover is low. Unwanted turnover is often a sign that processes, strategy or management are not in order. It takes an enormous amount of money and effort to continually find and train new employees. This is hardly a problem for you. That's a good sign. Keep a close eye on this and hold exit interviews with people who leave.",
  },
  {
    label: "Onboarding program",
    section: "S_PEOPLE_YE",
    low: "Employees do not receive a comprehensive onboarding program at your company. While this is understandable for a company of your size, a well-thought-out onboarding program will be an enormous help to employees with regard to learning their job, becoming familiar with the company's core values and getting to know their coworkers. It will help enormously with scaling up your company. It might be good to start thinking about this already.",
    mid: "Not all employees receive an onboarding program at your company. That really is necessary with a company of your size. A well-thought- out onboarding program will be an enormous help to employees with regard to learning their jobs, becoming familiar with the company's core values and getting to know their coworkers. It will also help with scaling up your company. We recommend that you start taking steps toward this.",
    high: "Employees do receive a type of onboarding program at your company. That's good, because a well-thought-out onboarding program will be an enormous help to employees with regard to learning their jobs, becoming familiar with the company's core values and getting to know their coworkers. It will also help with scaling up your company.",
  },
  {
    label: "Measuring employee satisfaction",
    section: "S_PEOPLE_YE",
    low: "You do not yet measure employee satisfaction. That's understandable with a company of your size. You usually know quite well what's going on. This is something for the next phase.",
    mid: "You don't yet systematically measure employee satisfaction. Your company is in the phase where you need to have a systematic understanding of what's going on among your employees. An employee survey is probably a good start in this respect.",
    high: "You already measure employee satisfaction. That's remarkable for a relatively small company and a good thing! After all, measuring is knowing.",
  },
  {
    label: "Positive about re-hiring employees",
    section: "S_PEOPLE_YE",
    low: "You would hire few or none of your current employees again. Ouch. This means that you have either postponed a lot of difficult decisions or you simply have a very bad hiring policy. You should work on this, because without good employees you can't grow.",
    mid: "You would hire few of your current employees again. Ouch. This means that you have either postponed a lot of difficult decisions or you simply have a very bad hiring or development policy. You should work on this, because without good employees you can't grow.",
    high: "You would not hire all of your current employees again. That's not illogical. Sometimes the company changes so fast and employees cannot continue on. But do you already have a plan? Often you know something like this for a long time but postpone difficult decisions.",
  },
  {
    label: "Every employee has a training plan",
    section: "S_PEOPLE_YE",
    low: "Management thinker Tom Peters stated in his latest book 'one of the greatest responsibilities of an employer nowadays is the continuous development of employees'. In fast growing companies, roles are continuously changing, the need for training and education is therefore imperative. In your phase it is logical that this is not up to par, but you might want to start thinking about it.",
    mid: "Management thinker Tom Peters stated in his latest book 'one of the greatest responsibilities of an employer nowadays is the continuous development of employees'. In fast growing companies, roles are continuously changing, the need for training and education is therefore imperative. You have this partially executed. You might want to start thinking about bringing it up to par.",
    high: "Management thinker Tom Peters stated in his latest book 'one of the greatest responsibilities of an employer nowadays is the continuous development of employees'. In fast growing companies, roles are continuously changing, the need for training and education is therefore imperative. You are already working on this. Well done.",
  },
  {
    label: "Outsourcing / Offshoring operations",
    section: "S_PEOPLE_YE",
    low: "You are not active with offshoring or outsourcing, this strategy is completely depending on your product/service, cost and scaling strategy.",
    mid: "You are somewhat active with offshoring or outsourcing, this strategy is completely depending on your product/service, cost and scaling strategy",
    high: "You are active with offshoring or outsourcing, this strategy is completely depending on your product/service, cost and scaling strategy.",
  },
  {
    label: "We apply flat-management or self-steering/organizing teams",
    section: "S_PEOPLE_YE",
    low: "You have not implemented new management models, when things work for you, don't change.",
    mid: "You have somewhat implemented new management models. With your company size it is risky to experiment. Please note that changing management models often has great impact on people and culture. Mostly positive, but not always.",
    high: "You are active with the implementation of new management models. Interesting, we hope this helps scaling your company better and faster.",
  },
  {
    label: "We have Core values",
    section: "S_PEOPLE_CC",
    low: "Core values are the internal 'rules of the game'. It's essential to have this very clear if you start growing quickly, but in small organizations it's often not yet necessary to make this explicit.",
    mid: "Core values are the internal 'rules of the game'. It's essential to have absolute clarity on this if you start or continue to grow rapidly. In your phase it's necessary to have a clearer picture on the core values, especially if you regularly hire new people. You have started on this. Finish, refine and communicate, is what we recommend.",
    high: "Core values are the internal 'rules of the game'. It's essential to have this very clear if you start growing quickly, but in small organizations it's often not yet necessary to make this explicit. But you have certainly come a long way. Try to critically examine the core values on a regular basis. A lot always changes in a small organization.",
  },
  {
    label: "We have focus on customers' needs",
    section: "S_PEOPLE_CC",
    low: "Growth often creates increased management attention to internal matters, employees, newpremises, computersystems, etc.Themost rapidly growing and successful companies keep a sharp focus on the continuously (changing) needs of the customer. Making and keeping this focus and attention explicit is important, especially in this phase of your company.",
    mid: "Growth often creates increased management attention to internal matters, employees, newpremises, computersystems, etc.Themost rapidly growing and successful companies keep a sharp focus on the continuously (changing) needs of the customer. Making and keeping this focus and attention explicit is important, especially in this phase of your company.",
    high: "Growth often creates increased management attention to internal matters, employees, newpremises, computersystems, etc.Themost rapidly growing and successful companies keep a sharp focus on the continuously (changing) needs of the customer. You have already gotten far; keep it up!",
  },
  {
    label: "Employees know core values",
    section: "S_PEOPLE_CC",
    low: "You have not formulated any core values. That's less important in your phase. Because of the small team, everyone subconsciously knows what's important. However, if you grow and hire new employees, it will be increasingly important to make this explicitly clear.",
    mid: "You have formulated core values; however, if these are not paid continuous attention - especially when you grow and regularly hire employees - these will not be effective. In your phase, it's really essential to work hard on this. Start with regular communication and create dialogue around these core values.",
    high: "You have formulated core values, and your employees are reasonably familiar with them. That's very good in your phase. This will be increasingly important as you grow. Therefore, keep these values alive.",
  },
  {
    label: "We are transparent",
    section: "S_PEOPLE_CC",
    low: "Transparency of information (about customers, sales, goals, growth, etc.) produces greater employee involvement. In addition, it often prevents internal \"politics\". It would be beneficial for you to start considering what information you are willing to share.",
    mid: "Transparency of information (about customers, sales, goals, growth, etc.) produces greater employee involvement. In addition, it often prevents internal \"politics\". It would be good if you could start thinking about what information you are even more willing to share.",
    high: "Transparency of information (about customers, sales, goals, growth, etc.) produces greater employee involvement. In addition, it often prevents internal \"politics\". You have already achieved reasonable transparency, which is good. Maybe you can increase this transparency even more by examining what information you want to share.",
  },
  {
    label: "We have a positive and healthy culture",
    section: "S_PEOPLE_CC",
    low: "\"Culture eats Strategy for breakfast\" is a famous quote from management guru Peter Drucker. The outside world is changing rapidly, but a positive and healthy culture in which employees take responsibility, think along and always act in the interest of the company is therefore an enormous \"asset\". You still have a small company, but it would be good to start working on such a culture already now.",
    mid: "\"Culture eats Strategy for breakfast\" is a famous quote from management guru Peter Drucker. The outside world is changing rapidly, but a positive and healthy culture in which employees take responsibility, think along and always act in the interest of the company is therefore an enormous \"asset\". Given your size, it is very important that you quickly start working on such a culture even more consciously.",
    high: "\"Culture eats Strategy for breakfast\" is a famous quote from management guru Peter Drucker. The outside world is changing rapidly, but a positive and healthy culture in which employees take responsibility, think along and always act in the interest of the company is therefore an enormous \"asset\". You still have a small business and you have made a good start with your culture, make sure you stick with it as you grow.",
  },
  {
    label: "We have formulated a long term (non-financial) goal",
    section: "S_STRATEGY",
    low: "You have not yet formulated a clear long-term goal. That's too bad, because a long-term goal provides direction and context and above all motivation for all employees. Companies that do this effectively are at an enormous advantage.",
    mid: "You have not yet formulated a clear long-term goal, but you have begun to do so. That's great, because a long-term goal provides direction and context and above all motivation for all employees. Companies that do this effectively are at an enormous advantage. Good luck formulating your goal!",
    high: "You have already come far with the formulation of your long-term goal. That's great, because a long-term goal provides direction and context and above all motivation for all employees. Companies that do this effectively are at an enormous advantage. Good luck formulating your goal.",
  },
  {
    label: "We have formulated yearly goals",
    section: "S_STRATEGY",
    low: "The clearer and more measurably you formulate your goals (both financially and organizationally or with regard to product or market development), the higher the chance that you will also achieve those goals. This will have a clarifying and motivating effect and ensure growth. It's time to get started!",
    mid: "You do not yet formulate clear, measurable annual goals. The clearer and more measurably you formulate your goals (both financially and organizationally or with regard to product or market development), the higher the chance that you will also achieve those goals. This will have a clarifying and motivating effect and ensure growth. Given the size of your company, we recommend that you implement this as soon as possible.",
    high: "You are already doing a good job of formulating measurable annual goals. That's good news. The clearer and more measurably you formulate your goals (both financially and organizationally or with regard to product or market development), the higher the chance that you will also achieve those goals. This will have a clarifying and motivating effect and ensure growth.",
  },
  {
    label: "We have formulated quarterly/ monthly goals (other than financial goals)",
    section: "S_STRATEGY",
    low: "You have no monthly or quarterly goals. Ouch. Monthly or quarterly goals give you guidance and direction and ensure that you will achieve your annual goals. Think of them as \"small sprints\" that you have to win in order to achieve your annual goal. Fast growers are very disciplined in this process.",
    mid: "You have started setting measurable monthly or quarterly goals. Given the size of your company, it's important to continue to implement this quickly. After all, monthly or quarterly goals give you guidance and ensure that you will achieve your annual goals. Think of them as \"small sprints\" that you have to win in order to achieve your annual goal. Fast growers are very disciplined in this process.",
    high: "You have already come far with measurable monthly or quarterly goals. That's great, because monthly or quarterly goals give you guidance and direction and ensure that you will achieve your annual goals. Try making this into a regular process.",
  },
  {
    label: "We work with a strategic plan",
    section: "S_STRATEGY",
    low: "You do not yet have a business plan. Maybe this isn't necessary yet in your phase. But establishing your goals, strategy and action plan can bring about a lot of clarity and teach you to anticipate certain challenges.Whenshouldyouhiresomeone?Whatwillthemarketing strategy be? You have to make many difficult choices; a complete overview and plan will help you with this.",
    mid: "You have started putting together a business plan. Given the size of your company this seems quite late. Establishing your goals, strategy and action plan can bring about a lot of clarity and teach you to anticipate certain challenges. When should you hire someone? What will the marketing strategy be? You have to make many difficult choices; a complete overview and plan will help you with this, including in the financial aspect.",
    high: "You have already come far with working with a business plan; that's good. Establishing your goals, strategy and action plan can bring about a lot of clarity and teach you to anticipate certain challenges. When should you hire someone? What will the marketing strategy be? You have to make many difficult choices; a complete overview and plan will help you with this.",
  },
  {
    label: "Each employee has personalized goals",
    section: "S_STRATEGY",
    low: "You haven't started working on personal goals yet. Team goals and personal goals are the next step in working efficiently. This creates clarity, commitment, personal responsibility and motivation. Think about how this would work at your company.",
    mid: "You have started working on personal goals; that's good. Team goals and personal goals are the next step in working efficiently. This creates clarity, commitment, personal responsibility and motivation. Good luck working out your personal goals in further detail.",
    high: "You have already come far with implementing personal goals; that's good. Team goals and personal goals are the next step in working efficiently. This creates clarity, commitment, personal responsibility and motivation. Good luck with your continued implementation.",
  },
  {
    label: "We have implemented a growth methodology",
    section: "S_STRATEGY",
    low: "You have not yet implemented a growth methodology. That is logical in the phase that your company is in. However, it's never too early to start thinking about that.",
    mid: "Youhavesomewhatimplementedagrowthmethodology.Thelarger you grow, the more difficult it is to implement new ways of working. Now would be the time to speed up implementation of the type of leadership, systems and processes that will propel your growth.",
    high: "You are actively implementing a growth methodology. Good work! This will create a strong foundation for your future scaling up.",
  },
  {
    label: "We have an active acquisitions strategy",
    section: "S_STRATEGY",
    low: "You are not active with acquisitions, that seems logical for the company your size.",
    mid: "You are somewhat active with acquisitions or maybe you are considering it. Please understand that acquisitions consume much leadership time and attention. Note that 70% of the acquisitions turns out to be disappointing.",
    high: "You are active with acquisitions, that seems illogical for the company your size.",
  },
  {
    label: "Tasks are properly allocated",
    section: "S_EXEC_LT",
    low: "You do not yet have an efficient leadership team. That's not unusual in your phase. However, for the next growth step you should start thinking about the form and composition of the management. This will help you create more involvement and make the company less dependent on you.",
    mid: "You do not yet have an efficient leadership team. That's very problematic in your phase. Decisions must increasingly be discussed, made, accounted for and above all implemented by the group. Now you are doing most of it yourself, which places unjustified pressure on you as an entrepreneur, manager and leader.",
    high: "You are already doing well with assembling a leadership team. This will help you create more involvement and make the company less dependent on you.",
  },
  {
    label: "We have weekly management meetings.",
    section: "S_EXEC_LT",
    low: "You have not yet implemented a weekly leadership meeting. In order to create structure, it's good to implement a regular management meeting and systematically determine decisions and actions.",
    mid: "You occasionally have meetings with your leaders. This seems very unusual given the size of your company. You should implement a set schedule and systematically make all decisions. Having regular weekly meetings with your most important leaders is essential for making the right decisions together and monitoring progress.",
    high: "You have leadership meetings on a regular basis. However, weekly management meetings seem to be best. You should consider the weekly meeting primarily as a system for making decisions together and monitoring progress.",
  },
  {
    label: "We have periodic strategic sessions.",
    section: "S_EXEC_LT",
    low: "You do not yet have strategic sessions. It is important - including in your phase - to involve employees in your long-term planning. That's why you should start planning strategic sessions with all - or your most important - employees.",
    mid: "You occasionally have sessions where you develop longer-term plans. Regular mutual consultation about the strategic direction of the company often leads to more effective operations, wider acceptance of decisions and therefore growth.",
    high: "You have regular sessions where you develop longer-term plans. That's good. Regular mutual consultation about the strategic direction of the company often leads to more effective operations, wider acceptance of decisions and therefore growth.",
  },
  {
    label: "Leadership team receives regular training",
    section: "S_EXEC_LT",
    low: "When your organization is growing rapidly and therefore constantly changing, it is important - even at smaller organizations - for everyone to continue learning. We advise you to start doing this.",
    mid: "Training and education for your organization's leadership team is not yet in order. It's time to improve this situation.",
    high: "Most members get training or education from time to time. That's a good start. After all, when your organization is growing rapidly and therefore constantly changing, it is important - even at smaller organizations - for everyone to continue learning.",
  },
  {
    label: "Our goals are translated into clear KPIs",
    section: "S_EXEC_OP",
    low: "Making goals measurable is an important step towards creating personal accountability and professionalizing processes. This includes numbers of leads, received applications, IT development, etc. With a company of your size this is usually still a step too early, but it is perhaps something to think about if you start to grow.",
    mid: "You have already started working on making your goals measurable. That's great; this is an important step towards creating personal accountability and professionalizing processes. This includes numbers of leads, received applications, IT development, etc. This can be especially important if you grow, in order to keep everything under control.",
    high: "You have already gotten far with making your goals measurable. That's great; this is an important step towards creating personal accountability and professionalizing processes. This includes numbers of leads, received applications, IT development, etc. This can be especially important if you grow, in order to keep everything under control.",
  },
  {
    label: "We use real-time data to measure our performance",
    section: "S_EXEC_OP",
    low: "Because of the size of your company, perhaps you know exactly \"what's going on\". However, if you start to grow you will have to have up-to-date information available, both for yourself as well as for your employees. It's time to think about this.",
    mid: "You have started creating accurate data for guiding your company. That's good, but you should continue down this path because otherwise this will likely increasingly lead to mistakes, wrong decisions and problems and later - if you continue to grow - you'll inevitably end up in trouble.",
    high: "You have already gotten far with creating accurate data to use to guide your company. That's a good initiative and essential for controlling your continued growth.",
  },
  {
    label: "We grow with limited mistakes, errors and problems",
    section: "S_EXEC_OP",
    low: "Work pressure and lack of process often lead to coordination problemsandmistakes.That'sashameandcouldpotentiallydamage your reputation among customers. It's time to take stock of the processes and make clear arrangements. If you don't like doing this yourself, ask an employee to make this number one priority. If you don't resolve this, it will only get worse.",
    mid: "You have started coordinating and standardizing, but things still go wrong on a regular basis. It's time to pay even more attention to taking stock of processes and making clear agreements. This is necessary for handling the next growth phase. Scalability is created by standardization, among other things.",
    high: "Few things go wrong. Do ensure that your processes also run flawlessly if you start to grow. This is not often the case.",
  },
  {
    label: "We measure customer satisfaction",
    section: "S_EXEC_OP",
    low: "You do not yet measure customer satisfaction. That's too bad, because this provides important input for the further development of your products and processes. In any case, you should try having regular contact with customers to find out what you can improve.",
    mid: "You have started occasionally measuring your customers' satisfaction. That's great. Try to \"institutionalize\" this process and see what you can improve every day, week or month.",
    high: "You have already gotten far with measuring your customers' satisfaction. That's great. Try to \"institutionalize\" this process and see what you can improve every day, week or month.",
  },
  {
    label: "We have systematic processes for continuous improvement",
    section: "S_EXEC_OP",
    low: "A system to prevent mistakes and take stock of complaints/feedback is usually not really necessary yet for a company of your size. However, when you start to grow and hire new people, it's often good to structure work processes and set up a system of quality checks and customer feedback. Preventing mistakes is usually significantly cheaper than continually fixing them.",
    mid: "You are already doing something in the area of quality management, and that's good. At your level it's good to structure work processes and set up a system of quality checks and customer feedback. Preventing mistakes is usually significantly cheaper than continually fixing them.",
    high: "Even with size of your company, you are already active in the area of quality management. That's good. This will help with the scalability of the organization in the face of continued growth.",
  },
  {
    label: "We have an effective lead generation process",
    section: "S_EXEC_SM",
    low: "To grow you need new customers. Often sales are very dependent on the entrepreneur with a company of your size. Then it's wise to start thinking about a lead generation system and process.",
    mid: "You have already started a lead generation process. That's a good initiative. With a company of your size, allowing the acquisition of new customers to only depend on the entrepreneur or on coincidence is dangerous. For continued growth, it would be wise to implement an effective process and system for this.",
    high: "You have already gotten far with a lead generation process. That's a good initiative. Often sales are very dependent on the entrepreneur with a company of your size. That's why an independent system and process is so important for continued growth.",
  },
  {
    label: "Sales achievement",
    section: "S_EXEC_SM",
    low: "Having and achieving targets is, of course, the basis for business success and growth. At successful companies this correlation is no coincidence. The sales process will often consist of a combination of targets, bonus schemes, lead generation as well as weekly meetings, coaching, training, motivational sessions, etc. It might be good to start thinking about this already.",
    mid: "Having and achieving targets is, of course, the basis for business success and growth. At successful companies this correlation is no coincidence. The sales process will often consist of a combination of targets, bonus schemes, lead generation as well as weekly meetings, coaching, training, motivational sessions, etc. It might be good to think about how you can improve this at your company.",
    high: "Having and achieving targets is, of course, the basis for business success and growth. At successful companies this correlation is no coincidence. The sales process will often consist of a combination of targets, bonus schemes, lead generation as well as weekly meetings, coaching, training, motivational sessions, etc. You are already well on the way. It might be good to think about what improvements you can make, so you can grow even faster.",
  },
  {
    label: "Weekly sales meeting",
    section: "S_EXEC_SM",
    low: "Stimulating sales is hardly possible without a disciplined process. A weekly sales meeting in which successes as well as setbacks and lessonslearnedaresharedisanimportantpartofthesuccessoffast- growing companies. Often there are also one-on-one meetings with individual sales reps - if applicable. It's time to start with this.",
    mid: "Stimulating sales is hardly possible without a disciplined process. A weekly sales meeting in which successes as well as setbacks and lessonslearnedaresharedisanimportantpartofthesuccessoffast- growing companies. Often there are also one-on-one meetings with individual sales reps - if applicable. It's time to quickly get this to a higher level.",
    high: "You have already gotten far with a disciplined sales process. A weekly sales meeting in which successes as well as setbacks and lessonslearnedaresharedisanimportantpartofthesuccessoffast- growing companies. Often there are also one-on-one meetings with individual sales reps - if applicable. This is very important for making your growth scalable.",
  },
  {
    label: "Head of sales is not the entrepreneur",
    section: "S_EXEC_SM",
    low: "With a company of your size, the entrepreneur is often in charge when it comes to sales. With the increasing pressure on general management tasks, it's good to ensure that you as an entrepreneur free up sufficient time for this. If this is not the case, you will have to start making choices.",
    mid: "Also, you can only commit your time once as an entrepreneur. That also applies to sales management. With the increasing pressure on general management tasks, it's good to ensure that you as an entrepreneur free up sufficient time for this. If this is not the case, you will have to start making choices.",
    high: "As an entrepreneur, you are no longer solely in charge when it comes to sales. That's wise, as this allows the sales process to continue scaling up while you, as an entrepreneur, deal with more general management tasks.",
  },
  {
    label: "We have an effective PR/communication strategy",
    section: "S_EXEC_SM",
    low: "Nowadays sales and marketing strategies are usually accompanied with an effective content-based communication strategy. This is something you might want to think about.",
    mid: "Nowadays sales and marketing strategies are usually accompanied with an effective content-based communication strategy. You might want to think about implementing this a bit stronger.",
    high: "Nowadays sales and marketing strategies are usually accompanied with an effective content-based communication strategy. You are active with this strategy. Well done, this might create growth opportunities.",
  },
  {
    label: "Most processes are automated",
    section: "S_EXEC_SIT",
    low: "In order to scale, smart application and linking of information technology is essential. Sales, marketing, project management, production, humanresources, reporting, etc.Thisgivesstructureand clarity, prevents mistakes and makes growing a lot easier. With the size of your company, a lot of systems likely still work independently of each other, or you primarily use Excel. This is customary, but in your next growth phase you will have to start thinking about smart solutions.",
    mid: "In order to scale, smart application and linking of information technology is essential. Sales, marketing, project management, production, humanresources, reporting, etc.Thisgivesstructureand clarity, prevents mistakes and makes growing a lot easier. You have partial automation and a lot of systems probably still work independently of each other. However, with the size of your company, you will quickly have to start thinking about smart (integrated) solutions.",
    high: "In order to scale, smart application and linking of information technology is essential. Sales, marketing, project management, production, humanresources, reporting, etc.Thisgivesstructureand clarity, prevents mistakes and makes growing a lot easier. A lot of processes are already being supported by automation at your company. That's great. In the next growth phase, you should also start thinking about integration of the systems.",
  },
  {
    label: "Systems prepped for growth",
    section: "S_EXEC_SIT",
    low: "Your systems are not yet prepared for growth. When you grow, a lot changes at the same time: systems, structures, people, processes, etc. It helps a lot when your systems can handle this growth. Otherwise it's sort of like changing the tires while driving!",
    mid: "If you grow, a lot changes at the same time: systems, structures, people, processes, etc. It helps a lot when your systems can handle this growth. Otherwise it's sort of like changing the tires while driving! We advise you to quickly start \"thinking ahead\" in terms of structures and systems.",
    high: "When you grow, a lot changes at the same time: systems, structures, people, processes, etc. It helps a lot when your systems can handle this growth. It looks like you have got this under control. Super. Keep growing!",
  },
  {
    label: "Better systems than competitors",
    section: "S_EXEC_SIT",
    low: "Many fast growers have invested in information technology systems that help them be better, smarter, more efficient and more market- oriented than their competitors. You don't have any systems that are better than most of your competitors. Where might IT be able to help you?",
    mid: "Many fast growers have invested in information technology systems that help them be better, smarter, more efficient and more market- oriented than their competitors. You have few systems that are better than most of your competitors. Where might IT be able to help you?",
    high: "Many fast growers have invested in information technology systems that help them be better, smarter, more efficient and more market- oriented than their competitors. It looks like you pay the same attention to IT systems. That's promising! How can you continue to exploit this advantage?",
  },
  {
    label: "Knowledge on latest technology",
    section: "S_EXEC_SIT",
    low: "As an entrepreneur, you always have 1001 focus areas You must keep an eye on technological developments that could enormously affect your business model or company efficiency. You should devote time to this on a regular basis.",
    mid: "As an entrepreneur, you always have 1001 focus areas. You must keep an eye on technological developments that could enormously affect your business model or company efficiency. You could spend more time on this.",
    high: "As an entrepreneur, you always have 1001 focus areas. You keep a relatively good eye on technological developments that could enormously affect your business model or company efficiency. Keep a close eye on this.",
  },
  {
    label: "We are more innovative than competitors",
    section: "S_EXEC_SIT",
    low: "In this world, where developments are super fast, you can quickly be made less relevant by a competitor if you don't pay attention (for example, by focusing too much on internal issues). It is wise to continuously make improvement and innovation part of the organization's DNA.",
    mid: "In this world, where developments are super fast, you can quickly be made less relevant by a competitor if you don't pay attention (for example, by focusing too much on internal issues). It is wise to continuously make improvement and innovation part of the organization's DNA.",
    high: "In this world, where developments are super fast, you can quickly be made less relevant by a competitor if you don't pay attention (for example, by focusing too much on internal issues). You have a good focus on innovation. Keep this up, even when you are growing.",
  },
  {
    label: "Our business model is disruptive",
    section: "S_EXEC_SIT",
    low: "You do not have a disruptive business model. Keep your eyes open for newcomers in your market. Or you might want to think creating a disruptive model yourself.",
    mid: "You have somewhat of a disruptive business model. That might gold. Further validation, speed and scaling up of the model are the things that now matter most.",
    high: "You have a somewhat disruptive business model. That is gold. Speed and scaling up are the things that now matter most.",
  },
  {
    label: "Real time financial insights",
    section: "S_CASH",
    low: "You have no up-to-date knowledge of sales and costs. For a growth company, this is the same as driving 90 mph with a blindfold on. Maybe this should be your first priority to tackle tomorrow.",
    mid: "You hardly have any up-to-date knowledge of sales and costs. For a growth company, this is the same as driving 90 mph with a blindfold on. Maybe this should be your first priority to tackle tomorrow.",
    high: "You have a reasonably up-to-date picture of your sales and costs. That's good; your aim should be to always have a clear picture of these items.",
  },
  {
    label: "Up-to-date cashflow planning",
    section: "S_CASH",
    low: "You don't employ cash flow planning. As a small business, you always have to look ahead a few months with regard to your cash flow, as otherwise you'll inevitably end up in trouble, especially if you grow.",
    mid: "You don't employ strict cash flow planning. As a small business, you always have to look ahead a few months with regard to your cash flow, as otherwise you'll inevitably end up in trouble, especially if you grow.",
    high: "You have a fair picture of your cash flow. That's good. You have to be able to look ahead a few months. Especially if you grow; no surprises!",
  },
  {
    label: "Access to growth capital",
    section: "S_CASH",
    low: "You have no access to growth capital. This isn't a problem, unless you want to grow a lot. After all, growth gobbles up cash. You could create a list of the various alternatives (friends/fools/family, the bank, factoring, SME bonds, crowd funding, angel investors, private equity, Government Funding, etc.). There are a lot of service providers who can help you with this.",
    mid: "You have no clear picture of your access to growth capital. This isn't a problem, unless you want to grow a lot. After all, growth gobbles up cash. You could create a list of the various alternatives (friends/fools/family, thebank, factoring, SMEbonds, crowdfunding, angel investors, private equity, Government Funding, etc.). There are a lot of service providers who can help you with this.",
    high: "You have reasonable access to growth capital. That's encouraging, especially if you want to grow. Growth always gobbles up cash. Also think about all the alternatives, such as friends/fools/family, the bank, factoring, SME bonds, crowd funding, angel investors, private equity, Government Funding, etc.). There are a lot of service providers who can help you with this.",
  },
  {
    label: "Financial alert function",
    section: "S_CASH",
    low: "It is crucial to have \"early warning systems\" with regard to financial parameters. The faster you can intervene or take measures, the better. You indicate that this is not the case at your company. That's dangerous. What are you going to do about it?",
    mid: "It is crucial to have \"early warning systems\" with regard to financial parameters. The faster you can intervene or take measures, the better. You indicate that this is not always the case at your company. That's dangerous. What are you going to do about it?",
    high: "You indicate that your \"early warning system\" for financial parameters is in order. The faster you can intervene or take measures, the better. But why isn't your score \"perfect\" yet? What are you going to do about it?",
  },
  {
    label: "Leadership understands balance sheet",
    section: "S_CASH",
    low: "Reading and understanding a balance sheet appears to be a tricky thing for many entrepreneurs. While a balance sheet is a smart blueprint that can expose the dynamics and growth potential behind your company. With a company of your size this is not a priority, but if you grow you should spend a good amount of time and attention on this.",
    mid: "Reading and understanding a balance sheet appears to be a tricky thing for many entrepreneurs. While a balance sheet is a smart blueprint that can expose the dynamics and growth potential behind your company. With a company of your size this is not a priority, but if you grow you should spend a good amount of time and attention on this.",
    high: "Reading and understanding a balance sheet appears to be a tricky thing for many entrepreneurs. While a balance sheet is a smart blueprint that can expose the dynamics and growth potential behind your company. You are already fairly good at this. This will become increasingly important, especially if you grow.",
  },
  {
    label: "CEO works on the company and is able to remove from daily operations",
    section: "S_YOU_LEAD",
    low: "In this phase you work fully in your company. Perhaps that's logical, since without you there would be no sales. But if you don't put in any time to work on your company as well (systems, structures, processes, management, etc.), then it will be difficult to grow. When do you start?",
    mid: "In this phase you work in your company to a large extent. If you don't put in any time to work on your company as well (systems, structures, processes, management, etc.), then it will be difficult to grow. When do you start?",
    high: "In this phase you work on your company to a great extent. On to strong growth!",
  },
  {
    label: "Have a mentor",
    section: "S_YOU_LEAD",
    low: "You indicate that you have no mentor. It can be difficult to see when you are stuck. Sometimes choices are a challenge, or you have simply reached the end of your tether. Maybe you need to change to guide the company to its next phase? Whatever it may be, this is where a mentor can be of great assistance.",
    mid: "You don't really have a permanent mentor. It can be difficult to see when you are stuck. Sometimes choices are a challenge, or you have simply reached the end of your tether. Maybe you need to change to guide the company to its next phase? Whatever it may be, this is where a mentor can be of great assistance.",
    high: "It can be difficult to see when you are stuck. Sometimes choices are a challenge, or you have simply reached the end of your tether. Maybe you need to change to guide the company to its next phase? Whatever it may be, this is where a mentor can be of great assistance. Good that you have one!",
  },
  {
    label: "Have an entrepreneurial network",
    section: "S_YOU_LEAD",
    low: "Most entrepreneurs experience the same challenges, highs and lows. Other entrepreneurs you know can often be of great assistance with their experiences. We recommend that you actively look for and invest time in a network of entrepreneurs.",
    mid: "Most entrepreneurs experience the same challenges, highs and lows. Other entrepreneurs you know can often be of great assistance with their experiences. We recommend that you actively look for and invest more time in a good network of entrepreneurs.",
    high: "Most entrepreneurs experience the same challenges, highs and lows. Other entrepreneurs you know can often be of great assistance with their experiences. You have a network of entrepreneurs that you can consult; well done.",
  },
  {
    label: "Enjoy management of company",
    section: "S_YOU_LEAD",
    low: "Many entrepreneurs discover that management costs time and energy and is a \"skill\" that requires development. You don't like it. Therefore, you should examine where your strength lies; perhaps it would be better to hire an operations manager directly.",
    mid: "You don't really like managing. Many entrepreneurs find out that managing people costs a lot of time and energy. With a company of your size you probably work with a management team and/or a second-in-command who is good in operations. The challenge is for you not to get in their way and to focus fully on the future of the company.",
    high: "You like managing somewhat. That's handy because if your company has eight or more employees, you will have to continually develop these skills.",
  },
  {
    label: "Energized by team and company",
    section: "S_YOU_LEAD",
    low: "It is not unusual for entrepreneurs to become \"sick\" of their company after about seven years. Employees can change jobs or companies. Entrepreneurs can't. The best solution that doesn't cost money but does deliver is to let your company grow rapidly. Then every year is different.",
    mid: "It is not unusual for entrepreneurs to become \"sick\" of their company after about seven years. Employees can change jobs or companies. Entrepreneurs can't. The best solution that doesn't cost money but does deliver is to let your company grow hard (again); then every year is different.",
    high: "You still get energy from your company. That's great; use all this energy to let your company grow.",
  },
  {
    label: "Absence of CEO is possible",
    section: "S_YOU_LEAD",
    low: "You can't leave without things going wrong. You have made the company, the processes and the people too dependent on you. That's not scalable and causes you in particular a lot of work, stress and likely also annoyance. We recommend that you start working on standardization, establishing processes and probably also on hiring better people.",
    mid: "You still can't leave without some things going wrong. You have made the company, the processes and the people too dependent on you. That's not scalable and causes you in particular a lot of work, stress and likely also annoyance. We recommend that you start workingonstandardization, establishingprocessesandprobablyalso on hiring better people.",
    high: "You can easily leave for three weeks without things going completely wrong. That's quite an accomplishment. You probably have an excellent team working for you, as well as standardized processes. That's a nice scalable model for growth.",
  },
  {
    label: "Read business books",
    section: "S_YOU_LEAD",
    low: "You never read management books. That's a shame, because in order to grow it will be imperative to have skills, ideas and insights that were documented by others years ago. And don't forget: \"stagnant water will stink.\" This also applies to businesses.",
    mid: "You don't often read management books. That's a shame, because in order to grow it will be imperative to have skills, ideas and insights that were documented by others years ago. And don't forget: \"stagnant water will stink.\" This also applies to businesses.",
    high: "You occasionally read management books. That's great, because in order to grow it will be imperative to have skills, ideas and insights that were documented by others years ago. Keep reading; keep developing yourself.",
  },
  {
    label: "Receives regular education",
    section: "S_YOU_LEAD",
    low: "You never follow external education or training courses. That's too bad. Because even as an entrepreneur, you need to develop yourself. Often the entrepreneur him/herself is the most important part of the educational equation. Management guru Peter Drucker said: \"The bottleneck is always on top of the bottle.\" In other words, keep developing yourself in order to let your organization grow.",
    mid: "Yousporadicallyattendexternaleducationortrainingcourses.That's too bad. Because even as an entrepreneur, you need to develop yourself. Often the entrepreneur him/herself is the most important part of the educational equation. Management guru Peter Drucker said: \"The bottleneck is always on top of the bottle.\" In other words, keep developing yourself in order to let your organization grow.",
    high: "You occasionally attend external or internal training courses. That's very good. Self-development is fundamental for overall company development.",
  },
  {
    label: "Healthy work - life balance",
    section: "S_YOU_LEAD",
    low: "You have a poor work-life balance. It is a challenge for many businesses to combine everything. Successful high-growth entrepreneurs teach us that we must always take good care of ourselves. Hard work is sometimes necessary, of course, but you should take enough time for yourself and not skip vacations. Working smart is the solution.",
    mid: "You have a poor work-life balance. It is a challenge for many entrepreneurs to combine everything. Successful high-growth entrepreneurs teach us that we must always take good care of ourselves. Hard work is sometimes necessary, of course, but you should take enough time for yourself and not skip vacations. Working smart is the solution.",
    high: "You have a reasonably good work-life balance. It is a challenge for many entrepreneurs to combine everything. Successful high-growth entrepreneurs teach us that we must always take good care of ourselves. You have got that under control; well done.",
  },
  {
    label: "I am happy",
    section: "S_YOU_LEAD",
    low: "You are absolutely not happy. If this feeling continues, talk to a mentor, another entrepreneur who has been in your shoes. Maybe entrepreneurship is not for you.",
    mid: "You are somewhat not happy. If this feeling continues, talk to a mentor, another entrepreneur who has been in your shoes. Maybe entrepreneurship is not for you.",
    high: "You are mostly happy. Congratulations! Long may it last!",
  },
  {
    label: "Employees know long term goal",
    section: "S_YOU_IC",
    low: "A long-term goal for the organization gives everyone a clear framework for strategy and decisions - and can be very motivating. With a company of your size it isn't really necessary to establish all of this clearly yet, but it will help. But you can start thinking about it.",
    mid: "A long-term goal for the organization gives everyone a clear framework for strategy and decisions - and can be very motivating. Good that you have started doing this. It's important for you to finish this quickly.",
    high: "A long-term goal for the organization gives everyone a clear framework for strategy and decisions - and can be very motivating. Good that you have already come a long way with this. When you start to grow, it's important for all of this to be in order.",
  },
  {
    label: "Employees know yearly goal",
    section: "S_YOU_IC",
    low: "Focusing on goals, including annual goals, provides direction and a framework to your business activities. In addition, this information motivates your employees. In this phase you should start thinking about making all of this a bit clearer.",
    mid: "Focusing on goals, including annual goals, provides direction and a framework to your business activities. In addition, this information motivates your employees. Good that you have already started doing this; try to persevere and especially to communicate about this on a regular basis.",
    high: "Focusing on goals, including annual goals, provides direction and a framework to your business activities. In addition, this information motivates your employees. Good that you have already come a long way with this. Above all try to keep your goals \"alive\".",
  },
  {
    label: "Employees know quarterly/monthly goals",
    section: "S_YOU_IC",
    low: "Focusing on goals, including monthly goals and KPIs, provides guidance and direction to business activities. Actually, you make a small sprint every month to ensure that you are \"on schedule\". The clearer the goal the clearer it becomes on how to achieve it. Perhaps you can think about how this would work at your company.",
    mid: "Focusing on goals, including monthly goals and KPIs, provides guidance and direction to business activities. Actually, you make a small sprint every month to ensure that you are \"on schedule\". The clearer the goal the clearer it becomes on how to achieve it. Good that you have already started doing this. Hurry up and finish and implement it.",
    high: "Focusing on goals, including monthly goals and KPIs, provides guidance and direction to business activities. Actually, you make a small sprint every month to ensure that you are \"on schedule\". The clearer the goal the clearer it becomes on how to achieve it. Good that you are already applying this. Think above all about clear and simple communication with respect to the goals.",
  },
  {
    label: "Employees know vision and mission",
    section: "S_YOU_IC",
    low: "As with the long-term goal - it is important for the company's vision and mission to be clear. This motivates employees and provides a clear framework for the activities. In your phase this doesn't all need to be in place yet, but you can start thinking about what that vision and mission might look like.",
    mid: "As with the long-term goal - it is important for the company's vision and mission to be clear. This motivates employees and provides a clear framework for the activities. It's good that you have started on this, but it's important to finish quickly.",
    high: "As with the long-term goal - it is important for the company's vision and mission to be clear. This motivates employees and provides a clear framework for the activities. Good to see that you have already started on this in your phase.",
  },
  {
    label: "Employees know elevator pitch",
    section: "S_YOU_IC",
    low: "You'd be surprised to hear the stories and answers you get to the question \"What exactly does your company do?\". It is a good idea to formulate a common language and text - and to practice together. Everything will become clearer. Both internally as well as externally.",
    mid: "You'd be surprised to hear the stories and answers you get to the question \"What exactly does your company do?\". It is a good idea to formulate a common language and text - and to practice together. Everything will become clearer. Both internally as well as externally.",
    high: "You'd be surprised to hear the stories and answers you get to the question \"What exactly does your company do?\". It is a good idea to formulate a common language and text - and to practice together. It's good that you have already gotten this far with it. We recommend that you check occasionally... don't be surprised to see what you get.",
  },
  {
    label: "We frequently have company-wide meetings",
    section: "S_YOU_IC",
    low: "Research shows that it's crucial to communicate goals and performance to all employees, providing them with context regarding development. Face-to-face, with internal sessions works best. With internal sessions, in other words. With a company of your size this may seem too much \"overkill\" in information and process, but perhaps it would be good to start on it already.",
    mid: "Research shows that it's crucial to communicate goals and performance to all employees, providing them with context regarding development. Face-to-face, with internal sessions works best. With internal sessions, in other words. You are already doing this, but still not often enough. We recommend that you increase the frequency of the sessions.",
    high: "Research shows that it's crucial to communicate goals and performance to all employees, providing them with context regarding development. Face-to-face, with internal sessions works best. With internal sessions, in other words. You are already doing this, but perhaps still not often enough. More often is better... we recommend that you increase the frequency of the sessions.",
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

function buildSectionsAndQuestions(): {
  sections: SectionPayload[];
  questions: QuestionPayload[];
} {
  const sections: SectionPayload[] = SECTIONS.map((s) => ({
    stableKey: s.stableKey,
    sortOrder: s.sortOrder,
    name: s.name,
    description: s.description,
    domain: s.domain,
  }));

  const questions: QuestionPayload[] = QUESTION_DEFS.map((q, idx) => {
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
        // Integer-touching bands per the D2 plan: [0-3], [4-6], [7-10].
        // Every integer in [0, 10] is covered by exactly one band.
        { minScore: 0, maxScore: 3, text: q.low },
        { minScore: 4, maxScore: 6, text: q.mid },
        { minScore: 7, maxScore: 10, text: q.high },
      ],
    };
  });

  return { sections, questions };
}

// ─── Public content builder (exported for tests) ─────────────────────────

export function buildTemplateContent(): {
  sections: SectionPayload[];
  questions: QuestionPayload[];
  scoringConfig: typeof SCORING_CONFIG;
} {
  const { sections, questions } = buildSectionsAndQuestions();
  return { sections, questions, scoringConfig: SCORING_CONFIG };
}

// ─── Content hash (deterministic) ────────────────────────────────────────

export function computeContentHash(input: {
  questions: QuestionPayload[];
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

  // Each question: SLIDER_LIKERT, scale [0, 10], 3 recommendation bands
  for (const q of content.questions) {
    if (q.type !== "SLIDER_LIKERT") {
      throw new Error(
        `[seed-scaling-up-full-assessment] extraction audit FAILED: question ` +
          `${q.stableKey} is not SLIDER_LIKERT`
      );
    }
    if (q.scale.min !== 0 || q.scale.max !== 10 || q.scale.step !== 1) {
      throw new Error(
        `[seed-scaling-up-full-assessment] extraction audit FAILED: question ` +
          `${q.stableKey} scale is not [0, 10] step 1`
      );
    }
    if (q.recommendations.length !== 3) {
      throw new Error(
        `[seed-scaling-up-full-assessment] extraction audit FAILED: question ` +
          `${q.stableKey} has ${q.recommendations.length} bands; expected 3`
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

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Pre-write extraction audit. Throws if structure is broken.
  const audit = runExtractionAudit();

  const result = await runSeed(db);

  console.log(
    JSON.stringify({
      seed: "scaling-up-full-assessment",
      state: result.state,
      templateId: result.templateId,
      versionId: result.versionId,
      contentHash: result.contentHash,
      sectionCount: result.sectionCount,
      questionCount: result.questionCount,
      domainCount: audit.domainCount,
      published: false,
      message:
        result.state === "A"
          ? "Created template + v1 (DRAFT — operator must verify + publish)."
          : result.state === "B"
            ? "Idempotent no-op — exact match (still DRAFT)."
            : "Healed missing v1 on existing template (DRAFT).",
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
