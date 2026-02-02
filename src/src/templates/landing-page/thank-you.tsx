/**
 * Thank You Page Template
 * 
 * Based on: Than you for Registering for the Workshop Sample.png
 * Layout: Purple background, confirmation message, embedded video
 */



export interface ThankYouPageProps {
    workshop: {
        title: string;
        eventDate: string;
        eventTime: string;
        format: 'VIRTUAL' | 'IN_PERSON' | 'HYBRID';
        zoomLink?: string;
        venueAddress?: string;
    };
    coach: {
        firstName: string;
        lastName: string;
    };
    attendee: {
        firstName: string;
        email: string;
    };
    videoUrl?: string;
    calendarLinks: {
        google: string;
        outlook: string;
        yahoo: string;
    };
}

export function ThankYouPageTemplate({
    workshop,
    coach,
    attendee,
    videoUrl,
    calendarLinks
}: ThankYouPageProps) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You | ${workshop.title}</title>
  <style>
    :root {
      --primary-purple: #6B21A8;
      --primary-purple-dark: #4C1D95;
      --white: #FFFFFF;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-purple-dark) 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--white);
    }
    
    .logo {
      margin-bottom: 30px;
    }
    .logo img {
      height: 40px;
      filter: brightness(0) invert(1);
    }
    .logo-text {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 2px;
    }
    
    .confirmation-card {
      max-width: 700px;
      text-align: center;
    }
    
    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 20px;
      line-height: 1.2;
    }
    
    .subtitle {
      font-size: 1.25rem;
      font-style: italic;
      opacity: 0.9;
      margin-bottom: 40px;
    }
    
    .video-container {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 30px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
    }
    .video-container iframe,
    .video-container video {
      width: 100%;
      aspect-ratio: 16/9;
      display: block;
      border: none;
    }
    .video-placeholder {
      aspect-ratio: 16/9;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.3);
    }
    .play-button {
      width: 80px;
      height: 80px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.3s;
    }
    .play-button:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .play-button::after {
      content: '▶';
      font-size: 30px;
      color: white;
      margin-left: 5px;
    }
    
    .details-box {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 30px;
    }
    .details-box h3 {
      margin-bottom: 15px;
      font-size: 1.1rem;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      opacity: 0.8;
    }
    .detail-value {
      font-weight: 600;
    }
    
    .calendar-section {
      margin-top: 20px;
    }
    .calendar-section h3 {
      margin-bottom: 15px;
      font-size: 1rem;
    }
    .calendar-buttons {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .calendar-btn {
      background: rgba(255, 255, 255, 0.2);
      color: var(--white);
      padding: 10px 20px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 500;
      font-size: 0.9rem;
      transition: background 0.3s;
    }
    .calendar-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    .footer-note {
      margin-top: 40px;
      font-size: 0.9rem;
      opacity: 0.7;
    }
    
    @media (max-width: 600px) {
      h1 { font-size: 1.75rem; }
      .subtitle { font-size: 1rem; }
    }
  </style>
</head>
<body>
  <div class="logo">
    <div class="logo-text">SCALING UP 📈</div>
  </div>
  
  <div class="confirmation-card">
    <h1>Thank you for Registering for the ${workshop.title}</h1>
    
    <p class="subtitle">
      You'll receive an email shortly with instructions and details for the workshop.
    </p>
    
    ${videoUrl ? `
    <div class="video-container">
      <iframe src="${videoUrl}" allowfullscreen></iframe>
    </div>
    ` : `
    <div class="video-container">
      <div class="video-placeholder">
        <div class="play-button"></div>
      </div>
    </div>
    `}
    
    <div class="details-box">
      <h3>Your Workshop Details</h3>
      <div class="detail-row">
        <span class="detail-label">Workshop</span>
        <span class="detail-value">${workshop.title}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Date</span>
        <span class="detail-value">${workshop.eventDate}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Time</span>
        <span class="detail-value">${workshop.eventTime}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Coach</span>
        <span class="detail-value">${coach.firstName} ${coach.lastName}</span>
      </div>
      ${workshop.format === 'VIRTUAL' && workshop.zoomLink ? `
      <div class="detail-row">
        <span class="detail-label">Join Link</span>
        <span class="detail-value"><a href="${workshop.zoomLink}" style="color: white;">Click to Join</a></span>
      </div>
      ` : ''}
    </div>
    
    <div class="calendar-section">
      <h3>Add to Your Calendar</h3>
      <div class="calendar-buttons">
        <a href="${calendarLinks.google}" class="calendar-btn" target="_blank">Google Calendar</a>
        <a href="${calendarLinks.outlook}" class="calendar-btn" target="_blank">Outlook</a>
        <a href="${calendarLinks.yahoo}" class="calendar-btn" target="_blank">Yahoo</a>
      </div>
    </div>
    
    <p class="footer-note">
      A confirmation email has been sent to ${attendee.email}
    </p>
  </div>
</body>
</html>
  `;
}

export default ThankYouPageTemplate;
