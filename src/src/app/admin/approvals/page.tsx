"use client";

import React, { useState } from "react";

interface Approval {
    id: string;
    type: string;
    status: string;
    coachName: string;
    details: string;
    requestedAt: string;
    escalatedAt?: string;
}

// Mock data - in production, would fetch from /api/approvals
const mockApprovals: Approval[] = [
    { id: "apr-1", type: "WORKSHOP_REQUEST", status: "PENDING", coachName: "John Smith", details: "Scaling Up Master Class - Feb 15, 2026", requestedAt: "2026-01-28T10:00:00Z" },
    { id: "apr-2", type: "CUSTOM_PRICING", status: "PENDING", coachName: "Sarah Johnson", details: "Exit Planning Workshop - $399 (15% discount)", requestedAt: "2026-01-27T14:30:00Z" },
    { id: "apr-3", type: "CANCELLATION", status: "PENDING", coachName: "Mike Williams", details: "Strategy Sprint - Cancel due to low enrollment", requestedAt: "2026-01-26T09:15:00Z", escalatedAt: "2026-01-27T09:15:00Z" },
];

export default function ApprovalsPage() {
    const [approvals, setApprovals] = useState<Approval[]>(mockApprovals);
    const [filter, setFilter] = useState<string>("PENDING");
    const [processing, setProcessing] = useState<string | null>(null);

    const handleAction = async (approvalId: string, action: "APPROVE" | "DENY") => {
        setProcessing(approvalId);

        try {
            const response = await fetch(`/api/approvals/${approvalId}/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action })
            });

            if (response.ok) {
                setApprovals(prev => prev.map(a =>
                    a.id === approvalId ? { ...a, status: action === "APPROVE" ? "APPROVED" : "DENIED" } : a
                ));
            }
        } catch (error) {
            console.error("Action failed:", error);
        } finally {
            setProcessing(null);
        }
    };

    const filteredApprovals = approvals.filter(a =>
        filter === "ALL" ? true : a.status === filter
    );

    const getTypeColor = (type: string) => {
        switch (type) {
            case "WORKSHOP_REQUEST": return "#3182ce";
            case "CUSTOM_PRICING": return "#dd6b20";
            case "CANCELLATION": return "#e53e3e";
            case "REFUND": return "#d69e2e";
            default: return "#718096";
        }
    };

    return (
        <div className="approvals-page">
            <style jsx>{`
        .approvals-page h2 {
          margin-bottom: 1.5rem;
          color: #44337a;
        }
        
        .controls {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        
        .filter-btn {
          padding: 0.5rem 1rem;
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .filter-btn.active {
          background: #805ad5;
          color: white;
          border-color: #805ad5;
        }
        
        .approvals-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .approval-card {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 1rem;
          align-items: center;
        }
        
        .approval-card.escalated {
          border-left: 4px solid #e53e3e;
        }
        
        .approval-info h3 {
          margin: 0 0 0.5rem;
          color: #2d3748;
        }
        
        .approval-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.875rem;
          color: #718096;
        }
        
        .type-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 500;
          color: white;
        }
        
        .escalation-warning {
          color: #e53e3e;
          font-weight: 500;
          font-size: 0.875rem;
          margin-top: 0.5rem;
        }
        
        .approval-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .action-btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .action-btn.approve {
          background: #38a169;
          color: white;
        }
        
        .action-btn.approve:hover {
          background: #2f855a;
        }
        
        .action-btn.deny {
          background: #e53e3e;
          color: white;
        }
        
        .action-btn.deny:hover {
          background: #c53030;
        }
        
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .status-badge {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
        }
        
        .status-badge.APPROVED {
          background: #c6f6d5;
          color: #22543d;
        }
        
        .status-badge.DENIED {
          background: #fed7d7;
          color: #822727;
        }
        
        .empty-state {
          text-align: center;
          padding: 3rem;
          color: #718096;
          background: white;
          border-radius: 12px;
        }
      `}</style>

            <h2>Approval Queue</h2>

            <div className="controls">
                <button
                    className={`filter-btn ${filter === "PENDING" ? "active" : ""}`}
                    onClick={() => setFilter("PENDING")}
                >
                    Pending
                </button>
                <button
                    className={`filter-btn ${filter === "APPROVED" ? "active" : ""}`}
                    onClick={() => setFilter("APPROVED")}
                >
                    Approved
                </button>
                <button
                    className={`filter-btn ${filter === "DENIED" ? "active" : ""}`}
                    onClick={() => setFilter("DENIED")}
                >
                    Denied
                </button>
                <button
                    className={`filter-btn ${filter === "ALL" ? "active" : ""}`}
                    onClick={() => setFilter("ALL")}
                >
                    All
                </button>
            </div>

            <div className="approvals-list">
                {filteredApprovals.length === 0 ? (
                    <div className="empty-state">
                        <p>No {filter.toLowerCase()} approvals</p>
                    </div>
                ) : (
                    filteredApprovals.map((approval) => (
                        <div key={approval.id} className={`approval-card ${approval.escalatedAt ? 'escalated' : ''}`}>
                            <div className="approval-info">
                                <h3>
                                    <span
                                        className="type-badge"
                                        style={{ background: getTypeColor(approval.type) }}
                                    >
                                        {approval.type.replace(/_/g, " ")}
                                    </span>
                                    &nbsp; {approval.coachName}
                                </h3>
                                <p>{approval.details}</p>
                                <div className="approval-meta">
                                    <span>Requested: {new Date(approval.requestedAt).toLocaleDateString()}</span>
                                </div>
                                {approval.escalatedAt && (
                                    <p className="escalation-warning">
                                        ⚠️ Escalated - pending for 24+ hours
                                    </p>
                                )}
                            </div>

                            <div className="approval-actions">
                                {approval.status === "PENDING" ? (
                                    <>
                                        <button
                                            className="action-btn approve"
                                            onClick={() => handleAction(approval.id, "APPROVE")}
                                            disabled={processing === approval.id}
                                        >
                                            {processing === approval.id ? "..." : "Approve"}
                                        </button>
                                        <button
                                            className="action-btn deny"
                                            onClick={() => handleAction(approval.id, "DENY")}
                                            disabled={processing === approval.id}
                                        >
                                            {processing === approval.id ? "..." : "Deny"}
                                        </button>
                                    </>
                                ) : (
                                    <span className={`status-badge ${approval.status}`}>
                                        {approval.status}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
