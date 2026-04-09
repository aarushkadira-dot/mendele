import React from 'react';

export type LucideIcon = React.ElementType;

// Extract the numeric size from tailwind w-* or h-* classes safely
const getTailwindSize = (className: string = '') => {
  const match = className.match(/\b(?:w|h)-(\d+|\[.*?\])\b/);
  if (!match) return undefined;
  // Basic tailwind mapping: 4=1rem, 5=1.25rem, 6=1.5rem, etc.
  const val = match[1];
  if (val.startsWith('[')) return val.slice(1, -1);
  return `${Number(val) * 0.25}rem`;
};

// Base BoxIcon component
export const BoxIcon = ({ name, className, size, color, strokeWidth, ...props }: any) => {
  const twSize = getTailwindSize(className);
  
  // Provide either the explicit size, the inferred tailwind size, or fallback to inherit
  const dimensionStyles = {
    width: size || twSize || '1em',
    height: size || twSize || '1em',
    fontSize: size || twSize || 'inherit',
    color: color || 'currentColor',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  return (
    <i 
      className={`bx ${name} ${className || ""}`} 
      style={{ ...dimensionStyles, ...(props.style || {}) }} 
      {...props} 
    />
  );
};

// Exports for every Lucide icon used in the project
export const Activity = (props: any) => <BoxIcon name="bx-pulse" {...props} />
export const AlertCircle = (props: any) => <BoxIcon name="bx-error-circle" {...props} />
export const AlertTriangle = (props: any) => <BoxIcon name="bx-error" {...props} />
export const Archive = (props: any) => <BoxIcon name="bx-archive" {...props} />
export const ArrowDownRight = (props: any) => <BoxIcon name="bx-down-arrow-alt" {...props} />
export const ArrowRight = (props: any) => <BoxIcon name="bx-right-arrow-alt" {...props} />
export const ArrowUpIcon = (props: any) => <BoxIcon name="bx-up-arrow-alt" {...props} />
export const ArrowUpRight = (props: any) => <BoxIcon name="bx-up-arrow-alt" {...props} /> // Fallback mapping
export const Award = (props: any) => <BoxIcon name="bx-award" {...props} />
export const BookOpen = (props: any) => <BoxIcon name="bx-book-open" {...props} />
export const Bookmark = (props: any) => <BoxIcon name="bx-bookmark" {...props} />
export const BookmarkCheck = (props: any) => <BoxIcon name="bx-book-bookmark" {...props} />
export const Brain = (props: any) => <BoxIcon name="bx-brain" {...props} />
export const BrainCircuit = (props: any) => <BoxIcon name="bx-network-chart" {...props} />
export const Briefcase = (props: any) => <BoxIcon name="bx-briefcase" {...props} />
export const Bug = (props: any) => <BoxIcon name="bx-bug" {...props} />
export const Building = (props: any) => <BoxIcon name="bx-buildings" {...props} />
export const Building2 = (props: any) => <BoxIcon name="bx-buildings" {...props} />
export const Calendar = (props: any) => <BoxIcon name="bx-calendar" {...props} />
export const CalendarClock = (props: any) => <BoxIcon name="bx-calendar-event" {...props} />
export const CalendarDays = (props: any) => <BoxIcon name="bx-calendar-alt" {...props} />
export const Check = (props: any) => <BoxIcon name="bx-check" {...props} />
export const CheckCircle2 = (props: any) => <BoxIcon name="bx-check-circle" {...props} />
export const CheckIcon = (props: any) => <BoxIcon name="bx-check" {...props} />
export const ChevronDown = (props: any) => <BoxIcon name="bx-chevron-down" {...props} />
export const ChevronDownIcon = (props: any) => <BoxIcon name="bx-chevron-down" {...props} />
export const ChevronLeft = (props: any) => <BoxIcon name="bx-chevron-left" {...props} />
export const ChevronRight = (props: any) => <BoxIcon name="bx-chevron-right" {...props} />
export const ChevronRightIcon = (props: any) => <BoxIcon name="bx-chevron-right" {...props} />
export const ChevronUp = (props: any) => <BoxIcon name="bx-chevron-up" {...props} />
export const ChevronUpIcon = (props: any) => <BoxIcon name="bx-chevron-up" {...props} />
export const ChevronsUpDown = (props: any) => <BoxIcon name="bx-collapse" {...props} />
export const Circle = (props: any) => <BoxIcon name="bx-circle" {...props} />
export const CircleDollarSign = (props: any) => <BoxIcon name="bx-dollar-circle" {...props} />
export const CircleIcon = (props: any) => <BoxIcon name="bx-circle" {...props} />
export const CircleUserRound = (props: any) => <BoxIcon name="bx-user-circle" {...props} />
export const Clock = (props: any) => <BoxIcon name="bx-time-five" {...props} />
export const Code = (props: any) => <BoxIcon name="bx-code" {...props} />
export const Code2 = (props: any) => <BoxIcon name="bx-code-alt" {...props} />
export const Copy = (props: any) => <BoxIcon name="bx-copy" {...props} />
export const CreditCard = (props: any) => <BoxIcon name="bx-credit-card" {...props} />
export const Crown = (props: any) => <BoxIcon name="bx-crown" {...props} />
export const Database = (props: any) => <BoxIcon name="bx-data" {...props} />
export const DollarSign = (props: any) => <BoxIcon name="bx-dollar" {...props} />
export const Download = (props: any) => <BoxIcon name="bx-download" {...props} />
export const Edit3 = (props: any) => <BoxIcon name="bx-edit" {...props} />
export const ExternalLink = (props: any) => <BoxIcon name="bx-link-external" {...props} />
export const Eye = (props: any) => <BoxIcon name="bx-show" {...props} />
export const EyeOff = (props: any) => <BoxIcon name="bx-hide" {...props} />
export const FileCheck = (props: any) => <BoxIcon name="bx-file" {...props} />
export const FileText = (props: any) => <BoxIcon name="bx-file-blank" {...props} />
export const FileUp = (props: any) => <BoxIcon name="bx-upload" {...props} />
export const Filter = (props: any) => <BoxIcon name="bx-filter-alt" {...props} />
export const Flag = (props: any) => <BoxIcon name="bx-flag" {...props} />
export const FlaskConical = (props: any) => <BoxIcon name="bx-test-tube" {...props} />
export const FolderKanban = (props: any) => <BoxIcon name="bx-folder" {...props} />
export const FolderOpen = (props: any) => <BoxIcon name="bx-folder-open" {...props} />
export const GitBranch = (props: any) => <BoxIcon name="bx-git-branch" {...props} />
export const Github = (props: any) => <BoxIcon name="bxl-github" {...props} />
export const Globe = (props: any) => <BoxIcon name="bx-globe" {...props} />
export const GraduationCap = (props: any) => <BoxIcon name="bxs-graduation" {...props} />
export const Heart = (props: any) => <BoxIcon name="bx-heart" {...props} />
export const History = (props: any) => <BoxIcon name="bx-history" {...props} />
export const Home = (props: any) => <BoxIcon name="bx-home-alt" {...props} />
export const ImageIcon = (props: any) => <BoxIcon name="bx-image" {...props} />
export const Inbox = (props: any) => <BoxIcon name="bx-inbox" {...props} />
export const Info = (props: any) => <BoxIcon name="bx-info-circle" {...props} />
export const Layers = (props: any) => <BoxIcon name="bx-layer" {...props} />
export const LayoutDashboard = (props: any) => <BoxIcon name="bx-grid-alt" {...props} />
export const Lightbulb = (props: any) => <BoxIcon name="bx-bulb" {...props} />
export const Link = (props: any) => <BoxIcon name="bx-link" {...props} />
export const Link2 = (props: any) => <BoxIcon name="bx-link-alt" {...props} />
export const Linkedin = (props: any) => <BoxIcon name="bxl-linkedin" {...props} />
export const Loader2 = (props: any) => <BoxIcon name="bx-loader-alt bx-spin" {...props} />
export const Lock = (props: any) => <BoxIcon name="bx-lock-alt" {...props} />
export const LogOut = (props: any) => <BoxIcon name="bx-log-out" {...props} />
export const Mail = (props: any) => <BoxIcon name="bx-envelope" {...props} />
export const Map = (props: any) => <BoxIcon name="bx-map-alt" {...props} />
export const MapPin = (props: any) => <BoxIcon name="bx-map" {...props} />
export const Menu = (props: any) => <BoxIcon name="bx-menu" {...props} />
export const MessageCircle = (props: any) => <BoxIcon name="bx-message-rounded" {...props} />
export const MessageSquare = (props: any) => <BoxIcon name="bx-message-square" {...props} />
export const Milestone = (props: any) => <BoxIcon name="bx-map-pin" {...props} />
export const Minus = (props: any) => <BoxIcon name="bx-minus" {...props} />
export const MonitorIcon = (props: any) => <BoxIcon name="bx-desktop" {...props} />
export const MoreHorizontal = (props: any) => <BoxIcon name="bx-dots-horizontal-rounded" {...props} />
export const MoreVertical = (props: any) => <BoxIcon name="bx-dots-vertical-rounded" {...props} />
export const Palette = (props: any) => <BoxIcon name="bx-palette" {...props} />
export const PanelLeft = (props: any) => <BoxIcon name="bx-sidebar" {...props} />
export const PanelLeftClose = (props: any) => <BoxIcon name="bx-collapse" {...props} />
export const PanelLeftOpen = (props: any) => <BoxIcon name="bx-expand" {...props} />
export const Paperclip = (props: any) => <BoxIcon name="bx-paperclip" {...props} />
export const PenTool = (props: any) => <BoxIcon name="bx-pen" {...props} />
export const Pencil = (props: any) => <BoxIcon name="bx-pencil" {...props} />
export const Plus = (props: any) => <BoxIcon name="bx-plus" {...props} />
export const PlusCircle = (props: any) => <BoxIcon name="bx-plus-circle" {...props} />
export const PlusIcon = (props: any) => <BoxIcon name="bx-plus" {...props} />
export const Presentation = (props: any) => <BoxIcon name="bx-chalkboard" {...props} />
export const Quote = (props: any) => <BoxIcon name="bxs-quote-alt-left" {...props} />
export const RefreshCw = (props: any) => <BoxIcon name="bx-refresh" {...props} />
export const Rocket = (props: any) => <BoxIcon name="bx-rocket" {...props} />
export const RotateCcw = (props: any) => <BoxIcon name="bx-rotate-left" {...props} />
export const Rss = (props: any) => <BoxIcon name="bx-rss" {...props} />
export const Search = (props: any) => <BoxIcon name="bx-search" {...props} />
export const SearchX = (props: any) => <BoxIcon name="bx-search-alt" {...props} />
export const Send = (props: any) => <BoxIcon name="bx-send" {...props} />
export const Server = (props: any) => <BoxIcon name="bx-server" {...props} />
export const Settings = (props: any) => <BoxIcon name="bx-cog" {...props} />
export const Share2 = (props: any) => <BoxIcon name="bx-share-alt" {...props} />
export const Shield = (props: any) => <BoxIcon name="bx-shield" {...props} />
export const SlidersHorizontal = (props: any) => <BoxIcon name="bx-slider-alt" {...props} />
export const Sparkles = (props: any) => <BoxIcon name="bxs-magic-wand" {...props} />
export const Square = (props: any) => <BoxIcon name="bx-square" {...props} />
export const Star = (props: any) => <BoxIcon name="bx-star" {...props} />
export const Tag = (props: any) => <BoxIcon name="bx-tag" {...props} />
export const Target = (props: any) => <BoxIcon name="bx-target-lock" {...props} />
export const Telescope = (props: any) => <BoxIcon name="bx-camera" {...props} />
export const Terminal = (props: any) => <BoxIcon name="bx-terminal" {...props} />
export const ThumbsDown = (props: any) => <BoxIcon name="bx-dislike" {...props} />
export const ThumbsUp = (props: any) => <BoxIcon name="bx-like" {...props} />
export const Ticket = (props: any) => <BoxIcon name="bx-receipt" {...props} />
export const Timer = (props: any) => <BoxIcon name="bx-timer" {...props} />
export const Trash2 = (props: any) => <BoxIcon name="bx-trash" {...props} />
export const TrendingDown = (props: any) => <BoxIcon name="bx-trending-down" {...props} />
export const TrendingUp = (props: any) => <BoxIcon name="bx-trending-up" {...props} />
export const Trophy = (props: any) => <BoxIcon name="bx-trophy" {...props} />
export const User = (props: any) => <BoxIcon name="bx-user" {...props} />
export const UserCheck = (props: any) => <BoxIcon name="bx-user-check" {...props} />
export const UserPlus = (props: any) => <BoxIcon name="bx-user-plus" {...props} />
export const UserRound = (props: any) => <BoxIcon name="bx-user-circle" {...props} />
export const Users = (props: any) => <BoxIcon name="bx-group" {...props} />
export const Users2 = (props: any) => <BoxIcon name="bx-group" {...props} />
export const Wifi = (props: any) => <BoxIcon name="bx-wifi" {...props} />
export const Wrench = (props: any) => <BoxIcon name="bx-wrench" {...props} />
export const X = (props: any) => <BoxIcon name="bx-x" {...props} />
export const XCircle = (props: any) => <BoxIcon name="bx-x-circle" {...props} />
export const XIcon = (props: any) => <BoxIcon name="bx-x" {...props} />
export const Zap = (props: any) => <BoxIcon name="bx-bolt" {...props} />
