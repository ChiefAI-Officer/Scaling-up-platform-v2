import {
  Building2,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  PlusCircle,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface CoachNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const coachPrimaryNavItems: CoachNavItem[] = [
  { href: "/portal/home", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/workshops", label: "My Workshops", icon: Calendar },
  { href: "/portal/members", label: "Members", icon: Building2 },
  { href: "/portal/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/portal/registrations", label: "Registrations", icon: Users },
  { href: "/portal/request", label: "Request Workshop", icon: PlusCircle },
];

interface CoachPrimaryNavOptions {
  referredResultsEnabled: boolean;
}

export function getCoachPrimaryNavItems({
  referredResultsEnabled,
}: CoachPrimaryNavOptions): CoachNavItem[] {
  if (!referredResultsEnabled) {
    return coachPrimaryNavItems;
  }

  return [
    coachPrimaryNavItems[0],
    coachPrimaryNavItems[1],
    {
      href: "/portal/assessments",
      label: "My Campaigns",
      icon: ClipboardList,
    },
    {
      href: "/portal/assessments/referred-results",
      label: "Referred Results",
      icon: ClipboardCheck,
    },
    coachPrimaryNavItems[2],
    coachPrimaryNavItems[4],
    coachPrimaryNavItems[5],
  ];
}

export const coachAccountNavItem: CoachNavItem = {
  href: "/portal/settings",
  label: "Settings",
  icon: Settings,
};
