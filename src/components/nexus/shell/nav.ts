import {
  BarChart3Icon,
  CircleHelpIcon,
  CreditCardIcon,
  HandshakeIcon,
  HomeIcon,
  LightbulbIcon,
  PiggyBankIcon,
  NetworkIcon,
  PackageIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** One-line explanation shown under the label / in tooltips. */
  hint: string;
  icon: LucideIcon;
  /** Extra path prefixes that should mark this item active. */
  match?: string[];
}

/** The four places a shopper actually needs. */
export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Home", hint: "Start a new request", icon: HomeIcon, match: ["/voice"] },
  { href: "/discover", label: "Browse", hint: "See products and prices", icon: ShoppingBagIcon },
  { href: "/negotiations", label: "My deals", hint: "Offers your agent found", icon: HandshakeIcon, match: ["/deals", "/verification", "/s/"] },
  { href: "/orders", label: "Orders", hint: "Approve, pay and track", icon: PackageIcon },
];

/** Everything else, tucked under "More". */
export const MORE_NAV: NavItem[] = [
  { href: "/money", label: "Money plan", hint: "Pay, bills, goals and spending", icon: PiggyBankIcon },
  { href: "/security", label: "Security center", hint: "AI firewall and fraud checks", icon: ShieldCheckIcon },
  { href: "/how-it-works", label: "How it works", hint: "The idea in two minutes", icon: LightbulbIcon },
  { href: "/payments", label: "Payments", hint: "Payment history", icon: CreditCardIcon },
  { href: "/wallet", label: "Wallet", hint: "Ways to pay", icon: WalletIcon },
  { href: "/agents", label: "Meet the agents", hint: "Who negotiates for you", icon: NetworkIcon },
  { href: "/analytics", label: "Insights", hint: "Your savings and stats", icon: BarChart3Icon, match: ["/intelligence"] },
  { href: "/settings", label: "Settings", hint: "Preferences", icon: SettingsIcon },
  { href: "/help", label: "Help", hint: "How AtoZAIx works", icon: CircleHelpIcon },
];

export function isActive(pathname: string | null, item: Pick<NavItem, "href" | "match">): boolean {
  if (!pathname) return false;
  if (item.href === "/") return pathname === "/" || (item.match ?? []).some((m) => pathname.startsWith(m));
  return pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.match ?? []).some((m) => pathname.startsWith(m));
}
