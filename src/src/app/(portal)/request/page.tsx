"use client";

import React, { useState } from "react";

interface WorkshopRequestFormData {
    workshopTypeId: string;
    title: string;
    description: string;
    eventDate: string;
    eventTime: string;
    venueName: string;
    venueAddress: string;
    venueCity: string;
    venueState: string;
    venueZip: string;
    customPricing: boolean;
    customPrice?: number;
    useCoachPhoto: boolean;
}

const workshopTypes = [
    { id: "scaling-up-master", name: "Scaling Up Master Class", price: 49500 },
    { id: "exit-planning", name: "Exit Planning Workshop", price: 39500 },
    { id: "strategy-sprint", name: "Strategy Sprint", price: 29500 },
];

export default function RequestWorkshopPage() {
    const [formData, setFormData] = useState<WorkshopRequestFormData>({
        workshopTypeId: "",
        title: "",
        description: "",
        eventDate: "",
        eventTime: "09:00",
        venueName: "",
        venueAddress: "",
        venueCity: "",
        venueState: "",
        venueZip: "",
        customPricing: false,
        useCoachPhoto: true,
    });

    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const response = await fetch("/api/approvals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: formData.customPricing ? "CUSTOM_PRICING" : "WORKSHOP_REQUEST",
                    coachId: "current-coach-id", // Would come from auth context
                    coachEmail: "coach@example.com", // Would come from auth context
                    workshopTypeSlug: formData.workshopTypeId,
                    details: `Workshop: ${formData.title} on ${formData.eventDate}`,
                    requestedBy: "Coach Name", // Would come from auth context
                })
            });

            const data = await response.json();

            if (data.autoApproved) {
                setResult({ success: true, message: "Your workshop has been approved and is being set up!" });
            } else {
                setResult({ success: true, message: "Your request has been submitted for review. You'll receive an email once approved." });
            }
        } catch {
            setResult({ success: false, message: "Something went wrong. Please try again." });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="request-page">
            <style jsx>{`
        .request-page h2 {
          margin-bottom: 1.5rem;
          color: #1a365d;
        }
        
        .request-form {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          max-width: 700px;
        }
        
        .form-section {
          margin-bottom: 2rem;
        }
        
        .form-section h3 {
          margin-bottom: 1rem;
          color: #2d3748;
          font-size: 1.125rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }
        
        .form-group {
          margin-bottom: 1rem;
        }
        
        .form-group.full-width {
          grid-column: span 2;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #4a5568;
        }
        
        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 1rem;
        }
        
        .form-group textarea {
          min-height: 100px;
          resize: vertical;
        }
        
        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .checkbox-group input {
          width: auto;
        }
        
        .submit-btn {
          background: #3182ce;
          color: white;
          padding: 1rem 2rem;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .submit-btn:hover:not(:disabled) {
          background: #2b6cb0;
        }
        
        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        
        .result-message {
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }
        
        .result-message.success {
          background: #c6f6d5;
          color: #22543d;
        }
        
        .result-message.error {
          background: #fed7d7;
          color: #822727;
        }
      `}</style>

            <h2>Request New Workshop</h2>

            {result && (
                <div className={`result-message ${result.success ? 'success' : 'error'}`}>
                    {result.message}
                </div>
            )}

            <form className="request-form" onSubmit={handleSubmit}>
                <div className="form-section">
                    <h3>Workshop Details</h3>
                    <div className="form-grid">
                        <div className="form-group full-width">
                            <label>Workshop Type</label>
                            <select
                                value={formData.workshopTypeId}
                                onChange={(e) => setFormData({ ...formData, workshopTypeId: e.target.value })}
                                required
                            >
                                <option value="">Select a workshop type...</option>
                                {workshopTypes.map(wt => (
                                    <option key={wt.id} value={wt.id}>
                                        {wt.name} (${(wt.price / 100).toFixed(2)})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group full-width">
                            <label>Workshop Title</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="e.g., Spring Scaling Up Master Class"
                                required
                            />
                        </div>
                        <div className="form-group full-width">
                            <label>Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Brief description for the landing page..."
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Event Date</label>
                            <input
                                type="date"
                                value={formData.eventDate}
                                onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Event Time</label>
                            <input
                                type="time"
                                value={formData.eventTime}
                                onChange={(e) => setFormData({ ...formData, eventTime: e.target.value })}
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className="form-section">
                    <h3>Venue Information</h3>
                    <div className="form-grid">
                        <div className="form-group full-width">
                            <label>Venue Name</label>
                            <input
                                type="text"
                                value={formData.venueName}
                                onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
                                placeholder="e.g., Marriott Conference Center"
                                required
                            />
                        </div>
                        <div className="form-group full-width">
                            <label>Street Address</label>
                            <input
                                type="text"
                                value={formData.venueAddress}
                                onChange={(e) => setFormData({ ...formData, venueAddress: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>City</label>
                            <input
                                type="text"
                                value={formData.venueCity}
                                onChange={(e) => setFormData({ ...formData, venueCity: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>State</label>
                            <input
                                type="text"
                                value={formData.venueState}
                                onChange={(e) => setFormData({ ...formData, venueState: e.target.value })}
                                maxLength={2}
                                placeholder="TX"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>ZIP Code</label>
                            <input
                                type="text"
                                value={formData.venueZip}
                                onChange={(e) => setFormData({ ...formData, venueZip: e.target.value })}
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className="form-section">
                    <h3>Options</h3>
                    <div className="form-group">
                        <label className="checkbox-group">
                            <input
                                type="checkbox"
                                checked={formData.useCoachPhoto}
                                onChange={(e) => setFormData({ ...formData, useCoachPhoto: e.target.checked })}
                            />
                            Use my profile photo on landing page (vs workshop graphic)
                        </label>
                    </div>
                    <div className="form-group">
                        <label className="checkbox-group">
                            <input
                                type="checkbox"
                                checked={formData.customPricing}
                                onChange={(e) => setFormData({ ...formData, customPricing: e.target.checked })}
                            />
                            Request custom pricing (requires manual approval)
                        </label>
                    </div>
                </div>

                <button type="submit" className="submit-btn" disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit Workshop Request"}
                </button>
            </form>
        </div>
    );
}
