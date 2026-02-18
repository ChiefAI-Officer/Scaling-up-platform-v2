import { LandingPageData } from "@/types/landing-page";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin } from "lucide-react";

export function DuoLandingPage({ data }: { data: LandingPageData }) {
    const workshop = data.workshop!;

    return (
        <div className="min-h-screen bg-card">
            {/* Hero Section */}
            <section className="relative bg-gradient-to-r from-blue-900 to-slate-900 text-white py-24">
                <div className="container mx-auto px-6 text-center">
                    <div className="inline-block px-4 py-1.5 bg-card/10 rounded-full text-sm font-semibold mb-6 tracking-wide uppercase">
                        Double Impact Workshop
                    </div>
                    <h1 className="text-4xl lg:text-6xl font-extrabold mb-6 leading-tight">
                        {data.title}
                    </h1>
                    {data.subtitle && (
                        <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
                            {data.subtitle}
                        </p>
                    )}

                    <div className="flex flex-wrap justify-center gap-6 text-lg mb-10 bg-card/5 inline-flex p-4 rounded-xl border border-white/10">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-blue-400" />
                            <span>{workshop.date}</span>
                        </div>
                        <div className="flex items-center gap-2 border-l border-white/20 pl-6">
                            <Clock className="w-5 h-5 text-blue-400" />
                            <span>{workshop.time}</span>
                        </div>
                        {workshop.location && (
                            <div className="flex items-center gap-2 border-l border-white/20 pl-6">
                                <MapPin className="w-5 h-5 text-blue-400" />
                                <span>{workshop.location}</span>
                            </div>
                        )}
                    </div>

                    <div>
                        <Button size="lg" className="text-lg px-8 py-6 rounded-full bg-blue-600 hover:bg-blue-500 border-none">
                            {data.ctaText || "Register for Workshop"}
                        </Button>
                    </div>
                </div>
            </section>

            {/* Coaches Section */}
            <section className="py-24 bg-card">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold mb-4">Led by Scale Up Certified Coaches</h2>
                    </div>

                    <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
                        {data.coaches.map((coach, idx) => (
                            <div key={idx} className="group relative">
                                <div className="aspect-[4/5] rounded-2xl overflow-hidden mb-6 shadow-lg bg-slate-100">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={coach.imageUrl || "/placeholder-coach.jpg"}
                                        alt={coach.name}
                                        className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                                    />
                                </div>
                                <h3 className="text-2xl font-bold mb-1">{coach.name}</h3>
                                <p className="text-blue-600 font-medium mb-4">{coach.title} {coach.company && `| ${coach.company}`}</p>
                                <p className="text-slate-600 leading-relaxed text-sm lg:text-base">
                                    {coach.bio || "[Insert Coach Bio Here]"}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Content Section */}
            <section className="py-24 bg-slate-50">
                <div className="container mx-auto px-6 max-w-4xl">
                    <h2 className="text-3xl font-bold mb-8">About This Workshop</h2>
                    <div className="prose lg:prose-lg text-slate-600 mb-12">
                        <p>{data.aboutText || "[Insert detailed workshop description here]"}</p>
                    </div>

                    <h3 className="text-2xl font-bold mb-6">Key Takeaways</h3>
                    <ul className="space-y-4">
                        {workshop.learningOutcomes.length > 0 ? (
                            workshop.learningOutcomes.map((item, i) => (
                                <li key={i} className="flex gap-4 items-start">
                                    <div className="w-6 h-6 mt-1 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0">
                                        ✓
                                    </div>
                                    <p className="text-slate-700 text-lg">{item}</p>
                                </li>
                            ))
                        ) : (
                            [1, 2, 3].map((i) => (
                                <li key={i} className="flex gap-4 items-start opacity-50">
                                    <div className="w-6 h-6 mt-1 rounded-full bg-slate-200 shrink-0" />
                                    <p className="text-slate-400 italic">[Learning Outcome {i}]</p>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 bg-blue-900 text-white text-center">
                <div className="container mx-auto px-6">
                    <h2 className="text-3xl font-bold mb-8">Limited Seats Available</h2>
                    <Button size="lg" variant="secondary" className="text-lg px-12 py-6 rounded-full">
                        {data.ctaText || "Register Now"}
                    </Button>
                </div>
            </section>
        </div>
    );
}
