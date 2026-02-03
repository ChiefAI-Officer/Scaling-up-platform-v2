import { LandingPageData } from "@/types/landing-page";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin } from "lucide-react";

export function SoloLandingPage({ data }: { data: LandingPageData }) {
    const coach = data.coaches[0];
    const workshop = data.workshop!;

    return (
        <div className="min-h-screen bg-white">
            {/* Hero Section */}
            <section className="relative bg-slate-900 text-white py-20 lg:py-32">
                <div className="container mx-auto px-6 text-center">
                    <h1 className="text-4xl lg:text-6xl font-extrabold mb-6 leading-tight">
                        {data.title}
                    </h1>
                    {data.subtitle && (
                        <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
                            {data.subtitle}
                        </p>
                    )}
                    <div className="flex flex-col md:flex-row justify-center gap-6 text-lg mb-10">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-primary" />
                            <span>{workshop.date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            <span>{workshop.time}</span>
                        </div>
                        {workshop.location && (
                            <div className="flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-primary" />
                                <span>{workshop.location}</span>
                            </div>
                        )}
                    </div>
                    <Button size="lg" className="text-lg px-8 py-6 rounded-full">
                        {data.ctaText || "Register Now"}
                    </Button>
                </div>
            </section>

            {/* Coach Bio Section */}
            <section className="py-20 bg-slate-50">
                <div className="container mx-auto px-6">
                    <div className="flex flex-col md:flex-row items-center gap-12">
                        <div className="w-full md:w-1/3">
                            <div className="aspect-square rounded-2xl overflow-hidden shadow-xl">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={coach.imageUrl || "/placeholder-coach.jpg"}
                                    alt={coach.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>
                        <div className="w-full md:w-2/3">
                            <h2 className="text-3xl font-bold mb-2">Meet Your Coach</h2>
                            <h3 className="text-xl text-primary font-semibold mb-6">{coach.name}, {coach.title}</h3>
                            <div className="prose lg:prose-lg text-slate-600">
                                <p>{coach.bio}</p>
                                {!coach.bio && (
                                    <p className="italic text-muted-foreground">[Insert Coach Bio Text Here from Sample]</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Workshop Content */}
            <section className="py-20">
                <div className="container mx-auto px-6">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="text-3xl font-bold mb-8 text-center">What You'll Learn</h2>
                        <div className="grid md:grid-cols-2 gap-8">
                            {workshop.learningOutcomes.length > 0 ? (
                                workshop.learningOutcomes.map((item, i) => (
                                    <div key={i} className="flex gap-4 p-6 bg-white border rounded-xl shadow-sm hover:shadow-md transition">
                                        <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold shrink-0">
                                            {i + 1}
                                        </div>
                                        <p className="text-slate-700 font-medium">{item}</p>
                                    </div>
                                ))
                            ) : (
                                // Placeholders
                                [1, 2, 3, 4].map((i) => (
                                    <div key={i} className="flex gap-4 p-6 bg-white border rounded-xl shadow-sm">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold shrink-0">{i}</div>
                                        <p className="text-slate-400 italic">[Learning Outcome {i}]</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 bg-primary/5">
                <div className="container mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold mb-6">Ready to Scale Up?</h2>
                    <Button size="lg" className="text-lg px-10 py-6 rounded-full shadow-lg hover:shadow-xl transition-all">
                        {data.ctaText || "Secure Your Spot"}
                    </Button>
                </div>
            </section>
        </div>
    );
}
