/**
 * Solo Coach Landing Page Template
 * 
 * Based on: Rob Williams Solo Landing Page Sample.png
 * Layout: Purple gradient hero with coach photo, sidebar registration card
 */



export interface SoloCoachTemplateProps {
    workshop: {
        title: string;
        subtitle: string;
        description: string;
        eventDate: string;
        eventTime: string;
        timezone: string;
        format: 'VIRTUAL' | 'IN_PERSON' | 'HYBRID';
        price: number;
        isFree: boolean;
        registrationUrl: string;
        videoUrl?: string;
    };
    coach: {
        firstName: string;
        lastName: string;
        title: string;
        company: string;
        bio: string;
        photoUrl?: string;
        partnerLogos?: string[];
    };
    content: {
        aboutTitle: string;
        aboutDescription: string;
        benefits: string[];
        callToAction: string;
    };
}

export function SoloCoachTemplate({ workshop, coach, content }: SoloCoachTemplateProps) {
    const formatPrice = (cents: number) => {
        if (cents === 0) return 'Free';
        return `$${(cents / 100).toFixed(0)}`;
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${workshop.title} with ${coach.firstName} ${coach.lastName}</title>
  <meta name="description" content="${workshop.subtitle}">
  <style>
    :root {
      --primary-purple: #6B21A8;
      --primary-purple-dark: #581C87;
      --primary-blue: #2563EB;
      --accent-orange: #F97316;
      --text-dark: #1F2937;
      --text-light: #6B7280;
      --white: #FFFFFF;
      --gray-100: #F3F4F6;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: var(--text-dark); }
    
    /* Hero Section */
    .hero {
      background: linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-purple-dark) 100%);
      color: var(--white);
      padding: 60px 20px;
    }
    .hero-container {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      align-items: center;
    }
    .hero-content h1 {
      font-size: 2.5rem;
      font-weight: 800;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .hero-content h2 {
      font-size: 1.25rem;
      font-weight: 400;
      opacity: 0.9;
      margin-bottom: 30px;
    }
    .hero-details {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .hero-detail {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .hero-detail-icon {
      width: 20px;
      height: 20px;
      fill: var(--accent-orange);
    }
    
    /* Coach Photo Section */
    .coach-section {
      text-align: center;
    }
    .coach-photo {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      object-fit: cover;
      border: 4px solid var(--white);
      margin-bottom: 15px;
    }
    .coach-name {
      font-size: 1.5rem;
      font-weight: 700;
    }
    .coach-title {
      opacity: 0.8;
      font-size: 0.9rem;
    }
    .partner-logos {
      display: flex;
      gap: 20px;
      justify-content: center;
      margin-top: 20px;
    }
    .partner-logo {
      height: 40px;
      filter: brightness(0) invert(1);
    }
    
    /* Main Content */
    .main-content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 60px 20px;
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 60px;
    }
    
    /* Workshop Info */
    .workshop-info h2 {
      font-size: 2rem;
      margin-bottom: 20px;
      color: var(--text-dark);
    }
    .workshop-description {
      color: var(--text-light);
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 15px;
      color: var(--primary-purple);
    }
    .benefits-list {
      list-style: none;
      padding: 0;
    }
    .benefits-list li {
      padding: 10px 0;
      padding-left: 30px;
      position: relative;
    }
    .benefits-list li::before {
      content: '✓';
      position: absolute;
      left: 0;
      color: var(--primary-blue);
      font-weight: bold;
    }
    
    /* Video Section */
    .video-container {
      margin: 40px 0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    }
    .video-container iframe {
      width: 100%;
      aspect-ratio: 16/9;
      border: none;
    }
    
    /* Registration Card */
    .registration-card {
      background: var(--white);
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 30px;
      position: sticky;
      top: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    .registration-header {
      background: linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-blue) 100%);
      color: var(--white);
      margin: -30px -30px 20px;
      padding: 20px 30px;
      border-radius: 12px 12px 0 0;
    }
    .registration-header h3 {
      font-size: 1.1rem;
      text-transform: uppercase;
    }
    .event-thumbnail {
      width: 100%;
      border-radius: 8px;
      margin-bottom: 15px;
    }
    .event-date {
      background: var(--primary-blue);
      color: var(--white);
      padding: 8px 15px;
      border-radius: 4px;
      display: inline-block;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .event-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 5px;
    }
    .event-price {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--primary-purple);
      margin-bottom: 20px;
    }
    .register-btn {
      display: block;
      width: 100%;
      background: var(--primary-blue);
      color: var(--white);
      text-align: center;
      padding: 15px 30px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 1.1rem;
      transition: background 0.3s;
    }
    .register-btn:hover {
      background: #1D4ED8;
    }
    
    /* Footer */
    .cta-banner {
      background: var(--gray-100);
      text-align: center;
      padding: 40px 20px;
    }
    .cta-banner p {
      max-width: 600px;
      margin: 0 auto;
      font-style: italic;
      color: var(--text-light);
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .hero-container, .main-content {
        grid-template-columns: 1fr;
      }
      .registration-card {
        position: static;
      }
    }
  </style>
</head>
<body>
  <!-- Hero Section -->
  <section class="hero">
    <div class="hero-container">
      <div class="hero-content">
        <span style="background: var(--accent-orange); padding: 5px 15px; border-radius: 20px; font-size: 0.8rem; text-transform: uppercase; font-weight: 600;">Scaling Up</span>
        <h1 style="margin-top: 15px;">${workshop.title}</h1>
        <h2>${workshop.subtitle}</h2>
        
        <div class="hero-details">
          <div class="hero-detail">
            <span>📅</span>
            <span>${workshop.eventDate}</span>
          </div>
          <div class="hero-detail">
            <span>⏰</span>
            <span>${workshop.eventTime} ${workshop.timezone}</span>
          </div>
          <div class="hero-detail">
            <span>📍</span>
            <span>${workshop.format === 'VIRTUAL' ? 'Virtual Workshop' : 'In-Person Workshop'}</span>
          </div>
        </div>
      </div>
      
      <div class="coach-section">
        ${coach.photoUrl ? `<img src="${coach.photoUrl}" alt="${coach.firstName} ${coach.lastName}" class="coach-photo">` : ''}
        <div class="coach-name">${coach.firstName} ${coach.lastName}</div>
        <div class="coach-title">${coach.title}</div>
        <div class="coach-title">${coach.company}</div>
        ${coach.partnerLogos ? `
        <div class="partner-logos">
          ${coach.partnerLogos.map(logo => `<img src="${logo}" alt="Partner" class="partner-logo">`).join('')}
        </div>
        ` : ''}
      </div>
    </div>
  </section>

  <!-- Main Content -->
  <main class="main-content">
    <div class="workshop-info">
      <h2>Join us for the ${workshop.title}</h2>
      <p class="workshop-description">${workshop.description}</p>
      
      <h3 class="section-title">${content.aboutTitle}</h3>
      <p class="workshop-description">${content.aboutDescription}</p>
      
      ${workshop.videoUrl ? `
      <div class="video-container">
        <iframe src="${workshop.videoUrl}" allowfullscreen></iframe>
      </div>
      ` : ''}
      
      <h3 class="section-title">What You'll Learn</h3>
      <ul class="benefits-list">
        ${content.benefits.map(benefit => `<li>${benefit}</li>`).join('')}
      </ul>
      
      <p style="margin-top: 30px; font-weight: 600;">${content.callToAction}</p>
    </div>
    
    <!-- Registration Sidebar -->
    <aside>
      <div class="registration-card">
        <div class="registration-header">
          <h3>Scaling Up to Finish Strong Virtual Workshop</h3>
        </div>
        
        <div class="event-date">${workshop.eventDate}</div>
        <div class="event-title">${workshop.title} with ${coach.firstName} ${coach.lastName}</div>
        <div class="event-price">${workshop.isFree ? 'Free' : formatPrice(workshop.price)}</div>
        
        <a href="${workshop.registrationUrl}" class="register-btn">Register Here</a>
      </div>
    </aside>
  </main>

  <!-- CTA Banner -->
  <section class="cta-banner">
    <p><strong>Secure your spot today</strong> and take the next step toward building a stronger, more valuable business — one that gives you the freedom to finish strong, on your terms.</p>
  </section>

</body>
</html>
  `;
}

export default SoloCoachTemplate;
