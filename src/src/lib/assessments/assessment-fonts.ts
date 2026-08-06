// src/src/lib/assessments/assessment-fonts.ts
import { Inter, Playfair_Display, Roboto } from "next/font/google";

export const assessmentRoboto = Roboto({ variable: "--font-assessment-body", subsets: ["latin"], weight: ["400", "500", "700"] });
export const assessmentInter = Inter({
  variable: "--font-assessment-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});
export const assessmentPlayfairDisplay = Playfair_Display({
  variable: "--font-assessment-display",
  subsets: ["latin"],
  weight: ["700"],
});
