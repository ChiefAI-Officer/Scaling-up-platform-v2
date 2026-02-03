import { LandingPageData } from "@/types/landing-page";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle2, Video } from "lucide-react";
import Link from "next/link";

export function ThankYouLandingPage({ data }: { data: LandingPageData }) {
    const workshop = data.workshop!;

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
            <div className="max-w-3xl w-full text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 text-green-400 mb-8 ring-1 ring-green-500/40">
                    <CheckCircle2 className="w-10 h-10" />
                </div>

                <h1 className="text-4xl lg:text-5xl font-bold mb-6">Registration Confirmed!</h1>
                <p className="text-xl text-slate-300 mb-12">
                    You are successfully registered for <span className="text-white font-semibold">{data.title}</span>.
                </p>

                {/* Video Placeholder */}
                <div className="relative aspect-video bg-black/40 rounded-2xl overflow-hidden border border-white/10 shadow-2xl mb-12 group cursor-pointer">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center pl-1 shadow-lg">
                                <Video className="w-6 h-6 text-slate-900" />
                            </div>
                        </div>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 text-left">
                        <p className="font-medium">Welcome & What to Expect</p>
                    </div>
                </div>

                {/* Details Card */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-8 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold mb-6 flex items-center justify-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        Event Details
                    </h3>
                    <div className="grid md:grid-cols-3 gap-6 text-left">
                        <div className="bg-white/5 p-4 rounded-xl">
                            <p className="text-slate-400 text-sm mb-1">Date</p>
                            <p className="font-semibold">{workshop.date}</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-xl">
                            <p className="text-slate-400 text-sm mb-1">Time</p>
                            <p className="font-semibold">{workshop.time}</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-xl">
                            <p className="text-slate-400 text-sm mb-1">Format</p>
                            <p className="font-semibold">{workshop.location || "Virtual Workshop"}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button size="lg" className="w-full sm:w-auto px-8 gap-2">
                        Add to Google Calendar
                    </Button>
                    <Button variant="outline" size="lg" className="w-full sm:w-auto px-8 gap-2 border-white/20 hover:bg-white/10 hover:text-white">
                        Download Outlook .ics
                    </Button>
                </div>

                <p className="mt-12 text-slate-500 text-sm">
                    Check your email ({'{email}'}) for access details.
                </p>
            </div>
        </div>
    );
}
