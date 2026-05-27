import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bookmark,
  Briefcase,
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  Heart,
  Image as ImageIcon,
  AtSign,
  KeyRound,
  LayoutGrid,
  Link as LinkIcon,
  List,
  ListFilter,
  LocateFixed,
  Lock,
  LogOut,
  Mail,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  MoreHorizontal,
  MoreVertical,
  Package,
  Pencil,
  Phone,
  PlaySquare,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Unlock,
  User,
  Users,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

/**
 * Unified Icon Component System (Lucide-backed facade).
 *
 * Public API is unchanged from the previous inline-SVG implementation:
 *   <Icon name="search" size={20} className="…" filled active strokeWidth={2} />
 *
 * Rules (kept from the original):
 * - One icon per semantic meaning.
 * - Sizes via Tailwind classes (12/14/16/18/20/24/32/48/64).
 * - `filled`/`active` toggles fill on iconography that supports it (heart/star/favorite/bookmark).
 *
 * Implementation notes:
 * - Each icon is a named import from `lucide-react`. Combined with
 *   `modularizeImports` in next.config.ts, only the icons we list here ship.
 * - `aria-hidden` is on by default — these are decorative.
 * - This file is intentionally NOT a client component. Lucide icons render
 *   on the server, which lets pages stay RSC where possible.
 */

export type IconName =
  | "search"
  | "favorite"
  | "profile"
  | "users"
  | "back"
  | "forward"
  | "close"
  | "share"
  | "edit"
  | "delete"
  | "settings"
  | "filter"
  | "map"
  | "location"
  | "photo"
  | "phone"
  | "website"
  | "instagram"
  | "youtube"
  | "telegram"
  | "add"
  | "remove"
  | "check"
  | "heart"
  | "key"
  | "comment"
  | "calendar"
  | "clock"
  | "link"
  | "external-link"
  | "eye"
  | "eye-off"
  | "lock"
  | "unlock"
  | "star"
  | "grid"
  | "list"
  | "zoom-in"
  | "zoom-out"
  | "my-location"
  | "chevron-down"
  | "chevron-up"
  | "arrow-up"
  | "arrow-down"
  | "more-vertical"
  | "more-horizontal"
  | "logout"
  | "bookmark"
  | "package"
  | "maximize"
  | "minimize"
  | "briefcase"
  | "calendar-days"
  | "mail"
  | "alert-circle"
  | "activity"
  | "sparkles"
  | "wrench"
  | "bar-chart";

type IconProps = {
  name: IconName;
  size?: 12 | 14 | 16 | 18 | 20 | 24 | 32 | 48 | 64;
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
  active?: boolean;
};

const sizeMap: Record<number, string> = {
  12: "w-3 h-3",
  14: "w-3.5 h-3.5",
  16: "w-4 h-4",
  18: "w-[18px] h-[18px]",
  20: "w-5 h-5",
  24: "w-6 h-6",
  32: "w-8 h-8",
  48: "w-12 h-12",
  64: "w-16 h-16",
};

const iconMap: Record<IconName, LucideIcon> = {
  search: Search,
  favorite: Bookmark,
  profile: User,
  users: Users,
  back: ChevronLeft,
  forward: ChevronRight,
  close: X,
  share: Share2,
  edit: Pencil,
  delete: Trash2,
  settings: Settings,
  filter: ListFilter,
  map: MapIcon,
  location: MapPin,
  photo: ImageIcon,
  phone: Phone,
  website: Globe2,
  instagram: AtSign,
  youtube: PlaySquare,
  telegram: Send,
  add: Plus,
  remove: Minus,
  check: Check,
  heart: Heart,
  key: KeyRound,
  comment: MessageCircle,
  calendar: Calendar,
  clock: Clock,
  link: LinkIcon,
  "external-link": ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  lock: Lock,
  unlock: Unlock,
  star: Star,
  grid: LayoutGrid,
  list: List,
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut,
  "my-location": LocateFixed,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  "more-vertical": MoreVertical,
  "more-horizontal": MoreHorizontal,
  logout: LogOut,
  bookmark: Bookmark,
  package: Package,
  maximize: Maximize2,
  minimize: Minimize2,
  briefcase: Briefcase,
  "calendar-days": CalendarDays,
  mail: Mail,
  "alert-circle": AlertCircle,
  activity: Activity,
  sparkles: Sparkles,
  wrench: Wrench,
  "bar-chart": BarChart3,
};

/** Icons that visually swap to a filled style when `filled`/`active` is true. */
const FILLABLE: ReadonlySet<IconName> = new Set<IconName>([
  "heart",
  "star",
  "favorite",
  "bookmark",
]);

export default function Icon({
  name,
  size = 20,
  className = "",
  strokeWidth = 2,
  filled = false,
  active = false,
}: IconProps) {
  const LucideComp = iconMap[name];

  if (!LucideComp) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Icon "${name}" not found`);
    }
    return null;
  }

  const sizeClass = sizeMap[size];
  const isFilled = (filled || active) && FILLABLE.has(name);

  return (
    <LucideComp
      className={`${sizeClass} ${className}`}
      strokeWidth={isFilled ? 0 : strokeWidth}
      fill={isFilled ? "currentColor" : "none"}
      aria-hidden="true"
    />
  );
}
