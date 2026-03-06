/**
 * Workflow System Types & Constants (JV-11 + JV-22)
 *
 * Defines the type-safe constants for the workflow data model.
 * Used across API routes, UI components, and Inngest functions.
 */

// ============================================
// Step Types — what action the step performs
// ============================================

export const STEP_TYPES = {
  EMAIL_ATTENDEES: "EMAIL_ATTENDEES",         // Send to all registered attendees
  EMAIL_COACH: "EMAIL_COACH",                 // Send to the workshop's coach
  EMAIL_STAFF: "EMAIL_STAFF",                 // Send to admin/staff (ADMIN_EMAIL)
  EMAIL_CUSTOM: "EMAIL_CUSTOM",               // Send to specific email addresses
  NOTIFICATION: "NOTIFICATION",               // Internal Teams/system notification
  SEND_SURVEY_LINK: "SEND_SURVEY_LINK",       // MR-38: Send survey link to attendees
  SEND_FILE_LINK: "SEND_FILE_LINK",           // MR-38: Send file/resource link to attendees
} as const;

export type StepType = (typeof STEP_TYPES)[keyof typeof STEP_TYPES];

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  EMAIL_ATTENDEES: "Email Attendees",
  EMAIL_COACH: "Email Coach",
  EMAIL_STAFF: "Email Staff",
  EMAIL_CUSTOM: "Email Custom Recipients",
  NOTIFICATION: "System Notification",
  SEND_SURVEY_LINK: "Send Survey Link",
  SEND_FILE_LINK: "Send File Access Link",
};

// ============================================
// Trigger Types — when the step fires
// ============================================

export const TRIGGER_TYPES = {
  RELATIVE_TO_EVENT: "RELATIVE_TO_EVENT",   // X days before/after eventDate
  ON_REGISTRATION: "ON_REGISTRATION",       // Immediately when someone registers
  ON_APPROVAL: "ON_APPROVAL",               // When workshop is approved
} as const;

export type TriggerType = (typeof TRIGGER_TYPES)[keyof typeof TRIGGER_TYPES];

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  RELATIVE_TO_EVENT: "Relative to Event Date",
  ON_REGISTRATION: "On Registration",
  ON_APPROVAL: "On Workshop Approval",
};

// ============================================
// Execution Statuses
// ============================================

export const EXECUTION_STATUSES = {
  PENDING: "PENDING",
  SCHEDULED: "SCHEDULED",
  SENT: "SENT",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[keyof typeof EXECUTION_STATUSES];

// ============================================
// Preset offset options for the UI dropdown (JV-22)
// ============================================

export const OFFSET_PRESETS = [
  { label: "2 weeks before event", days: -14 },
  { label: "1 week before event", days: -7 },
  { label: "5 days before event", days: -5 },
  { label: "3 days before event", days: -3 },
  { label: "1 day before event", days: -1 },
  { label: "2 hours before event", days: 0, hours: -2 },
  { label: "1 hour before event", days: 0, hours: -1 },
  { label: "Day of event", days: 0 },
  { label: "1 day after event", days: 1 },
  { label: "3 days after event", days: 3 },
  { label: "1 week after event", days: 7 },
  { label: "2 weeks after event", days: 14 },
  { label: "30 days after event", days: 30 },
] as const;

// ============================================
// Email template variables available in workflows
// ============================================

export const WORKFLOW_VARIABLES = {
  "{{workshopTitle}}": "Workshop title",
  "{{workshopCode}}": "Workshop unique code (WS-YYYY-XXXX)",
  "{{workshopDate}}": "Event date (formatted)",
  "{{workshopTime}}": "Event time",
  "{{workshopLocation}}": "Venue or virtual link",
  "{{workshopUrl}}": "Landing page URL",
  "{{coachName}}": "Coach full name",
  "{{coachEmail}}": "Coach email",
  "{{registrantName}}": "Registrant full name",
  "{{registrantEmail}}": "Registrant email",
  "{{registrantCompany}}": "Registrant company",
} as const;

export type WorkflowVariable = keyof typeof WORKFLOW_VARIABLES;
