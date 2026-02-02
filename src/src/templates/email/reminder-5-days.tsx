/**
 * Email Template: 5-Day Reminder
 * Sent 5 days before the workshop to registered attendees.
 * 
 * Content extracted from: Email 1, Reminder Your Workshop is in 5 Days.png
 */

import { EmailTemplateProps } from './types';

export function Reminder5DaysTemplate({
    attendeeName,
    workshopTitle,
    coachName,
    eventDate,
    eventTime,
    surveyLink,
}: EmailTemplateProps) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Workshop is in 5 Days</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="https://scalingup.com/logo.png" alt="Scaling Up" style="height: 40px;">
  </div>

  <p>Hi ${attendeeName},</p>

  <p>We're looking forward to working alongside you at the <strong>${workshopTitle}</strong> in five days. To make sure you and your team gets maximum value, please complete the <a href="${surveyLink}" style="color: #2563eb;">AI Readiness Survey</a>. This helps us tune the session to your goals and stage.</p>

  <h3 style="color: #1e40af; margin-top: 30px;">You will learn how to:</h3>
  <ul style="padding-left: 20px;">
    <li>Use AI as a true thought partner that challenges assumptions, clarifies ideas, and strengthens decisions</li>
    <li>Apply the CHIT framework so every leadership conversation becomes a structured thinking session</li>
    <li>Pressure test your strategy in real time and identify blind spots you may be missing</li>
    <li>Turn AI into a weekly practice so you protect thinking time and step out of reactive work</li>
    <li>Find at least five hours per week you can redeploy toward work that drives enterprise value</li>
    <li>Move from vision to execution with more precision using Scaling Up tools supported by AI</li>
    <li>Build a culture where every team member can think at a higher level and contribute stronger insights</li>
  </ul>

  <h3 style="color: #1e40af; margin-top: 30px;">Bring:</h3>
  <ul style="padding-left: 20px;">
    <li>Each team member will need their laptop (this will be a productive working workshop)</li>
    <li>Questions, pain</li>
  </ul>

  <h3 style="color: #1e40af; margin-top: 30px;">Who you'll hear from:</h3>
  <ul style="padding-left: 20px;">
    <li><strong>Scaling Up Coaches:</strong> (Advanced Certification in AI)</li>
    <li><strong>Featured insights:</strong> Verne Harnish (Scaling Up founder) and contributions from Geoff Woods (AI Driven Leader)</li>
  </ul>

  <p>See you soon—let's create something amazing for your organization.</p>

  <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-top: 30px;">
    <p style="margin: 5px 0;">📅 <strong>Date:</strong> ${eventDate}</p>
    <p style="margin: 5px 0;">⏰ <strong>Time:</strong> ${eventTime}</p>
    <p style="margin: 5px 0;">📍 <strong>Location:</strong> Virtual</p>
  </div>

  <p style="margin-top: 30px;">Best,<br><strong>${coachName}</strong></p>

  <div style="margin-top: 20px; display: flex; gap: 10px;">
    <a href="#" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Add to Google Calendar</a>
    <a href="#" style="background: #0078d4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Add to Outlook Calendar</a>
    <a href="#" style="background: #6001d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Add to Yahoo Calendar</a>
  </div>

  <hr style="margin-top: 40px; border: none; border-top: 1px solid #e5e7eb;">
  
  <p style="font-size: 12px; color: #6b7280; text-align: center;">
    <a href="#" style="color: #6b7280;">Unsubscribe</a> | Sent by Scaling Up<br>
    321 North New Road, 903 • FL Lauderdale, FL • 33304
  </p>

</body>
</html>
  `;
}

export const reminder5DaysSubject = "Reminder: Your Workshop is in 5 Days";
export const reminder5DaysTiming = { daysBefore: 5 };
