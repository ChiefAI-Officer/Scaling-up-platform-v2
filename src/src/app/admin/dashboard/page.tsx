"use client";

import React from "react";
import Link from "next/link";

interface DashboardStats {
    pendingApprovals: number;
    activeWorkshops: number;
    totalCoaches: number;
    registrationsThisMonth: number;
    revenueThisMonth: number;
}

interface RecentActivity {
    id: string;
    type: string;
    description: string;
    timestamp: string;
}

// Mock data
const stats: DashboardStats = {
    pendingApprovals: 3,
    activeWorkshops: 12,
    totalCoaches: 45,
    registrationsThisMonth: 128,
    revenueThisMonth: 6340000, // cents
};

const recentActivity: RecentActivity[] = [
    { id: "1", type: "APPROVAL", description: "Workshop request from Coach John Smith", timestamp: "2 hours ago" },
    { id: "2", type: "REGISTRATION", description: "New registration for Scaling Up Master Class", timestamp: "4 hours ago" },
    { id: "3", type: "WORKSHOP", description: "Exit Planning Workshop published", timestamp: "Yesterday" },
    { id: "4", type: "REFUND", description: "Refund processed for $250", timestamp: "Yesterday" },
];

export default function AdminDashboardPage() {
    return (
        <div className="admin-dashboard">
            <style jsx>{`
        .admin-dashboard h2 {
          margin-bottom: 1.5rem;
          color: #44337a;
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
        
        .stat-card.urgent {
          border-left: 4px solid #e53e3e;
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
          color: #44337a;
          margin-top: 0.5rem;
        }
        
        .stat-card.urgent .value {
          color: #e53e3e;
        }
        
        .quick-actions {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
        }
        
        .action-btn {
          background: #805ad5;
          color: white;
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
        }
        
        .action-btn:hover {
          background: #6b46c1;
        }
        
        .action-btn.secondary {
          background: #e2e8f0;
          color: #4a5568;
        }
        
        .activity-section {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .activity-section h3 {
          margin-bottom: 1rem;
          color: #2d3748;
        }
        
        .activity-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .activity-item {
          display: flex;
          justify-content: space-between;
          padding: 0.75rem 0;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .activity-item:last-child {
          border-bottom: none;
        }
        
        .activity-type {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
          margin-right: 0.5rem;
        }
        
        .activity-type.APPROVAL { background: #fed7d7; color: #822727; }
        .activity-type.REGISTRATION { background: #c6f6d5; color: #22543d; }
        .activity-type.WORKSHOP { background: #bee3f8; color: #2a4365; }
        .activity-type.REFUND { background: #feebc8; color: #744210; }
        
        .activity-time {
          color: #718096;
          font-size: 0.875rem;
        }
      `}</style>

            <h2>Admin Dashboard</h2>

            <div className="stats-grid">
                <div className={`stat-card ${stats.pendingApprovals > 0 ? 'urgent' : ''}`}>
                    <div className="label">Pending Approvals</div>
                    <div className="value">{stats.pendingApprovals}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Active Workshops</div>
                    <div className="value">{stats.activeWorkshops}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Total Coaches</div>
                    <div className="value">{stats.totalCoaches}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Registrations (Month)</div>
                    <div className="value">{stats.registrationsThisMonth}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Revenue (Month)</div>
                    <div className="value">${(stats.revenueThisMonth / 100).toLocaleString()}</div>
                </div>
            </div>

            <div className="quick-actions">
                <Link href="/admin/approvals" className="action-btn">
                    Review Pending Approvals
                </Link>
                <Link href="/admin/workshops" className="action-btn secondary">
                    View All Workshops
                </Link>
                <Link href="/admin/reports" className="action-btn secondary">
                    Generate Report
                </Link>
            </div>

            <div className="activity-section">
                <h3>Recent Activity</h3>
                <ul className="activity-list">
                    {recentActivity.map((activity) => (
                        <li key={activity.id} className="activity-item">
                            <div>
                                <span className={`activity-type ${activity.type}`}>{activity.type}</span>
                                {activity.description}
                            </div>
                            <span className="activity-time">{activity.timestamp}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
