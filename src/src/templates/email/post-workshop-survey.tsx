/**
 * Email Template: Post-Workshop Survey
 * Sent 1 day after the workshop to registered attendees.
 * 
 * Content extracted from: Email 5. Scaling Up with AI - Post-Workshop Survey.png
 */

import { EmailTemplateProps } from './types';

export interface PostWorkshopEmailProps extends EmailTemplateProps {
    surveyLink: string;
    upcomingWorkshops: Array<{
        date: string;
        location: string;
        registrationLink: string;
    }>;
    coaches: Array<{
        name: string;
        email: string;
        bookingLink: string | null;
    }>;
}

export function PostWorkshopSurveyTemplate({
    attendeeName,
    workshopTitle,
    surveyLink,
    upcomingWorkshops,
    coaches,
}: PostWorkshopEmailProps) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Post-Workshop Survey</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="https://scalingup.com/logo.png" alt="Scaling Up" style="height: 40px;">
  </div>

  <p>Hello ${attendeeName},</p>

  <p>If you were able to attend the ${workshopTitle} this afternoon, we would love to get feedback from you. We are always looking to improve the quality and content of our workshops. Your feedback is valuable to us.</p>

  <p>Here is <a href="${surveyLink}" style="color: #2563eb; font-weight: bold;">link to complete the survey</a>.</p>

  <p>If you would like to register and attend for the in-person (full day) AI Workshop, below are the 2 dates we have coming up:</p>

  <ul style="padding-left: 20px;">
    ${upcomingWorkshops.map(ws => `
      <li>${ws.date} in ${ws.location}. <a href="${ws.registrationLink}" style="color: #2563eb;">Link to Register</a></li>
    `).join('')}
  </ul>

  <p>If you would like to reach out to one of the coaches from today's workshop directly, below are their contact information:</p>

  <ul style="padding-left: 20px;">
    ${coaches.map(coach => `
      <li>${coach.name}: <a href="mailto:${coach.email}" style="color: #2563eb;">${coach.email}</a>${coach.bookingLink ? ` | <a href="${coach.bookingLink}" style="color: #2563eb;">Booking Link</a>` : ''}</li>
    `).join('')}
  </ul>

  <p>Thank you again for registering for the ${workshopTitle}.</p>

  <p>The Scaling Up Team</p>

  <hr style="margin-top: 40px; border: none; border-top: 1px solid #e5e7eb;">
  
  <p style="font-size: 12px; color: #6b7280; text-align: center;">
    <a href="#" style="color: #6b7280;">Unsubscribe</a> | Sent by Scaling Up<br>
    321 North New Road, 903 • FL Lauderdale, FL • 33304
  </p>

</body>
</html>
  `;
}

export const postWorkshopSubject = "Scaling Up with AI - Post-Workshop Survey";
export const postWorkshopTiming = { daysAfter: 1 };
