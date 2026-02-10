"use client";

import React, { useState } from "react";

interface FollowUpFormData {
    workshopId: string;
    implementedTools: string[];
    challenges: string;
    successes: string;
    recommendationScore: number;
    wouldRecommend: boolean;
    additionalComments: string;
}

const scalingUpTools = [
    "One-Page Strategic Plan",
    "Rockefeller Habits Checklist",
    "Meeting Rhythm",
    "Brand Promise",
    "Core Values",
    "BHAG (Big Hairy Audacious Goal)",
    "Cash Acceleration Strategies",
    "Talent Assessment",
    "Customer Feedback Systems",
];

// Mock past workshops
const pastWorkshops = [
    { id: "ws-1", title: "Scaling Up Master Class - December 2025", eventDate: "2025-12-15" },
    { id: "ws-2", title: "Exit Planning Workshop - November 2025", eventDate: "2025-11-20" },
];

export default function FollowUpPage() {
    const [formData, setFormData] = useState<FollowUpFormData>({
        workshopId: "",
        implementedTools: [],
        challenges: "",
        successes: "",
        recommendationScore: 8,
        wouldRecommend: true,
        additionalComments: "",
    });

    const [submitted, setSubmitted] = useState(false);

    const handleToolToggle = (tool: string) => {
        setFormData(prev => ({
            ...prev,
            implementedTools: prev.implementedTools.includes(tool)
                ? prev.implementedTools.filter(t => t !== tool)
                : [...prev.implementedTools, tool]
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // In production, would POST to /api/follow-up-reports
        console.log("Follow-up submitted:", formData);
        setSubmitted(true);
    };

    if (submitted) {
        return (
            <div className="follow-up-page">
                <style jsx>{`
          .success-message {
            background: white;
            padding: 3rem;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          }
          .success-message h2 {
            color: #38a169;
            margin-bottom: 1rem;
          }
        `}</style>
                <div className="success-message">
                    <h2>✅ Thank You!</h2>
                    <p>Your 90-day follow-up report has been submitted successfully.</p>
                    <p>This feedback helps us improve our workshops and track your progress.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="follow-up-page">
            <style jsx>{`
        .follow-up-page h2 {
          margin-bottom: 1.5rem;
          color: #1a365d;
        }
        
        .follow-up-form {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          max-width: 800px;
        }
        
        .form-section {
          margin-bottom: 2rem;
        }
        
        .form-section h3 {
          margin-bottom: 1rem;
          color: #2d3748;
          font-size: 1.125rem;
        }
        
        .form-group {
          margin-bottom: 1rem;
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
          min-height: 120px;
        }
        
        .tools-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 0.75rem;
        }
        
        .tool-checkbox {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem;
          background: #f7fafc;
          border-radius: 6px;
        }
        
        .tool-checkbox input {
          width: auto;
        }
        
        .nps-slider {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        
        .nps-slider input[type="range"] {
          flex: 1;
        }
        
        .nps-value {
          font-size: 1.5rem;
          font-weight: bold;
          color: #3182ce;
          min-width: 3rem;
          text-align: center;
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
        }
        
        .submit-btn:hover {
          background: #2b6cb0;
        }
      `}</style>

            <h2>90-Day Follow-Up Report</h2>

            <form className="follow-up-form" onSubmit={handleSubmit}>
                <div className="form-section">
                    <div className="form-group">
                        <label>Select Workshop</label>
                        <select
                            value={formData.workshopId}
                            onChange={(e) => setFormData({ ...formData, workshopId: e.target.value })}
                            required
                        >
                            <option value="">Choose a workshop...</option>
                            {pastWorkshops.map(ws => (
                                <option key={ws.id} value={ws.id}>{ws.title}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="form-section">
                    <h3>Which Scaling Up tools have you implemented?</h3>
                    <div className="tools-grid">
                        {scalingUpTools.map(tool => (
                            <label key={tool} className="tool-checkbox">
                                <input
                                    type="checkbox"
                                    checked={formData.implementedTools.includes(tool)}
                                    onChange={() => handleToolToggle(tool)}
                                />
                                {tool}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="form-section">
                    <h3>Your Journey</h3>
                    <div className="form-group">
                        <label>What challenges have you faced implementing these tools?</label>
                        <textarea
                            value={formData.challenges}
                            onChange={(e) => setFormData({ ...formData, challenges: e.target.value })}
                            placeholder="Describe any obstacles or difficulties..."
                        />
                    </div>
                    <div className="form-group">
                        <label>What successes have you experienced?</label>
                        <textarea
                            value={formData.successes}
                            onChange={(e) => setFormData({ ...formData, successes: e.target.value })}
                            placeholder="Share your wins and achievements..."
                        />
                    </div>
                </div>

                <div className="form-section">
                    <h3>How likely are you to recommend this workshop? (NPS)</h3>
                    <div className="nps-slider">
                        <span>0</span>
                        <input
                            type="range"
                            min="0"
                            max="10"
                            value={formData.recommendationScore}
                            onChange={(e) => setFormData({ ...formData, recommendationScore: parseInt(e.target.value) })}
                        />
                        <span>10</span>
                        <div className="nps-value">{formData.recommendationScore}</div>
                    </div>
                </div>

                <div className="form-section">
                    <div className="form-group">
                        <label>Additional Comments</label>
                        <textarea
                            value={formData.additionalComments}
                            onChange={(e) => setFormData({ ...formData, additionalComments: e.target.value })}
                            placeholder="Any other feedback or suggestions..."
                        />
                    </div>
                </div>

                <button type="submit" className="submit-btn">
                    Submit Follow-Up Report
                </button>
            </form>
        </div>
    );
}
