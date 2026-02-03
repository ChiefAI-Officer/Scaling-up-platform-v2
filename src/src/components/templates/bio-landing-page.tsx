import { LandingPageData } from "@/types/landing-page";
import { Button } from "@/components/ui/button";
import { Linkedin, Mail, Globe } from "lucide-react";

export function BioLandingPage({ data }: { data: LandingPageData }) {
    const coach = data.coaches[0];

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="container mx-auto px-6 py-20">
                <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
                    {/* Header / Cover */}
                    <div className="h-48 bg-gradient-to-r from-primary to-primary/80 relative">
                        {/* Optional Decorative Pattern */}
                        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                    </div>

                    <div className="px-8 pb-12 relative">
                        {/* Profile Image - Overlapping Header */}
                        <div className="-mt-24 mb-6 relative inline-block">
                            <div className="w-48 h-48 rounded-full border-4 border-white shadow-lg bg-white overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={coach.imageUrl || "/placeholder-coach.jpg"}
                                    alt={coach.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                            <div>
                                <h1 className="text-4xl font-bold mb-2 text-slate-900">{coach.name}</h1>
                                <p className="text-xl text-primary font-medium mb-1">{coach.title}</p>
                                <p className="text-slate-500 text-lg mb-6">{coach.company}</p>

                                <div className="flex gap-3">
                                    {/* Social Links Placeholders */}
                                    <Button variant="outline" size="sm" className="rounded-full gap-2">
                                        <Linkedin className="w-4 h-4" /> LinkedIn
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full gap-2">
                                        <Globe className="w-4 h-4" /> Website
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-full gap-2">
                                        <Mail className="w-4 h-4" /> Contact
                                    </Button>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 max-w-sm w-full">
                                <h3 className="font-semibold text-slate-900 mb-4">Certifications & Expertise</h3>
                                <div className="flex flex-wrap gap-2">
                                    {["Scaling Up Certified", "3HAG Certified", "Executive Leadership"].map(tag => (
                                        <span key={tag} className="px-3 py-1 bg-white border shadow-sm rounded-full text-xs font-medium text-slate-600">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 border-t pt-12">
                            <h2 className="text-2xl font-bold mb-6">About {coach.name.split(' ')[0]}</h2>
                            <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
                                <p>{coach.bio}</p>
                                {!coach.bio && (
                                    <>
                                        <p>
                                            [Insert detailed bio here. This section should copy the style and content format from the 'Bio-Page Sample.png'.]
                                        </p>
                                        <p>
                                            As a Scaling Up Certified Coach, I help leadership teams...
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Workshop CTA */}
                        <div className="mt-12 p-8 bg-slate-900 rounded-2xl text-white text-center">
                            <h2 className="text-2xl font-bold mb-4">Work with {coach.name.split(' ')[0]}</h2>
                            <p className="text-slate-300 mb-8 max-w-2xl mx-auto">
                                Join my upcoming Scaling Up Masterclass and take your business to the next level.
                            </p>
                            <Button size="lg" variant="secondary" className="font-bold">
                                View Upcoming Workshops
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
