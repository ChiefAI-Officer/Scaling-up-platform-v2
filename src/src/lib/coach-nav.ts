import {
  Calendar,
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
  { href: "/portal/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/portal/registrations", label: "Registrations", icon: Users },
  { href: "/portal/request", label: "Request Workshop", icon: PlusCircle },
];

export const coachAccountNavItem: CoachNavItem = {
  href: "/portal/settings",
  label: "Settings",
  icon: Settings,
};
