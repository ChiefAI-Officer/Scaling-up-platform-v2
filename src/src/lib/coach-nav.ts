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

export interface CoachNavGroup {
  label: string | null;
  items: CoachNavItem[];
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

const DASHBOARD_NAV_GROUP: CoachNavGroup = {
  label: null,
  items: [DASHBOARD_NAV_ITEM],
};

const WORKSHOPS_NAV_GROUP: CoachNavGroup = {
  label: "WORKSHOPS",
  items: [
    WORKSHOPS_NAV_ITEM,
    REGISTRATIONS_NAV_ITEM,
    REQUEST_WORKSHOP_NAV_ITEM,
  ],
};

export const coachPrimaryNavItems: CoachNavGroup[] = [
  DASHBOARD_NAV_GROUP,
  WORKSHOPS_NAV_GROUP,
  {
    label: "ASSESSMENTS",
    items: [ASSESSMENTS_NAV_ITEM, MEMBERS_NAV_ITEM],
  },
];

interface CoachPrimaryNavOptions {
  referredResultsEnabled: boolean;
}

export function getCoachPrimaryNavItems({
  referredResultsEnabled,
}: CoachPrimaryNavOptions): CoachNavGroup[] {
  if (!referredResultsEnabled) {
    return coachPrimaryNavItems;
  }

  return [
    DASHBOARD_NAV_GROUP,
    WORKSHOPS_NAV_GROUP,
    {
      label: "ASSESSMENTS",
      items: [
        {
          href: "/portal/assessments",
          label: "My Campaigns",
          icon: ClipboardList,
          exact: true,
        },
        {
          href: "/portal/assessments/referred-results",
          label: "Public Assessments",
          icon: ClipboardCheck,
        },
        MEMBERS_NAV_ITEM,
      ],
    },
  ];
}

export const coachAccountNavItem: CoachNavItem = {
  href: "/portal/settings",
  label: "Settings",
  icon: Settings,
};
