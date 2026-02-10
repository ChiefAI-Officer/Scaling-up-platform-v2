/**
 * Typeform Webhook Payload Types
 * Reference: https://www.typeform.com/developers/webhooks/
 */

export interface TypeformWebhookPayload {
  event_id: string;
  event_type: "form_response";
  form_response: TypeformFormResponse;
}

export interface TypeformFormResponse {
  form_id: string;
  token: string;
  submitted_at: string;
  hidden?: TypeformHiddenFields;
  answers: TypeformAnswer[];
  definition?: {
    fields: TypeformFieldDefinition[];
  };
}

export interface TypeformHiddenFields {
  workshop_id?: string;
  registration_id?: string;
  email?: string;
  coach_id?: string;
}

export interface TypeformAnswer {
  field: {
    id: string;
    type: string;
    ref?: string;
  };
  type: string;
  text?: string;
  number?: number;
  boolean?: boolean;
  email?: string;
  choice?: {
    label: string;
  };
  choices?: {
    labels: string[];
  };
  date?: string;
}

export interface TypeformFieldDefinition {
  id: string;
  title: string;
  type: string;
  ref?: string;
}
