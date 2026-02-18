"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";
type FilterStatus = ApprovalStatus | "ALL";

interface Approval {
  id: string;
  type: string;
  status: ApprovalStatus;
  coachName: string;
  details: string;
  requestedAt: string;
  escalatedAt?: string | null;
}

interface ApprovalsApiResponse {
  approvals?: Approval[];
}

const FILTERS: FilterStatus[] = ["PENDING", "APPROVED", "DENIED", "ALL"];

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("PENDING");
  const [processing, setProcessing] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadApprovals = useCallback(async (status: FilterStatus) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/approvals?status=${status}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load approvals (${response.status})`);
      }

      const payload = (await response.json()) as ApprovalsApiResponse;
      setApprovals(Array.isArray(payload.approvals) ? payload.approvals : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
      setApprovals([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApprovals(filter);
  }, [filter, loadApprovals]);

  const handleAction = async (approvalId: string, action: "APPROVE" | "DENY") => {
    setProcessing(approvalId);

    try {
      const response = await fetch(`/api/approvals/${approvalId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        return;
      }

      setApprovals((prev) =>
        prev.map((approval) =>
          approval.id === approvalId
            ? { ...approval, status: action === "APPROVE" ? "APPROVED" : "DENIED" }
            : approval
        )
      );
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setProcessing(null);
    }
  };

  const titleText = useMemo(
    () => (filter === "ALL" ? "all approvals" : `${filter.toLowerCase()} approvals`),
    [filter]
  );

  const getTypeColor = (type: string) => {
    switch (type) {
      case "WORKSHOP_REQUEST":
        return "#3182ce";
      case "CUSTOM_PRICING":
        return "#dd6b20";
      case "CANCELLATION":
        return "#e53e3e";
      case "REFUND":
        return "#d69e2e";
      case "DATE_CHANGE":
        return "#805ad5";
      default:
        return "#718096";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="approvals-page"
    >
      <style jsx>{`
        .approvals-page h2 {
          margin-bottom: 1.5rem;
          color: #44337a;
        }
        .controls {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
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
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
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
          align-items: center;
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
        .status-badge.EXPIRED {
          background: #edf2f7;
          color: #4a5568;
        }
        .empty-state {
          text-align: center;
          padding: 3rem;
          color: #718096;
          background: white;
          border-radius: 12px;
        }
        .error-state {
          color: #c53030;
        }
      `}</style>

      <h2>Approval Queue</h2>

      <div className="controls">
        {FILTERS.map((status) => (
          <button
            key={status}
            className={`filter-btn ${filter === status ? "active" : ""}`}
            onClick={() => setFilter(status)}
          >
            {status === "ALL"
              ? "All"
              : status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-gray-600">Showing {titleText}</p>

      <div className="approvals-list">
        {isLoading ? (
          <div className="empty-state">
            <p>Loading approvals...</p>
          </div>
        ) : error ? (
          <div className="empty-state error-state">
            <p>Failed to load approvals</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : approvals.length === 0 ? (
          <div className="empty-state">
            <p>No {titleText}</p>
          </div>
        ) : (
          approvals.map((approval) => (
            <div
              key={approval.id}
              className={`approval-card ${approval.escalatedAt ? "escalated" : ""}`}
            >
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
                  <span>
                    Requested: {new Date(approval.requestedAt).toLocaleDateString()}
                  </span>
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
                  <span className={`status-badge ${approval.status}`}>{approval.status}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
