import { isCEOFamily } from "@/lib/assessments/respondent-levels";

export function memberGreeting(input: {
  firstName: string;
  lastName?: string;
  roleType: string | null;
  hour: number;
}): string {
  const dayPart = input.hour < 12 ? "morning" : input.hour < 18 ? "afternoon" : "evening";
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
  return `Good ${dayPart}, ${isCEOFamily(input.roleType) ? "CEO " : ""}${name}`;
}
