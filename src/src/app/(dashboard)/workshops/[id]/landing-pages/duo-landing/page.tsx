"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Coach {
  name: string;
  photo: string;
  title: string;
}

interface Benefit {
  title: string;
  points: string[];
}

interface DuoLandingData {
  coach1: Coach;
  coach2: Coach;
  eventDate: string;
  eventTime: string;
  heroTitle: string;
  subtitle: string;
  description: string;
  whatItIs: string[];
  whatItIsNot: string[];
  benefits: Benefit[];
  whoIsFor: string[];
  whoShouldSkip: string[];
  whyNow: string;
  ctaText: string;
  registrationUrl: string;
}

const DEFAULT_DATA: DuoLandingData = {
  coach1: { name: "", photo: "", title: "Scaling Up Certified Coach" },
  coach2: { name: "", photo: "", title: "Scaling Up Certified Coach" },
  eventDate: "",
  eventTime: "11am - 12pm EST",
  heroTitle: "Scaling Up with AI Virtual Workshop",
  subtitle: "A Virtual Workshop for Business Owners and Leadership Teams",
  description: "AI is already impacting your business—whether you've made a plan or not. This virtual workshop is designed to help you cut through the noise, reduce confusion, and understand how AI actually fits into your growth strategy.",
  whatItIs: [
    "Strategic",
    "Practical",
    "Grounded in the Scaling Up Framework",
    "Focused on leadership decisions, not tools",
  ],
  whatItIsNot: [
    "A technical training",
    "A demo of AI software",
    "A race to adopt the latest trend",
  ],
  benefits: [
    {
      title: "Clarity on Where AI Actually Matters in Your Business",
      points: ["Separate signal from noise", "Understand leverage vs. distraction"],
    },
    {
      title: "A Simple Way to Talk About AI with Your Team",
      points: ["Lead productive conversations", "Reduce fear and hype"],
    },
    {
      title: "A Practical Framework You Can Apply Immediately",
      points: ["Structure for evaluating opportunities", "Making progress without overwhelm"],
    },
    {
      title: "A High-Value Use of 60 Minutes",
      points: ["Focused pace", "Clear transitions to outcomes"],
    },
    {
      title: "A Clear Decision Path Forward",
      points: ["Decide on AI priority", "Identify where deeper work is needed"],
    },
  ],
  whoIsFor: [
    "Business owners/founders",
    "CEOs/Executive teams",
    "Leadership teams at growth-stage companies",
    "Organizations using or considering the Scaling Up Framework",
  ],
  whoShouldSkip: [
    "Anyone looking for hands-on tool training",
    "Teams expecting implementation/setup",
    "Leaders unwilling to slow down and think strategically",
  ],
  whyNow: "AI is accelerating decision-making speed—but clarity is lagging. The companies that win will not be the ones who adopt AI first. They'll be the ones who adopt it wisely.",
  ctaText: "Register Here",
  registrationUrl: "",
};

export default function DuoLandingEditor() {
  const params = useParams();
  const workshopId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<DuoLandingData>(DEFAULT_DATA);

  useEffect(() => {
    async function loadData() {
      try {
        const [workshopRes, pageRes] = await Promise.all([
          fetch(`/api/workshops/${workshopId}`),
          fetch(`/api/workshops/${workshopId}/landing-pages/DUO_LANDING`),
        ]);

        const workshopData = await workshopRes.json();
        if (workshopData.success) {
          const w = workshopData.data;
          const eventDate = new Date(w.eventDate);
          
          setFormData((prev) => ({
            ...prev,
            coach1: {
              ...prev.coach1,
              name: `${w.coach.firstName} ${w.coach.lastName}`,
              photo: w.coach.profileImage || "",
            },
            eventDate: eventDate.toLocaleDateString("en-US", { 
              weekday: "long", month: "long", day: "numeric", year: "numeric" 
            }),
            eventTime: w.eventTime || "11am - 12pm",
            registrationUrl: `/workshop/${workshopId}/register`,
          }));
        }

        const pageData = await pageRes.json();
        if (pageData.success && pageData.data) {
          const content = JSON.parse(pageData.data.content);
          setFormData((prev) => ({ ...prev, ...content }));
        }
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [workshopId]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
  };

  const handleCoachChange = (coach: "coach1" | "coach2", field: keyof Coach, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [coach]: { ...prev[coach], [field]: value },
    }));
  };

  const handleArrayChange = (field: "whatItIs" | "whatItIsNot" | "whoIsFor" | "whoShouldSkip", index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === index ? value : item)),
    }));
  };

  const addArrayItem = (field: "whatItIs" | "whatItIsNot" | "whoIsFor" | "whoShouldSkip") => {
    setFormData((prev) => ({ ...prev, [field]: [...prev[field], ""] }));
  };

  const removeArrayItem = (field: "whatItIs" | "whatItIsNot" | "whoIsFor" | "whoShouldSkip", index: number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const handleSave = async (publish = false) => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(
        `/api/workshops/${workshopId}/landing-pages/DUO_LANDING`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: formData,
            status: publish ? "PUBLISHED" : "DRAFT",
          }),
        }
      );

      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to save");
      
      setSuccess(true);
      if (publish) window.open(`/workshop/${data.data.slug}`, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="text-gray-500">Loading...</div></div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <a href="/workshops" className="hover:text-gray-700">Workshops</a>
          <span>/</span>
          <a href={`/workshops/${workshopId}/landing-pages`} className="hover:text-gray-700">Landing Pages</a>
          <span>/</span>
          <span className="text-gray-900">Duo Landing Page</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Duo Workshop Landing Page Editor</h1>
        <p className="text-gray-600">AI Workshop template with two coaches</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">Changes saved successfully!</div>}

      <div className="grid grid-cols-5 gap-6">
        {/* Editor Panel */}
        <div className="col-span-2 space-y-6 max-h-[calc(100vh-150px)] overflow-y-auto pr-2">
          {/* Coaches */}
          <Card>
            <CardHeader><CardTitle>Coaches</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {(["coach1", "coach2"] as const).map((coach, idx) => (
                <div key={coach} className="space-y-3 pb-4 border-b last:border-0">
                  <h4 className="font-medium">Coach {idx + 1}</h4>
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={formData[coach].name}
                      onChange={(e) => handleCoachChange(coach, "name", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Title</Label>
                    <Input
                      value={formData[coach].title}
                      onChange={(e) => handleCoachChange(coach, "title", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Photo URL</Label>
                    <Input
                      value={formData[coach].photo}
                      onChange={(e) => handleCoachChange(coach, "photo", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Event & Hero */}
          <Card>
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Hero Title</Label><Input value={formData.heroTitle} onChange={(e) => handleChange("heroTitle", e.target.value)} className="mt-1" /></div>
              <div><Label>Subtitle</Label><Input value={formData.subtitle} onChange={(e) => handleChange("subtitle", e.target.value)} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date</Label><Input value={formData.eventDate} onChange={(e) => handleChange("eventDate", e.target.value)} className="mt-1" /></div>
                <div><Label>Time</Label><Input value={formData.eventTime} onChange={(e) => handleChange("eventTime", e.target.value)} className="mt-1" /></div>
              </div>
              <div><Label>Description</Label><textarea value={formData.description} onChange={(e) => handleChange("description", e.target.value)} rows={4} className="mt-1 w-full border rounded-md px-3 py-2" /></div>
            </CardContent>
          </Card>

          {/* What It Is/Isn't */}
          <Card>
            <CardHeader><CardTitle>What This Workshop Is / Is Not</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-green-700">What This Is ✓</Label>
                {formData.whatItIs.map((item, i) => (
                  <div key={i} className="flex gap-2 mt-2">
                    <Input value={item} onChange={(e) => handleArrayChange("whatItIs", i, e.target.value)} />
                    <Button variant="outline" size="sm" onClick={() => removeArrayItem("whatItIs", i)}>×</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => addArrayItem("whatItIs")}>+ Add</Button>
              </div>
              <div>
                <Label className="text-red-700">What This Is Not ✗</Label>
                {formData.whatItIsNot.map((item, i) => (
                  <div key={i} className="flex gap-2 mt-2">
                    <Input value={item} onChange={(e) => handleArrayChange("whatItIsNot", i, e.target.value)} />
                    <Button variant="outline" size="sm" onClick={() => removeArrayItem("whatItIsNot", i)}>×</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => addArrayItem("whatItIsNot")}>+ Add</Button>
              </div>
            </CardContent>
          </Card>

          {/* Audience */}
          <Card>
            <CardHeader><CardTitle>Target Audience</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Who This Is For</Label>
                {formData.whoIsFor.map((item, i) => (
                  <div key={i} className="flex gap-2 mt-2">
                    <Input value={item} onChange={(e) => handleArrayChange("whoIsFor", i, e.target.value)} />
                    <Button variant="outline" size="sm" onClick={() => removeArrayItem("whoIsFor", i)}>×</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => addArrayItem("whoIsFor")}>+ Add</Button>
              </div>
              <div>
                <Label>Who Should Skip</Label>
                {formData.whoShouldSkip.map((item, i) => (
                  <div key={i} className="flex gap-2 mt-2">
                    <Input value={item} onChange={(e) => handleArrayChange("whoShouldSkip", i, e.target.value)} />
                    <Button variant="outline" size="sm" onClick={() => removeArrayItem("whoShouldSkip", i)}>×</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => addArrayItem("whoShouldSkip")}>+ Add</Button>
              </div>
            </CardContent>
          </Card>

          {/* Why Now & CTA */}
          <Card>
            <CardHeader><CardTitle>Why Now & CTA</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Why This Matters Now</Label><textarea value={formData.whyNow} onChange={(e) => handleChange("whyNow", e.target.value)} rows={3} className="mt-1 w-full border rounded-md px-3 py-2" /></div>
              <div><Label>CTA Button Text</Label><Input value={formData.ctaText} onChange={(e) => handleChange("ctaText", e.target.value)} className="mt-1" /></div>
              <div><Label>Registration URL</Label><Input value={formData.registrationUrl} onChange={(e) => handleChange("registrationUrl", e.target.value)} className="mt-1" /></div>
            </CardContent>
          </Card>

          <div className="flex gap-3 sticky bottom-0 bg-white py-3">
            <Button onClick={() => handleSave(false)} variant="outline" disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Draft"}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving} className="flex-1">
              {saving ? "Publishing..." : "Save & Publish"}
            </Button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="col-span-3 sticky top-4">
          <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 border-b py-2">
              <CardTitle className="text-sm font-medium">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[calc(100vh-200px)] overflow-y-auto">
              {/* Hero */}
              <div className="bg-gradient-to-br from-purple-700 via-purple-600 to-blue-600 text-white p-6">
                <div className="grid grid-cols-5 gap-4 items-center">
                  <div className="col-span-3">
                    <span className="bg-white/20 text-xs px-3 py-1 rounded-full">Scaling Up</span>
                    <h1 className="text-xl font-bold mt-2">{formData.heroTitle}</h1>
                    <p className="text-purple-200 text-sm mt-1">{formData.subtitle}</p>
                    <div className="mt-4 space-y-1 text-sm">
                      <div>📅 {formData.eventDate}</div>
                      <div>⏰ {formData.eventTime}</div>
                      <div>📍 Live Virtual Event</div>
                    </div>
                  </div>
                  <div className="col-span-2 flex gap-3 justify-center">
                    {[formData.coach1, formData.coach2].map((c, i) => (
                      <div key={i} className="text-center">
                        {c.photo ? (
                          <img src={c.photo} alt={c.name} className="w-16 h-16 rounded-full object-cover mx-auto mb-1 border-2 border-white" />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-purple-500 mx-auto mb-1 flex items-center justify-center text-xs">No Img</div>
                        )}
                        <div className="text-xs font-medium">{c.name || `Coach ${i+1}`}</div>
                        <div className="text-[10px] text-purple-200">{c.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 text-sm">
                <p className="text-gray-600">{formData.description}</p>

                {/* What It Is/Isn't */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-green-700 mb-2">What This Is ✓</h4>
                    <ul className="space-y-1">{formData.whatItIs.map((i, idx) => <li key={idx} className="text-gray-600">• {i}</li>)}</ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-red-700 mb-2">What This Is Not ✗</h4>
                    <ul className="space-y-1">{formData.whatItIsNot.map((i, idx) => <li key={idx} className="text-gray-600">• {i}</li>)}</ul>
                  </div>
                </div>

                {/* Who For / Skip */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded">
                    <h4 className="font-medium mb-2">Who This Is For</h4>
                    <ul className="space-y-1">{formData.whoIsFor.map((i, idx) => <li key={idx} className="text-gray-600 text-xs">• {i}</li>)}</ul>
                  </div>
                  <div className="bg-red-50 p-3 rounded">
                    <h4 className="font-medium mb-2">Who Should Skip</h4>
                    <ul className="space-y-1">{formData.whoShouldSkip.map((i, idx) => <li key={idx} className="text-gray-600 text-xs">• {i}</li>)}</ul>
                  </div>
                </div>

                {/* Why Now */}
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-lg text-center">
                  <h4 className="font-medium mb-2">Why This Matters Now</h4>
                  <p className="text-sm text-purple-100">{formData.whyNow}</p>
                </div>

                {/* CTA */}
                <div className="text-center py-4">
                  <button className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold">
                    {formData.ctaText}
                  </button>
                  <p className="text-gray-500 text-xs mt-2">Free</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
