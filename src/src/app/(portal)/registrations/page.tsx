"use client";

import React, { useState } from "react";

interface Registration {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    workshopTitle: string;
    registeredAt: string;
    paymentStatus: string;
}

// Mock data
const mockRegistrations: Registration[] = [
    { id: "1", firstName: "John", lastName: "Smith", email: "john@acme.com", company: "Acme Corp", workshopTitle: "Scaling Up Master Class", registeredAt: "2026-01-15", paymentStatus: "PAID" },
    { id: "2", firstName: "Sarah", lastName: "Johnson", email: "sarah@techstartup.io", company: "TechStartup", workshopTitle: "Scaling Up Master Class", registeredAt: "2026-01-16", paymentStatus: "PAID" },
    { id: "3", firstName: "Mike", lastName: "Williams", email: "mike@competitor.com", company: "Competitor Inc", workshopTitle: "Scaling Up Master Class", registeredAt: "2026-01-17", paymentStatus: "PAID" },
    { id: "4", firstName: "Emily", lastName: "Brown", email: "emily@growthco.com", company: "GrowthCo", workshopTitle: "Exit Planning Workshop", registeredAt: "2026-01-18", paymentStatus: "PAID" },
];

export default function RegistrationsPage() {
    const [registrations] = useState(mockRegistrations);
    const [selectedWorkshop, setSelectedWorkshop] = useState<string>("all");

    const handleRemoveCompetitor = async (_registrationId: string) => {
        if (!confirm("Are you sure you want to flag this attendee for removal? This will require admin approval.")) {
            return;
        }

        // In production, this would submit a CANCELLATION approval request
        alert("Removal request submitted. Admin will review and process the refund if approved.");
    };

    const filteredRegistrations = selectedWorkshop === "all"
        ? registrations
        : registrations.filter(r => r.workshopTitle === selectedWorkshop);

    const uniqueWorkshops = [...new Set(registrations.map(r => r.workshopTitle))];

    return (
        <div className="registrations-page">
            <style jsx>{`
        .registrations-page h2 {
          margin-bottom: 1.5rem;
          color: #1a365d;
        }
        
        .controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        
        .filter-select {
          padding: 0.5rem 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 1rem;
        }
        
        .export-btn {
          background: #38a169;
          color: white;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }
        
        .registrations-table {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          overflow: hidden;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
        }
        
        th, td {
          padding: 1rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }
        
        th {
          background: #f7fafc;
          font-weight: 600;
          color: #4a5568;
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        tr:hover {
          background: #f7fafc;
        }
        
        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        
        .status-badge.paid {
          background: #c6f6d5;
          color: #22543d;
        }
        
        .action-btn {
          background: #e53e3e;
          color: white;
          padding: 0.25rem 0.75rem;
          border: none;
          border-radius: 4px;
          font-size: 0.75rem;
          cursor: pointer;
        }
        
        .action-btn:hover {
          background: #c53030;
        }
      `}</style>

            <h2>Registrations</h2>

            <div className="controls">
                <select
                    className="filter-select"
                    value={selectedWorkshop}
                    onChange={(e) => setSelectedWorkshop(e.target.value)}
                >
                    <option value="all">All Workshops</option>
                    {uniqueWorkshops.map(w => (
                        <option key={w} value={w}>{w}</option>
                    ))}
                </select>

                <button className="export-btn" onClick={() => alert("Export functionality coming soon!")}>
                    Export CSV
                </button>
            </div>

            <div className="registrations-table">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Company</th>
                            <th>Workshop</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRegistrations.map((reg) => (
                            <tr key={reg.id}>
                                <td>{reg.firstName} {reg.lastName}</td>
                                <td>{reg.email}</td>
                                <td>{reg.company}</td>
                                <td>{reg.workshopTitle}</td>
                                <td>
                                    <span className={`status-badge ${reg.paymentStatus.toLowerCase()}`}>
                                        {reg.paymentStatus}
                                    </span>
                                </td>
                                <td>
                                    <button
                                        className="action-btn"
                                        onClick={() => handleRemoveCompetitor(reg.id)}
                                    >
                                        Remove
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
