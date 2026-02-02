"use client";

import React from "react";

interface DashboardStats {
    upcomingWorkshops: number;
    totalRegistrations: number;
    pastWorkshops: number;
    pendingFollowUps: number;
}

interface Workshop {
    id: string;
    title: string;
    eventDate: string;
    registrationCount: number;
    status: string;
}

// Mock data - in production, this would come from API/server component
const mockStats: DashboardStats = {
    upcomingWorkshops: 3,
    totalRegistrations: 45,
    pastWorkshops: 12,
    pendingFollowUps: 2,
};

const mockWorkshops: Workshop[] = [
    { id: "1", title: "Scaling Up Master Class", eventDate: "2026-02-15", registrationCount: 18, status: "SCHEDULED" },
    { id: "2", title: "Exit Planning Workshop", eventDate: "2026-02-28", registrationCount: 12, status: "SCHEDULED" },
    { id: "3", title: "Strategy Sprint", eventDate: "2026-03-10", registrationCount: 15, status: "SCHEDULED" },
];

export default function DashboardPage() {
    return (
        <div className="dashboard">
            <style jsx>{`
        .dashboard h2 {
          margin-bottom: 1.5rem;
          color: #1a365d;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        
        .stat-card {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .stat-card .label {
          font-size: 0.875rem;
          color: #718096;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .stat-card .value {
          font-size: 2.5rem;
          font-weight: 700;
          color: #1a365d;
          margin-top: 0.5rem;
        }
        
        .workshops-section {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .workshops-section h3 {
          margin-bottom: 1rem;
          color: #2d3748;
        }
        
        .workshop-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .workshop-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 0;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .workshop-item:last-child {
          border-bottom: none;
        }
        
        .workshop-info h4 {
          margin: 0 0 0.25rem;
          color: #2d3748;
        }
        
        .workshop-info .date {
          font-size: 0.875rem;
          color: #718096;
        }
        
        .workshop-stats {
          text-align: right;
        }
        
        .registration-count {
          font-size: 1.25rem;
          font-weight: 600;
          color: #3182ce;
        }
        
        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 500;
          background: #c6f6d5;
          color: #22543d;
        }
      `}</style>

            <h2>Welcome Back!</h2>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="label">Upcoming Workshops</div>
                    <div className="value">{mockStats.upcomingWorkshops}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Total Registrations</div>
                    <div className="value">{mockStats.totalRegistrations}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Past Workshops</div>
                    <div className="value">{mockStats.pastWorkshops}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Pending Follow-Ups</div>
                    <div className="value">{mockStats.pendingFollowUps}</div>
                </div>
            </div>

            <div className="workshops-section">
                <h3>Upcoming Workshops</h3>
                <ul className="workshop-list">
                    {mockWorkshops.map((workshop) => (
                        <li key={workshop.id} className="workshop-item">
                            <div className="workshop-info">
                                <h4>{workshop.title}</h4>
                                <span className="date">{new Date(workshop.eventDate).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                })}</span>
                            </div>
                            <div className="workshop-stats">
                                <div className="registration-count">{workshop.registrationCount} registrations</div>
                                <span className="status-badge">{workshop.status}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
