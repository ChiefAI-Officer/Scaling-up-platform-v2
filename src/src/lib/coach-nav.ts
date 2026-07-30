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
  exact?: boolean;
}

const DASHBOARD_NAV_ITEM: CoachNavItem = {
  href: "/portal/home",
  label: "Dashboard",
  icon: LayoutDashboard,
};
const WORKSHOPS_NAV_ITEM: CoachNavItem = {
  href: "/portal/workshops",
  label: "My Workshops",
  icon: Calendar,
};
const MEMBERS_NAV_ITEM: CoachNavItem = {
  href: "/portal/members",
  label: "Members",
  icon: Building2,
};
const ASSESSMENTS_NAV_ITEM: CoachNavItem = {
  href: "/portal/assessments",
  label: "Assessments",
  icon: ClipboardList,
};
const REGISTRATIONS_NAV_ITEM: CoachNavItem = {
  href: "/portal/registrations",
  label: "Registrations",
  icon: Users,
};
const REQUEST_WORKSHOP_NAV_ITEM: CoachNavItem = {
  href: "/portal/request",
  label: "Request Workshop",
  icon: PlusCircle,
};

export const coachPrimaryNavItems: CoachNavItem[] = [
  DASHBOARD_NAV_ITEM,
  WORKSHOPS_NAV_ITEM,
  MEMBERS_NAV_ITEM,
  ASSESSMENTS_NAV_ITEM,
  REGISTRATIONS_NAV_ITEM,
  REQUEST_WORKSHOP_NAV_ITEM,
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
    DASHBOARD_NAV_ITEM,
    WORKSHOPS_NAV_ITEM,
    {
      href: "/portal/assessments",
      label: "My Campaigns",
      icon: ClipboardList,
      exact: true,
    },
    {
      href: "/portal/assessments/referred-results",
      label: "Referred Results",
      icon: ClipboardCheck,
    },
    MEMBERS_NAV_ITEM,
    REGISTRATIONS_NAV_ITEM,
    REQUEST_WORKSHOP_NAV_ITEM,
  ];
}

export const coachAccountNavItem: CoachNavItem = {
  href: "/portal/settings",
  label: "Settings",
  icon: Settings,
};
