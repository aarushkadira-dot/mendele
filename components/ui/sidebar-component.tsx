"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
 Search as SearchIcon,
 Dashboard,
 Task,
 Folder,
 Calendar as CalendarIcon,
 UserMultiple,
 Analytics,
 DocumentAdd,
 Settings as SettingsIcon,
 User as UserIcon,
 ChevronDown as ChevronDownIcon,
 AddLarge,
 Filter,
 Time,
 InProgress,
 CheckmarkOutline,
 Flag,
 Archive,
 View,
 Report,
 StarFilled,
 Group,
 ChartBar,
 FolderOpen,
 Share,
 CloudUpload,
 Security,
 Notification,
 Integration,
} from "@carbon/icons-react";
import { Briefcase, MessageSquare } from "lucide-react";
import Image from "next/image";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { useSupabaseUser } from "@/hooks/use-supabase-user";
import { cn } from "@/lib/utils";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
 DropdownMenuSeparator,
 DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserSettings, Shield, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";

/** ======================= Local SVG paths (inline) ======================= */
const svgPaths = {
 p36880f80: "M0.32 0C0.20799 0 0.151984 0 0.109202 0.0217987C0.0715695 0.0409734 0.0409734 0.0715695 0.0217987 0.109202C0 0.151984 0 0.20799 0 0.32V6.68C0 6.79201 0 6.84801 0.0217987 6.8908C0.0409734 6.92843 0.0715695 6.95902 0.109202 6.9782C0.151984 7 0.207989 7 0.32 7L3.68 7C3.79201 7 3.84802 7 3.8908 6.9782C3.92843 6.95903 3.95903 6.92843 3.9782 6.8908C4 6.84801 4 6.79201 4 6.68V4.32C4 4.20799 4 4.15198 4.0218 4.1092C4.04097 4.07157 4.07157 4.04097 4.1092 4.0218C4.15198 4 4.20799 4 4.32 4L19.68 4C19.792 4 19.848 4 19.8908 4.0218C19.9284 4.04097 19.959 4.07157 19.9782 4.1092C20 4.15198 20 4.20799 20 4.32V6.68C20 6.79201 20 6.84802 20.0218 6.8908C20.041 6.92843 20.0716 6.95903 20.1092 6.9782C20.152 7 20.208 7 20.32 7L23.68 7C23.792 7 23.848 7 23.8908 6.9782C23.9284 6.95903 23.959 6.92843 23.9782 6.8908C24 6.84802 24 6.79201 24 6.68V0.32C24 0.20799 24 0.151984 23.9782 0.109202C23.959 0.0715695 23.9284 0.0409734 23.8908 0.0217987C23.848 0 23.792 0 23.68 0H0.32Z",
 p355df480: "M0.32 16C0.20799 16 0.151984 16 0.109202 15.9782C0.0715695 15.959 0.0409734 15.9284 0.0217987 15.8908C0 15.848 0 15.792 0 15.68V9.32C0 9.20799 0 9.15198 0.0217987 9.1092C0.0409734 9.07157 0.0715695 9.04097 0.109202 9.0218C0.151984 9 0.207989 9 0.32 9H3.68C3.79201 9 3.84802 9 3.8908 9.0218C3.92843 9.04097 3.95903 9.07157 3.9782 9.1092C4 9.15198 4 9.20799 4 9.32V11.68C4 11.792 4 11.848 4.0218 11.8908C4.04097 11.9284 4.07157 11.959 4.1092 11.9782C4.15198 12 4.20799 12 4.32 12L19.68 12C19.792 12 19.848 12 19.8908 11.9782C19.9284 11.959 19.959 11.9284 19.9782 11.8908C20 11.848 20 11.792 20 11.68V9.32C20 9.20799 20 9.15199 20.0218 9.1092C20.041 9.07157 20.0716 9.04098 20.1092 9.0218C20.152 9 20.208 9 20.32 9H23.68C23.792 9 23.848 9 23.8908 9.0218C23.9284 9.04098 23.959 9.07157 23.9782 9.1092C24 9.15199 24 9.20799 24 9.32V15.68C24 15.792 24 15.848 23.9782 15.8908C23.959 15.9284 23.9284 15.959 23.8908 15.9782C23.848 16 23.792 16 23.68 16H0.32Z",
 pfa0d600: "M6.32 10C6.20799 10 6.15198 10 6.1092 9.9782C6.07157 9.95903 6.04097 9.92843 6.0218 9.8908C6 9.84802 6 9.79201 6 9.68V6.32C6 6.20799 6 6.15198 6.0218 6.1092C6.04097 6.07157 6.07157 6.04097 6.1092 6.0218C6.15198 6 6.20799 6 6.32 6L17.68 6C17.792 6 17.848 6 17.8908 6.0218C17.9284 6.04097 17.959 6.07157 17.9782 6.1092C18 6.15198 18 6.20799 18 6.32V9.68C18 9.79201 18 9.84802 17.9782 9.8908C17.959 9.92843 17.9284 9.95903 17.8908 9.9782C17.848 10 17.792 10 17.68 10H6.32Z",
};
/** ======================================================================= */

const softSpringEasing = "cubic-bezier(0.25, 1.1, 0.4, 1)";

function InterfacesLogoSquare({ className }: { className?: string }) {
 return (
 <div className={cn("relative shrink-0 flex items-center justify-center", className)}>
 <svg className="h-auto w-full" fill="none" viewBox="0 0 24 16">
 <g fill="currentColor">
 <path d={svgPaths.p36880f80} />
 <path d={svgPaths.p355df480} />
 <path d={svgPaths.pfa0d600} />
 </g>
 </svg>
 </div>
 );
}

function BrandBadge() {
 return (
 <div className="relative shrink-0 w-full mb-4 mt-2 px-1">
 <div className="flex items-center gap-2.5 w-full">
 <div className="size-8 flex items-center justify-center">
 <InterfacesLogoSquare className="text-primary w-7 h-7" />
 </div>
 </div>
 </div>
 );
}

function AvatarCircle() {
 const { user } = useSupabaseUser();
 const userAvatar = (user?.user_metadata?.avatar_url as string | undefined) || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=100";

 return (
 <div className="relative rounded-full shrink-0 size-8 overflow-hidden bg-muted">
 <img src={userAvatar} alt="Profile" className="size-full object-cover" />
 <div
 aria-hidden="true"
 className="absolute inset-0 rounded-full border border-border pointer-events-none"
 />
 </div>
 );
}

function SearchContainer({ isCollapsed = false }: { isCollapsed?: boolean }) {
 const [searchValue, setSearchValue] = useState("");

 return (
 <div
 className={`relative shrink-0 transition-all duration-500 mb-4 ${
 isCollapsed ? "w-full flex justify-center" : "w-full"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 >
 <div
 className={`bg-zinc-100 dark:bg-zinc-900 border border-border/40 h-10 relative rounded-lg flex items-center transition-all duration-500 ${
 isCollapsed ? "w-10 min-w-10 justify-center" : "w-full"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 >
 <div
 className={`flex items-center justify-center shrink-0 transition-all duration-500 ${
 isCollapsed ? "p-1" : "px-1"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 >
 <div className="size-8 flex items-center justify-center">
 <SearchIcon size={16} className="text-blue-400" />
 </div>
 </div>

 <div
 className={`flex-1 relative transition-opacity duration-500 overflow-hidden ${
 isCollapsed ? "opacity-0 w-0" : "opacity-100"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 >
 <div className="flex flex-col justify-center size-full">
 <div className="flex flex-col gap-2 items-start justify-center pr-2 py-1 w-full">
 <input
 type="text"
 placeholder="Search..."
 value={searchValue}
 onChange={(e) => setSearchValue(e.target.value)}
 className="w-full bg-transparent border-none outline-none font-sans text-[14px] text-foreground placeholder:text-muted-foreground leading-[20px]"
 tabIndex={isCollapsed ? -1 : 0}
 />
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}

interface MenuItemT {
 icon?: React.ReactNode;
 label: string;
 href?: string;
 hasDropdown?: boolean;
 isActive?: boolean;
 children?: MenuItemT[];
}
interface MenuSectionT {
 title: string;
 items: MenuItemT[];
}
interface SidebarContent {
 title: string;
 sections: MenuSectionT[];
}

function getSidebarContent(activeSection: string, currentPath: string): SidebarContent {
 // Map our networkly routes to this new visual layout structure:
 const contentMap: Record<string, SidebarContent> = {
 dashboard: {
 title: "Networkly",
 sections: [
 {
 title: "Core Platform",
 items: [
 { icon: <Dashboard size={16} className="text-blue-400" />, label: "Dashboard", href: "/dashboard", isActive: currentPath === "/dashboard" },
 { icon: <UserIcon size={16} className="text-blue-400" />, label: "Profile", href: "/profile", isActive: currentPath === "/profile" },
 { icon: <Briefcase size={16} className="text-blue-400" />, label: "Opportunities", href: "/opportunities", isActive: currentPath === "/opportunities" },
 { icon: <MessageSquare size={16} className="text-blue-400" />, label: "Network", href: "/network", isActive: currentPath === "/network" },
 ],
 },
 {
 title: "Discovery & Tools",
 items: [
 { icon: <FolderOpen size={16} className="text-blue-400" />, label: "Projects", href: "/projects", isActive: currentPath === "/projects" },
 { icon: <Group size={16} className="text-blue-400" />, label: "Business", href: "/business", isActive: currentPath === "/business" },
 { icon: <SearchIcon size={16} className="text-blue-400" />, label: "Researchers", href: "/researchers", isActive: currentPath === "/researchers" },
 { icon: <Report size={16} className="text-blue-400" />, label: "Research Data", href: "/research", isActive: currentPath === "/research" },
 ],
 },
 {
 title: "Intelligent Features",
 items: [
 { icon: <StarFilled size={16} className="text-blue-400" />, label: "AI Assistant", href: "/assistant", isActive: currentPath === "/assistant" },
 ],
 },
 ],
 },
 settings: {
 title: "Settings",
 sections: [
 {
 title: "Account",
 items: [
 { icon: <UserIcon size={16} className="text-blue-400" />, label: "Profile settings", href: "/settings" },
 ],
 },
 ],
 },
 };

 return contentMap[activeSection] || contentMap.dashboard;
}

function IconNavButton({
 children,
 isActive = false,
 onClick,
}: {
 children: React.ReactNode;
 isActive?: boolean;
 onClick?: () => void;
}) {
 return (
 <button
 type="button"
 className={`flex items-center justify-center rounded-lg size-10 min-w-10 transition-colors duration-500 cursor-pointer
 ${isActive ? "bg-zinc-200 dark:bg-zinc-800 text-foreground" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-muted-foreground hover:text-foreground"}`}
 style={{ transitionTimingFunction: softSpringEasing }}
 onClick={onClick}
 >
 {children}
 </button>
 );
}

function IconNavigation({
 activeSection,
 onSectionChange,
}: {
 activeSection: string;
 onSectionChange: (section: string) => void;
}) {
 const navItems = [
 { id: "dashboard", icon: <Dashboard size={16} className="text-blue-400" />, label: "Dashboard" },
 { id: "settings", icon: <SettingsIcon size={16} className="text-blue-400" />, label: "Settings" },
 ];

 return (
 <aside className="bg-card flex flex-col gap-2 items-center py-6 w-[72px] h-screen border-r border-border/40 z-30 relative shrink-0">
 {/* Logo */}
 <div className="mb-4 size-10 flex items-center justify-center">
 <InterfacesLogoSquare className="text-blue-400 w-8 h-8" />
 </div>

 {/* Navigation Icons */}
 <div className="flex flex-col gap-2 w-full items-center mt-4">
 {navItems.map((item) => (
 <IconNavButton
 key={item.id}
 isActive={activeSection === item.id}
 onClick={() => onSectionChange(item.id)}
 >
 {item.icon}
 </IconNavButton>
 ))}
 </div>

 <div className="flex-1" />

 {/* Bottom section */}
 <div className="flex flex-col gap-2 w-full items-center mb-4">
 <div className="size-8">
 <AvatarCircle />
 </div>
 </div>
 </aside>
 );
}

function SectionTitle({
 title,
 onToggleCollapse,
 isCollapsed,
}: {
 title: string;
 onToggleCollapse: () => void;
 isCollapsed: boolean;
}) {
 if (isCollapsed) {
 return (
 <div className="w-full flex justify-center transition-all duration-500 mb-4" style={{ transitionTimingFunction: softSpringEasing }}>
 <button
 type="button"
 onClick={onToggleCollapse}
 className="flex items-center justify-center rounded-lg size-10 min-w-10 transition-all duration-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted-foreground hover:text-foreground cursor-pointer"
 style={{ transitionTimingFunction: softSpringEasing }}
 aria-label="Expand sidebar"
 >
 <span className="inline-block rotate-180">
 <ChevronDownIcon size={16} />
 </span>
 </button>
 </div>
 );
 }

 return (
 <div className="w-full overflow-hidden transition-all duration-500 mb-4" style={{ transitionTimingFunction: softSpringEasing }}>
 <div className="flex items-center justify-between">
 <div className="flex items-center h-10">
 <div className="px-2 py-1">
 <div className="font-semibold font-sans text-[18px] text-foreground leading-[27px]">
 {title}
 </div>
 </div>
 </div>
 <div className="pr-1">
 <button
 type="button"
 onClick={onToggleCollapse}
 className="flex items-center justify-center rounded-lg size-10 min-w-10 transition-all duration-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted-foreground hover:text-foreground cursor-pointer"
 style={{ transitionTimingFunction: softSpringEasing }}
 aria-label="Collapse sidebar"
 >
 <ChevronDownIcon size={16} className="-rotate-90" />
 </button>
 </div>
 </div>
 </div>
 );
}

function DetailSidebar({ activeSection, isCollapsed, toggleCollapse }: { activeSection: string, isCollapsed: boolean, toggleCollapse: () => void }) {
 const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
 const pathname = usePathname();
 const content = getSidebarContent(activeSection, pathname);

 const { user, signOut } = useSupabaseUser();
 const userName =
 (user?.user_metadata?.full_name as string | undefined) ||
 (user?.user_metadata?.name as string | undefined) ||
 user?.email?.split("@")[0] ||
 "User";

 const toggleExpanded = (itemKey: string) => {
 setExpandedItems((prev) => {
 const next = new Set(prev);
 if (next.has(itemKey)) next.delete(itemKey);
 else next.add(itemKey);
 return next;
 });
 };

 return (
 <aside
 className={`bg-card/95 backdrop-blur-xl flex flex-col gap-2 items-start p-4 transition-all duration-300 h-screen border-r border-border/40 shrink-0 ${
 isCollapsed ? "w-[72px] !px-2 items-center" : "w-64"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 >
 {!isCollapsed && <BrandBadge />}

 <SectionTitle title={content.title} onToggleCollapse={toggleCollapse} isCollapsed={isCollapsed} />
 
 {!isCollapsed && <SearchContainer isCollapsed={isCollapsed} />}

 <div
 className={`flex flex-col w-full overflow-y-auto scrollbar-none transition-all duration-500 ${
 isCollapsed ? "gap-2 items-center" : "gap-4 items-start"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 >
 {content.sections.map((section, index) => (
 <MenuSection
 key={`${activeSection}-${index}`}
 section={section}
 expandedItems={expandedItems}
 onToggleExpanded={toggleExpanded}
 isCollapsed={isCollapsed}
 />
 ))}
 </div>

 {!isCollapsed && (
 <div className="w-full mt-auto pt-4 border-t border-border/40">
 <div className="flex items-center gap-3 px-2 py-2">
 <AvatarCircle />
 <div className="flex-1 truncate min-w-0 font-sans">
 <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
 <p className="truncate text-xs text-muted-foreground">{user?.email || "Pro Member"}</p>
 </div>
 
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <button
 type="button"
 className="ml-auto size-8 rounded-md flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer outline-none transition-colors"
 aria-label="User options"
 >
 <svg className="size-4" viewBox="0 0 16 16" fill="none">
 <circle cx="4" cy="8" r="1.5" fill="currentColor" />
 <circle cx="8" cy="8" r="1.5" fill="currentColor" />
 <circle cx="12" cy="8" r="1.5" fill="currentColor" />
 </svg>
 </button>
 </DropdownMenuTrigger>
 <DropdownMenuContent side="right" align="end" className="w-56" sideOffset={10}>
 <DropdownMenuLabel>My Account</DropdownMenuLabel>
 <DropdownMenuSeparator />
 <DropdownMenuItem onClick={() => window.location.href = "/profile"} className="cursor-pointer">
 <UserSettings className="mr-2 h-4 w-4" />
 <span>Profile</span>
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => window.location.href = "/settings"} className="cursor-pointer">
 <SettingsIcon className="mr-2 h-4 w-4" />
 <span>Settings</span>
 </DropdownMenuItem>
 <DropdownMenuItem className="cursor-pointer">
 <CreditCard className="mr-2 h-4 w-4" />
 <span>Billing</span>
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 <DropdownMenuItem 
 onClick={() => {
 import("@/hooks/use-supabase-user").then(({ useSupabaseUser }) => {
 // Note: We can't easily call hooks inside callbacks, so we use the client directly or ensure user signed out
 // Better to use the hook's return value which we already have in scope if we restructure slightly.
 });
 // Using the hook's signOut if we can get it from parent scope
 signOut();
 window.location.href = "/";
 }} 
 className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
 >
 <LogOut className="mr-2 h-4 w-4" />
 <span>Log out</span>
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </div>
 )}
 </aside>
 );
}

function MenuItem({
 item,
 isExpanded,
 onToggle,
 isCollapsed,
}: {
 item: MenuItemT;
 isExpanded?: boolean;
 onToggle?: () => void;
 isCollapsed?: boolean;
}) {
 const innerContent = (
 <div
 className={`rounded-lg cursor-pointer transition-all duration-500 flex items-center relative ${
 item.isActive ? "bg-primary/10 text-primary" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-muted-foreground hover:text-foreground"
 } ${isCollapsed ? "w-10 min-w-10 h-10 justify-center p-2" : "w-full h-10 px-3 py-2"}`}
 style={{ transitionTimingFunction: softSpringEasing }}
 title={isCollapsed ? item.label : undefined}
 >
 <div className="flex items-center justify-center shrink-0">{item.icon}</div>

 <div
 className={`flex-1 relative transition-opacity duration-500 overflow-hidden ${
 isCollapsed ? "opacity-0 w-0" : "opacity-100 ml-3"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 >
 <div className="font-sans font-medium text-[14px] leading-[20px] truncate">
 {item.label}
 </div>
 </div>

 {item.hasDropdown && (
 <div
 className={`flex items-center justify-center shrink-0 transition-opacity duration-500 ${
 isCollapsed ? "opacity-0 w-0" : "opacity-100 ml-2"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 onClick={(e) => {
 e.preventDefault();
 if (onToggle) onToggle();
 }}
 >
 <ChevronDownIcon
 size={16}
 className="transition-transform duration-500"
 style={{
 transitionTimingFunction: softSpringEasing,
 transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
 }}
 />
 </div>
 )}
 </div>
 );

 return (
 <div
 className={`relative shrink-0 transition-all duration-500 ${
 isCollapsed ? "w-full flex justify-center" : "w-full"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 >
 {item.href ? (
 <Link href={item.href} className="w-full block">
 {innerContent}
 </Link>
 ) : (
 <div className="w-full block" onClick={() => item.hasDropdown && onToggle && onToggle()}>
 {innerContent}
 </div>
 )}
 </div>
 );
}

function MenuSection({
 section,
 expandedItems,
 onToggleExpanded,
 isCollapsed,
}: {
 section: MenuSectionT;
 expandedItems: Set<string>;
 onToggleExpanded: (itemKey: string) => void;
 isCollapsed?: boolean;
}) {
 return (
 <div className="flex flex-col w-full mb-2">
 <div
 className={`relative shrink-0 w-full transition-all duration-500 overflow-hidden ${
 isCollapsed ? "h-0 opacity-0 mb-0" : "h-8 opacity-100 mb-1"
 }`}
 style={{ transitionTimingFunction: softSpringEasing }}
 >
 <div className="flex items-center h-full px-3">
 <div className="font-sans font-medium text-[12px] uppercase tracking-wider text-muted-foreground">
 {section.title}
 </div>
 </div>
 </div>

 <div className="flex flex-col gap-1 w-full">
 {section.items.map((item, index) => {
 const itemKey = `${section.title}-${index}`;
 const isExpanded = expandedItems.has(itemKey);
 return (
 <MenuItem
 key={itemKey}
 item={item}
 isExpanded={isExpanded}
 onToggle={() => onToggleExpanded(itemKey)}
 isCollapsed={isCollapsed}
 />
 );
 })}
 </div>
 </div>
 );
}

export function TwoLevelSidebar({ isCollapsed, toggleCollapse }: { isCollapsed?: boolean, toggleCollapse?: () => void }) {
 const pathname = usePathname();
 // Simple heuristic to determine active section from path
 let internalActiveSection = "dashboard";
 if (pathname.includes("/settings")) {
 internalActiveSection = "settings";
 }
 
 const [activeSection, setActiveSection] = useState(internalActiveSection);

 // Sync state if path changes externally
 React.useEffect(() => {
 if (pathname.includes("/settings")) {
 setActiveSection("settings");
 } else {
 setActiveSection("dashboard");
 }
 }, [pathname]);

 return (
 <div className="flex flex-row h-screen fixed left-0 top-0 z-40 bg-background/50">
 <IconNavigation activeSection={activeSection} onSectionChange={setActiveSection} />
 <DetailSidebar 
 activeSection={activeSection} 
 isCollapsed={isCollapsed || false} 
 toggleCollapse={toggleCollapse || (() => {})} 
 />
 </div>
 );
}

export default TwoLevelSidebar;
