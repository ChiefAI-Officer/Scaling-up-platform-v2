/**
 * Duo Coach Landing Page Template
 * 
 * Based on: Jeff Donaldson and Lisa Foulger Duo Workshop Landing Page Sample.png
 * Layout: Purple/blue gradient hero with two coach photos, numbered benefits sections
 */



export interface DuoCoachTemplateProps {
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
        venue?: {
            name: string;
            address: string;
            city: string;
            state: string;
        };
    };
    coaches: Array<{
        firstName: string;
        lastName: string;
        title: string;
        photoUrl?: string;
    }>;
    content: {
        whatItIs: string[];
        whatItIsNot: string[];
        benefits: Array<{
            title: string;
            points: string[];
        }>;
        whoIsFor: string[];
        whoShouldSkip: string[];
        whyNow: string;
        callToAction: string;
    };
    partnerLogos?: string[];
}

export function DuoCoachTemplate({ workshop, coaches, content, partnerLogos }: DuoCoachTemplateProps) {
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
  <title>${workshop.title} with ${coaches.map(c => c.firstName).join(' & ')}</title>
  <meta name="description" content="${workshop.subtitle}">
  <style>
    :root {
      --primary-purple: #6B21A8;
      --primary-blue: #2563EB;
      --accent-blue: #3B82F6;
      --text-dark: #1F2937;
      --text-light: #6B7280;
      --white: #FFFFFF;
      --gray-100: #F3F4F6;
      --gray-200: #E5E7EB;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.7; color: var(--text-dark); }
    
    /* Hero Section - Purple/Blue Gradient */
    .hero {
      background: linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-blue) 100%);
      color: var(--white);
      padding: 60px 20px;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg>...</svg>') repeat;
      opacity: 0.1;
    }
    .hero-container {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 60px;
      align-items: center;
      position: relative;
      z-index: 1;
    }
    .workshop-type {
      background: rgba(255, 255, 255, 0.2);
      padding: 8px 20px;
      border-radius: 25px;
      display: inline-block;
      font-size: 0.85rem;
      margin-bottom: 20px;
    }
    .hero h1 {
      font-size: 3rem;
      font-weight: 800;
      margin-bottom: 15px;
      line-height: 1.1;
    }
    .hero .subtitle {
      font-size: 1.25rem;
      opacity: 0.9;
      margin-bottom: 30px;
    }
    .event-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 1rem;
    }
    .event-detail {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .event-detail-icon {
      font-size: 1.2rem;
    }
    
    /* Coaches Section in Hero */
    .coaches-section {
      display: flex;
      gap: 30px;
      justify-content: center;
    }
    .coach-card {
      text-align: center;
    }
    .coach-photo {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      object-fit: cover;
      border: 4px solid var(--white);
      margin-bottom: 15px;
    }
    .coach-name {
      font-size: 1.1rem;
      font-weight: 700;
    }
    .coach-title {
      font-size: 0.85rem;
      opacity: 0.8;
    }
    
    /* Partner Logos */
    .partner-logos {
      display: flex;
      gap: 20px;
      justify-content: center;
      align-items: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    }
    .partner-logo {
      height: 35px;
      filter: brightness(0) invert(1);
      opacity: 0.8;
    }
    
    /* Main Content */
    .main-content {
      max-width: 900px;
      margin: 0 auto;
      padding: 80px 20px;
    }
    
    /* Section Styling */
    .section {
      margin-bottom: 60px;
    }
    .section h2 {
      font-size: 2rem;
      margin-bottom: 30px;
      color: var(--text-dark);
    }
    .section h3 {
      font-size: 1.5rem;
      color: var(--primary-purple);
      margin-bottom: 20px;
    }
    
    /* What It Is / Isn't Lists */
    .split-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
    }
    .list-column h4 {
      font-size: 1.1rem;
      margin-bottom: 15px;
      color: var(--primary-blue);
    }
    .list-column ul {
      list-style: none;
      padding: 0;
    }
    .list-column li {
      padding: 8px 0;
      padding-left: 25px;
      position: relative;
    }
    .list-column.is li::before {
      content: '✓';
      position: absolute;
      left: 0;
      color: #10B981;
      font-weight: bold;
    }
    .list-column.isnt li::before {
      content: '✗';
      position: absolute;
      left: 0;
      color: #EF4444;
      font-weight: bold;
    }
    
    /* Numbered Benefits */
    .benefit-section {
      margin-bottom: 40px;
    }
    .benefit-header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 15px;
    }
    .benefit-number {
      background: var(--primary-blue);
      color: var(--white);
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.1rem;
    }
    .benefit-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-dark);
    }
    .benefit-points {
      margin-left: 55px;
      list-style: disc;
      color: var(--text-light);
    }
    .benefit-points li {
      margin-bottom: 8px;
    }
    
    /* Who For / Skip Sections */
    .audience-section {
      background: var(--gray-100);
      padding: 40px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .audience-section h3 {
      color: var(--text-dark);
      margin-bottom: 20px;
    }
    .audience-section ul {
      list-style: disc;
      margin-left: 20px;
      color: var(--text-light);
    }
    .audience-section li {
      margin-bottom: 10px;
    }
    
    /* Why Now */
    .why-now {
      background: linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-blue) 100%);
      color: var(--white);
      padding: 40px;
      border-radius: 12px;
      text-align: center;
    }
    .why-now h3 {
      color: var(--white);
      margin-bottom: 15px;
    }
    
    /* CTA Section */
    .cta-section {
      text-align: center;
      padding: 60px 20px;
      background: var(--gray-100);
    }
    .cta-section h2 {
      font-size: 2rem;
      margin-bottom: 20px;
    }
    .cta-btn {
      display: inline-block;
      background: var(--primary-blue);
      color: var(--white);
      padding: 18px 50px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 700;
      font-size: 1.2rem;
      transition: background 0.3s, transform 0.2s;
    }
    .cta-btn:hover {
      background: #1D4ED8;
      transform: translateY(-2px);
    }
    .cta-price {
      margin-top: 15px;
      color: var(--text-light);
    }
    
    /* Footer */
    footer {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-light);
      font-size: 0.9rem;
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .hero-container { grid-template-columns: 1fr; text-align: center; }
      .coaches-section { flex-direction: column; align-items: center; }
      .hero h1 { font-size: 2rem; }
      .split-list { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <!-- Hero Section -->
  <section class="hero">
    <div class="hero-container">
      <div class="hero-content">
        <span class="workshop-type">Scaling Up</span>
        <h1>${workshop.title}</h1>
        <p class="subtitle">${workshop.subtitle}</p>
        
        <div class="event-details">
          <div class="event-detail">
            <span class="event-detail-icon">📅</span>
            <span>${workshop.format === 'VIRTUAL' ? 'Tuesday' : ''} ${workshop.eventDate}</span>
          </div>
          <div class="event-detail">
            <span class="event-detail-icon">⏰</span>
            <span>${workshop.eventTime}</span>
          </div>
          <div class="event-detail">
            <span class="event-detail-icon">📍</span>
            <span>${workshop.format === 'VIRTUAL' ? 'Live Virtual Event' : workshop.venue?.city + ', ' + workshop.venue?.state}</span>
          </div>
        </div>
      </div>
      
      <div>
        <div class="coaches-section">
          ${coaches.map(coach => `
          <div class="coach-card">
            ${coach.photoUrl ? `<img src="${coach.photoUrl}" alt="${coach.firstName} ${coach.lastName}" class="coach-photo">` : ''}
            <div class="coach-name">${coach.firstName} ${coach.lastName}</div>
            <div class="coach-title">${coach.title}</div>
          </div>
          `).join('')}
        </div>
        
        ${partnerLogos ? `
        <div class="partner-logos">
          ${partnerLogos.map(logo => `<img src="${logo}" alt="Partner" class="partner-logo">`).join('')}
        </div>
        ` : ''}
      </div>
    </div>
  </section>

  <!-- Main Content -->
  <main class="main-content">
    <section class="section">
      <h2>Join Us for the ${workshop.title}</h2>
      <p style="color: var(--text-light); font-size: 1.1rem; margin-bottom: 40px;">
        ${workshop.description}
      </p>
      
      <div class="split-list">
        <div class="list-column is">
          <h4>What This Workshop Is</h4>
          <ul>
            ${content.whatItIs.map(item => `<li>${item}</li>`).join('')}
          </ul>
        </div>
        <div class="list-column isnt">
          <h4>What This Workshop Is Not</h4>
          <ul>
            ${content.whatItIsNot.map(item => `<li>${item}</li>`).join('')}
          </ul>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>What You'll Gain by Attending</h2>
      ${content.benefits.map((benefit, i) => `
      <div class="benefit-section">
        <div class="benefit-header">
          <div class="benefit-number">${i + 1}</div>
          <div class="benefit-title">${benefit.title}</div>
        </div>
        <ul class="benefit-points">
          ${benefit.points.map(point => `<li>${point}</li>`).join('')}
        </ul>
      </div>
      `).join('')}
    </section>

    <div class="audience-section">
      <h3>Who This Workshop Is For</h3>
      <ul>
        ${content.whoIsFor.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>

    <div class="audience-section" style="background: #FEF2F2;">
      <h3>Who Should Skip This</h3>
      <ul>
        ${content.whoShouldSkip.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>

    <div class="why-now">
      <h3>Why This Matters Now</h3>
      <p>${content.whyNow}</p>
    </div>
  </main>

  <!-- CTA Section -->
  <section class="cta-section">
    <h2>Join the ${workshop.title}</h2>
    <p style="color: var(--text-light); margin-bottom: 25px;">${content.callToAction}</p>
    <a href="${workshop.registrationUrl}" class="cta-btn">Register Here</a>
    <p class="cta-price">${workshop.isFree ? 'Free' : formatPrice(workshop.price)}</p>
  </section>

  <footer>
    <p>&copy; ${new Date().getFullYear()} Scaling Up. All rights reserved.</p>
  </footer>
</body>
</html>
  `;
}

export default DuoCoachTemplate;
