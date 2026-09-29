import { Layers, Plus, Settings, Sun, type LucideIcon } from "lucide-react";

import { routes } from "@/lib/site";

export type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
  primary?: boolean;
};

export const appNav: NavItem[] = [
  {
    href: routes.appHome,
    label: "Today",
    shortLabel: "Today",
    icon: Sun,
    isActive: (p) => p === routes.appHome,
  },
  {
    href: routes.plans,
    label: "My Plans",
    shortLabel: "Plans",
    icon: Layers,
    isActive: (p) =>
      ((p === routes.plans || p.startsWith(`${routes.plans}/`)) && !p.startsWith(routes.newPlan)) || p.startsWith(routes.manifested),
  },
  {
    href: routes.newPlan,
    label: "New Plan",
    shortLabel: "New",
    icon: Plus,
    isActive: (p) => p.startsWith(routes.newPlan),
    primary: true,
  },
  {
    href: routes.settings,
    label: "Settings",
    shortLabel: "Settings",
    icon: Settings,
    isActive: (p) => p.startsWith(routes.settings),
  },
];
