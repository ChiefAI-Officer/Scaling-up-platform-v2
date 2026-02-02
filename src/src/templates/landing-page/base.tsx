import React from "react";

interface WorkshopData {
    title: string;
    description: string;
    coachName: string;
    coachBio: string;
    coachPhotoUrl?: string;
    workshopGraphicUrl?: string;
    eventDate: Date;
    eventTime: string;
    venue: {
        name: string;
        address: string;
        city: string;
        state: string;
        zip: string;
    };
    price: number;
    stripeProductId?: string;
    stripePriceId?: string;
    typeformSurveyUrl?: string;
}

interface LandingPageProps {
    workshop: WorkshopData;
    checkoutUrl: string;
}

/**
 * Base Landing Page Template
 * Single-page workshop landing with all required sections.
 */
export function LandingPageTemplate({ workshop, checkoutUrl }: LandingPageProps) {
    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>{workshop.title} | Scaling Up</title>
                <meta name="description" content={workshop.description} />
                <link rel="stylesheet" href="/styles/landing.css" />
            </head>
            <body>
                <main className="landing-page">
                    {/* Hero Section */}
                    <section className="hero">
                        <div className="hero-content">
                            <h1>{workshop.title}</h1>
                            <p className="lead">{workshop.description}</p>
                            <a href="#register" className="cta-button">Register Now</a>
                        </div>
                        {/* Coach Photo OR Workshop Graphic */}
                        <div className="hero-image">
                            {workshop.workshopGraphicUrl ? (
                                <img src={workshop.workshopGraphicUrl} alt={workshop.title} />
                            ) : workshop.coachPhotoUrl ? (
                                <img src={workshop.coachPhotoUrl} alt={workshop.coachName} />
                            ) : (
                                <div className="placeholder-image">Scaling Up</div>
                            )}
                        </div>
                    </section>

                    {/* Coach Section */}
                    <section className="coach-section">
                        <h2>Meet Your Coach</h2>
                        <div className="coach-card">
                            {workshop.coachPhotoUrl && (
                                <img src={workshop.coachPhotoUrl} alt={workshop.coachName} className="coach-photo" />
                            )}
                            <div className="coach-info">
                                <h3>{workshop.coachName}</h3>
                                <p>{workshop.coachBio}</p>
                            </div>
                        </div>
                    </section>

                    {/* Event Details Section */}
                    <section className="event-details">
                        <h2>Event Details</h2>
                        <div className="details-grid">
                            <div className="detail-item">
                                <span className="label">Date</span>
                                <span className="value">{new Date(workshop.eventDate).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}</span>
                            </div>
                            <div className="detail-item">
                                <span className="label">Time</span>
                                <span className="value">{workshop.eventTime}</span>
                            </div>
                            <div className="detail-item">
                                <span className="label">Location</span>
                                <span className="value">
                                    {workshop.venue.name}<br />
                                    {workshop.venue.address}<br />
                                    {workshop.venue.city}, {workshop.venue.state} {workshop.venue.zip}
                                </span>
                            </div>
                            <div className="detail-item">
                                <span className="label">Investment</span>
                                <span className="value price">${(workshop.price / 100).toFixed(2)}</span>
                            </div>
                        </div>
                    </section>

                    {/* Calendar Links */}
                    <section className="calendar-links">
                        <h3>Add to Your Calendar</h3>
                        <div className="calendar-buttons">
                            <CalendarLink type="google" workshop={workshop} />
                            <CalendarLink type="outlook" workshop={workshop} />
                            <CalendarLink type="yahoo" workshop={workshop} />
                        </div>
                    </section>

                    {/* Registration Section */}
                    <section id="register" className="registration">
                        <h2>Register Now</h2>
                        <p>Secure your spot for this transformative workshop.</p>
                        <a href={checkoutUrl} className="checkout-button">
                            Complete Registration - ${(workshop.price / 100).toFixed(2)}
                        </a>
                    </section>

                    {/* Footer */}
                    <footer>
                        <p>&copy; {new Date().getFullYear()} Scaling Up. All rights reserved.</p>
                    </footer>
                </main>
            </body>
        </html>
    );
}

/**
 * Calendar Link Component
 */
function CalendarLink({ type, workshop }: { type: 'google' | 'outlook' | 'yahoo'; workshop: WorkshopData }) {
    const eventDate = new Date(workshop.eventDate);
    const startTime = eventDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    // Assume 4-hour workshop
    const endDate = new Date(eventDate.getTime() + 4 * 60 * 60 * 1000);
    const endTime = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const location = `${workshop.venue.name}, ${workshop.venue.address}, ${workshop.venue.city}, ${workshop.venue.state} ${workshop.venue.zip}`;

    let url = '';
    let label = '';

    switch (type) {
        case 'google':
            url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(workshop.title)}&dates=${startTime}/${endTime}&details=${encodeURIComponent(workshop.description)}&location=${encodeURIComponent(location)}`;
            label = 'Google Calendar';
            break;
        case 'outlook':
            url = `https://outlook.live.com/calendar/0/action/compose?subject=${encodeURIComponent(workshop.title)}&startdt=${startTime}&enddt=${endTime}&body=${encodeURIComponent(workshop.description)}&location=${encodeURIComponent(location)}`;
            label = 'Outlook';
            break;
        case 'yahoo':
            url = `https://calendar.yahoo.com/?v=60&title=${encodeURIComponent(workshop.title)}&st=${startTime}&et=${endTime}&desc=${encodeURIComponent(workshop.description)}&in_loc=${encodeURIComponent(location)}`;
            label = 'Yahoo Calendar';
            break;
    }

    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className={`calendar-btn ${type}`}>
            {label}
        </a>
    );
}

export default LandingPageTemplate;
