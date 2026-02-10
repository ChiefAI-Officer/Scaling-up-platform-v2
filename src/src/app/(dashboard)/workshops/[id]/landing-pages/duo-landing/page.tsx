"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Coach {
  name: string;
  photo: string;
  title: string;
}

interface CoachBioProfile {
  id: string;
  name: string;
  title: string;
  photoUrl: string;
  createdAt: string;
  editUrl: string;
}

interface Benefit {
  title: string;
  points: string[];
}

interface DuoLandingData {
  coach1BioId: string;
  coach2BioId: string;
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
  coach1BioId: "",
  coach2BioId: "",
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

function mapProfileToCoach(profile: CoachBioProfile): Coach {
  return {
    name: profile.name,
    title: profile.title || "Scaling Up Certified Coach",
    photo: profile.photoUrl || "",
  };
}

function formatCreatedDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DuoLandingEditor() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workshopId = params.id as string;
  const coach2IdFromQuery = searchParams.get("coach2Id");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<DuoLandingData>(DEFAULT_DATA);
  const [bioProfiles, setBioProfiles] = useState<CoachBioProfile[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [workshopRes, pageRes, bioProfilesRes] = await Promise.all([
          fetch(`/api/workshops/${workshopId}`),
          fetch(`/api/workshops/${workshopId}/landing-pages/DUO_LANDING`),
          fetch("/api/bio/profiles"),
        ]);

        const nextData: DuoLandingData = { ...DEFAULT_DATA };
        let workshopPrimaryCoachId = "";
        let metadataSecondaryCoachId: string | null = null;

        const workshopData = await workshopRes.json();
        if (workshopData.success) {
          const w = workshopData.data;
          const eventDate = new Date(w.eventDate);
          workshopPrimaryCoachId = w.coach.id || "";
          const metadataTask = Array.isArray(w.tasks)
            ? w.tasks.find(
                (task: { taskType?: string; inputData?: string | null }) =>
                  task.taskType === "WORKSHOP_SETUP_METADATA" && Boolean(task.inputData)
              )
            : null;

          let metadataSecondaryCoach:
            | { id?: string; name?: string; title?: string; photo?: string }
            | null = null;

          if (metadataTask?.inputData) {
            try {
              const parsedMetadata = JSON.parse(metadataTask.inputData) as {
                secondaryCoachId?: string;
                secondaryCoach?: { id?: string; name?: string; title?: string; photo?: string };
              };
              metadataSecondaryCoachId = parsedMetadata.secondaryCoachId || null;
              metadataSecondaryCoach = parsedMetadata.secondaryCoach || null;
            } catch {
              metadataSecondaryCoachId = null;
              metadataSecondaryCoach = null;
            }
          }

          nextData.coach1BioId = workshopPrimaryCoachId;
          nextData.coach1 = {
            name: `${w.coach.firstName} ${w.coach.lastName}`.trim(),
            photo: w.coach.profileImage || "",
            title: w.coach.company || "Scaling Up Certified Coach",
          };
          nextData.eventDate = eventDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          nextData.eventTime = w.eventTime || "11am - 12pm";
          nextData.registrationUrl = `/workshop/${workshopId}/register`;

          if (metadataSecondaryCoach?.name || metadataSecondaryCoach?.photo || metadataSecondaryCoach?.title) {
            nextData.coach2 = {
              name: metadataSecondaryCoach?.name || nextData.coach2.name,
              photo: metadataSecondaryCoach?.photo || nextData.coach2.photo,
              title: metadataSecondaryCoach?.title || nextData.coach2.title,
            };
          }

          if (metadataSecondaryCoachId) {
            nextData.coach2BioId = metadataSecondaryCoachId;
          }
        }

        const pageData = await pageRes.json();
        if (pageData.success && pageData.data) {
          const content = JSON.parse(pageData.data.content);
          Object.assign(nextData, content);
        }

        const bioProfilesData = await bioProfilesRes.json();
        const availableProfiles: CoachBioProfile[] =
          bioProfilesRes.ok && bioProfilesData.success && Array.isArray(bioProfilesData.data)
            ? (bioProfilesData.data as CoachBioProfile[])
            : [];
        setBioProfiles(availableProfiles);

        const preferredCoach1Id = nextData.coach1BioId || workshopPrimaryCoachId;
        if (preferredCoach1Id) {
          const coach1Profile = availableProfiles.find((profile) => profile.id === preferredCoach1Id);
          if (coach1Profile) {
            nextData.coach1BioId = coach1Profile.id;
            nextData.coach1 = mapProfileToCoach(coach1Profile);
          }
        }

        const preferredCoach2Id = nextData.coach2BioId || coach2IdFromQuery || metadataSecondaryCoachId;
        if (preferredCoach2Id) {
          const coach2Profile = availableProfiles.find((profile) => profile.id === preferredCoach2Id);
          if (coach2Profile) {
            nextData.coach2BioId = coach2Profile.id;
            nextData.coach2 = mapProfileToCoach(coach2Profile);
          }
        }

        if (!nextData.registrationUrl) {
          nextData.registrationUrl = `/workshop/${workshopId}/register`;
        }

        setFormData(nextData);
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [workshopId, coach2IdFromQuery]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
  };

  const handleCoachProfileChange = (slot: "coach1" | "coach2", profileId: string) => {
    const selectedProfile = bioProfiles.find((profile) => profile.id === profileId);

    setFormData((prev) => {
      if (slot === "coach1") {
        return {
          ...prev,
          coach1BioId: profileId,
          coach1: selectedProfile ? mapProfileToCoach(selectedProfile) : prev.coach1,
        };
      }

      return {
        ...prev,
        coach2BioId: profileId,
        coach2: selectedProfile ? mapProfileToCoach(selectedProfile) : prev.coach2,
      };
    });
    setSuccess(false);
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
          <Link href="/workshops" className="hover:text-gray-700">Workshops</Link>
          <span>/</span>
          <Link href={`/workshops/${workshopId}/landing-pages`} className="hover:text-gray-700">Landing Pages</Link>
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
          <Card>
            <CardHeader>
              <CardTitle>Coach Mapping via BIO Pages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="coach1BioId">Coach 1 Source</Label>
                <select
                  id="coach1BioId"
                  value={formData.coach1BioId}
                  onChange={(event) => handleCoachProfileChange("coach1", event.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="">Select coach bio page...</option>
                  {bioProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({formatCreatedDate(profile.createdAt)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="coach2BioId">Coach 2 Source</Label>
                <select
                  id="coach2BioId"
                  value={formData.coach2BioId}
                  onChange={(event) => handleCoachProfileChange("coach2", event.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="">Select coach bio page...</option>
                  {bioProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({formatCreatedDate(profile.createdAt)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-md border border-gray-200">
                <div className="border-b bg-gray-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Available Bio Pages
                </div>
                {bioProfiles.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-500">
                    No coach bio pages found. Create or update coach bios first.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                            Name
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                            Created
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                            Edit
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {bioProfiles.map((profile) => (
                          <tr key={profile.id}>
                            <td className="px-3 py-2">{profile.name}</td>
                            <td className="px-3 py-2 text-gray-600">{formatCreatedDate(profile.createdAt)}</td>
                            <td className="px-3 py-2">
                              <Link
                                href={profile.editUrl}
                                className="text-blue-600 hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Edit
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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
