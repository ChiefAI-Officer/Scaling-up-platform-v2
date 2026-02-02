/**
 * Email Sender Service
 * Handles sending templated emails via SMTP or a transactional email provider.
 */

import nodemailer from "nodemailer";

interface SendEmailOptions {
    to: string;
    templateId: string;
    variables: Record<string, string>;
}

// Email templates stored in-memory for MVP
// In production, these would come from the EmailTemplate database table
const EMAIL_TEMPLATES: Record<string, { subject: string; html: string }> = {
    "registration-confirmation": {
        subject: "You're Registered for {{ workshop_name }}!",
        html: `
      <h1>Hi {{ first_name }}, you're in!</h1>
      <p>Thank you for registering for <strong>{{ workshop_name }}</strong>.</p>
      <h2>Event Details</h2>
      <ul>
        <li><strong>Date:</strong> {{ event_date }}</li>
        <li><strong>Time:</strong> {{ event_time }}</li>
        <li><strong>Location:</strong> {{ venue_name }}</li>
        <li><strong>Your Coach:</strong> {{ coach_name }}</li>
      </ul>
      <p>We can't wait to see you there!</p>
      <p>— The Scaling Up Team</p>
    `
    },
    "pre-event-5-days": {
        subject: "{{ workshop_name }} is {{ days_until }} Days Away!",
        html: `
      <h1>Hi {{ first_name }},</h1>
      <p>Just <strong>{{ days_until }} days</strong> until your Scaling Up workshop!</p>
      <p>Here's a quick reminder:</p>
      <ul>
        <li><strong>Event:</strong> {{ workshop_name }}</li>
        <li><strong>Date:</strong> {{ event_date }}</li>
      </ul>
      <p>Start thinking about the challenges you want to tackle during our session.</p>
      <p>See you soon!</p>
    `
    },
    "pre-event-1-day": {
        subject: "Tomorrow: {{ workshop_name }}",
        html: `
      <h1>Hi {{ first_name }},</h1>
      <p>Your workshop is <strong>TOMORROW</strong>!</p>
      <h2>Final Details</h2>
      <ul>
        <li><strong>Location:</strong> {{ venue_name }}</li>
        <li><strong>Address:</strong> {{ venue_address }}</li>
      </ul>
      <p>Please arrive 15 minutes early to get settled.</p>
      <p>Looking forward to seeing you!</p>
    `
    },
    "pre-event-2-hours": {
        subject: "We Start in 2 Hours!",
        html: `
      <h1>Hi {{ first_name }},</h1>
      <p>{{ workshop_name }} starts in just <strong>2 hours</strong>!</p>
      <p>Time to head out. See you soon!</p>
    `
    },
    "post-event-survey": {
        subject: "How Was {{ workshop_name }}?",
        html: `
      <h1>Hi {{ first_name }},</h1>
      <p>Thank you for attending <strong>{{ workshop_name }}</strong> with {{ coach_name }}!</p>
      <p>We'd love to hear your feedback. Please take 2 minutes to complete our survey:</p>
      <p><a href="{{ survey_url }}" style="background: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Share Your Feedback</a></p>
      <p>Your insights help us improve future workshops.</p>
      <p>— The Scaling Up Team</p>
    `
    }
};

// SMTP transport (configure based on environment)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.example.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

/**
 * Send an email using a template
 */
export async function sendEmailTemplate(options: SendEmailOptions): Promise<void> {
    const template = EMAIL_TEMPLATES[options.templateId];

    if (!template) {
        throw new Error(`Email template not found: ${options.templateId}`);
    }

    // Replace template variables
    let subject = template.subject;
    let html = template.html;

    for (const [key, value] of Object.entries(options.variables)) {
        const regex = new RegExp(`{{ ${key} }}`, 'g');
        subject = subject.replace(regex, value);
        html = html.replace(regex, value);
    }

    // Send email (or log in dev mode)
    if (!process.env.SMTP_HOST || process.env.NODE_ENV === "development") {
        console.log("[DEV EMAIL]", {
            to: options.to,
            subject,
            templateId: options.templateId,
        });
        return;
    }

    await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Scaling Up" <noreply@scalingup.com>',
        to: options.to,
        subject,
        html,
    });
}

export default sendEmailTemplate;
