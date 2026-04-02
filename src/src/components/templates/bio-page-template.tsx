"use client";

import { stripPlaceholders } from "@/lib/template-utils";

export interface BioContent {
  profileImageUrl?: string;
  coachName?: string;
  coachTitle?: string;
  biography?: string;
  showCtaButton?: boolean;
  ctaButtonUrl?: string;
  ctaButtonText?: string;
}


export const SAMPLE_BIO_CONTENT: BioContent = {
  coachName: "Sample Coach",
  coachTitle: "Scaling Up Certified Coach",
  biography: "Sample Coach has helped dozens of mid-market companies scale effectively using the Scaling Up methodology.\n\nWith over 15 years of experience, Sample brings practical wisdom and strategic clarity to every engagement.",
  profileImageUrl: "",
  showCtaButton: true,
  ctaButtonUrl: "#",
  ctaButtonText: "Book a Free Call",
};

export function BioPageTemplate({
  content,
  isPreview = false,
}: {
  content: BioContent;
  isPreview?: boolean;
}) {
  const name = stripPlaceholders(content.coachName);
  const title = stripPlaceholders(content.coachTitle);
  const bio = stripPlaceholders(content.biography);
  const profileImage = content.profileImageUrl || "";
  const showCtaButton = content.showCtaButton !== false;
  const ctaUrl = content.ctaButtonUrl || "#";
  const ctaText = stripPlaceholders(content.ctaButtonText) || "Book a Call";

  return (
    <div className="min-h-screen bg-card">
      {/* Preview banner */}
      {isPreview && (
        <div className="bg-muted border-b px-4 py-1 text-center">
          <span className="text-xs text-muted-foreground">Preview — sample data shown</span>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="text-primary font-bold text-xl tracking-wider mb-12">
          SCALING UP COACHES
        </div>

        {profileImage && (
          <img
            src={profileImage}
            alt={name}
            className="w-40 h-40 rounded-full object-cover mx-auto mb-6 border-4 border-primary/20"
          />
        )}

        <h1 className="text-3xl font-bold text-foreground mb-2">{name}</h1>
        <p className="text-muted-foreground mb-8">{title}</p>

        <div className="text-left text-foreground space-y-4 mb-10">
          {bio.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        {showCtaButton && (
          isPreview ? (
            <button
              type="button"
              disabled
              className="inline-block bg-primary text-white px-8 py-4 rounded-full font-semibold opacity-60 cursor-not-allowed"
            >
              {ctaText}
            </button>
          ) : (
            <a
              href={ctaUrl}
              className="inline-block bg-primary text-white px-8 py-4 rounded-full font-semibold hover:bg-primary/90 transition"
            >
              {ctaText}
            </a>
          )
        )}

        <div className="mt-16 pt-8 border-t text-muted-foreground text-sm">
          © {new Date().getFullYear()} Scaling Up Coach {name.split(" ")[0]}
        </div>
      </div>
    </div>
  );
}
