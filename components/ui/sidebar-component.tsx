"use client"

import React, { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useHasMounted } from "@/hooks/use-has-mounted"
import { useSupabaseUser } from "@/hooks/use-supabase-user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  LayoutDashboard,
  User,
  Briefcase,
  FolderKanban,
  MessageSquare,
  Settings,
  Sparkles,
  FlaskConical,
  Users,
  Building2,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ChevronsUpDown,
  CreditCard,
} from "lucide-react"

/* ─── Navigation Config ──────────────────────────────────────────────────── */

const NAV_SECTIONS = [
  {
    label: "Platform",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Profile", href: "/profile", icon: User },
      { name: "Opportunities", href: "/opportunities", icon: Briefcase },
      { name: "Network", href: "/network", icon: MessageSquare },
    ],
  },
  {
    label: "Discover",
    items: [
      { name: "Projects", href: "/projects", icon: FolderKanban },
      { name: "Business", href: "/business", icon: Building2 },
      { name: "Researchers", href: "/researchers", icon: Users },
      { name: "Research", href: "/research", icon: FlaskConical },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { name: "AI Assistant", href: "/assistant", icon: Sparkles },
    ],
  },
]

/* ─── Sidebar Component ──────────────────────────────────────────────────── */

interface SidebarProps {
  isCollapsed?: boolean
  toggleCollapse?: () => void
}

export function TwoLevelSidebar({ isCollapsed = false, toggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { user, signOut } = useSupabaseUser()
  const { resolvedTheme } = useTheme()
  const hasMounted = useHasMounted()

  const userName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "User"
  const userEmail = user?.email || ""
  const userAvatar = (user?.user_metadata?.avatar_url as string | undefined) || "/placeholder.svg"
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const logoSrc = hasMounted && resolvedTheme === "dark" ? "/networkly-logo-dark.png" : "/networkly-logo.png"
  const logoMiniSrc = hasMounted && resolvedTheme === "dark" ? "/networkly-logo-mini-dark.png" : "/networkly-logo-mini.png"

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-300",
        isCollapsed ? "w-[68px]" : "w-[260px]"
      )}
      style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border shrink-0",
          isCollapsed ? "justify-center px-0" : "px-5"
        )}
      >
        {!isCollapsed ? (
          <Image
            src={logoSrc}
            alt="Networkly"
            width={110}
            height={32}
            className="object-contain"
            priority
          />
        ) : (
          <Image
            src={logoMiniSrc}
            alt="Networkly"
            width={28}
            height={28}
            className="object-contain"
            priority
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            {/* Section Label */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-200",
                isCollapsed ? "h-0 opacity-0 mb-0" : "h-5 opacity-100 mb-1.5"
              )}
            >
              <span className="text-label-sm text-muted-foreground px-3">
                {section.label}
              </span>
            </div>

            {/* Items */}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                const Icon = item.icon

                const linkEl = (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-body-sm font-medium transition-colors duration-150",
                      isActive
                        ? "bg-primary/8 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      isCollapsed && "justify-center px-0 py-2.5"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}
                      strokeWidth={isActive ? 2 : 1.75}
                    />
                    {!isCollapsed && <span>{item.name}</span>}
                  </Link>
                )

                if (isCollapsed) {
                  return (
                    <Tooltip key={item.name} delayDuration={0}>
                      <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  )
                }
                return <React.Fragment key={item.name}>{linkEl}</React.Fragment>
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-sidebar-border p-3 space-y-2">
        {/* Settings Link */}
        {(() => {
          const isSettingsActive = pathname === "/settings"
          const settingsLink = (
            <Link
              href="/settings"
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-body-sm font-medium transition-colors duration-150",
                isSettingsActive
                  ? "bg-primary/8 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                isCollapsed && "justify-center px-0 py-2.5"
              )}
            >
              <Settings
                className={cn(
                  "h-[18px] w-[18px] shrink-0",
                  isSettingsActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
                strokeWidth={isSettingsActive ? 2 : 1.75}
              />
              {!isCollapsed && <span>Settings</span>}
            </Link>
          )

          if (isCollapsed) {
            return (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>{settingsLink}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Settings
                </TooltipContent>
              </Tooltip>
            )
          }
          return settingsLink
        })()}

        {/* Collapse Toggle */}
        {toggleCollapse && (
          <button
            onClick={toggleCollapse}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 w-full text-body-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150",
              isCollapsed && "justify-center px-0 py-2.5"
            )}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}

        {/* User Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-3 rounded-md w-full p-2 hover:bg-accent transition-colors duration-150 outline-none",
                isCollapsed && "justify-center p-2"
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={userAvatar} alt={userName} />
                <AvatarFallback className="text-xs font-medium">{userInitials}</AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-body-sm font-semibold text-foreground truncate">{userName}</p>
                    <p className="text-caption text-muted-foreground truncate">{userEmail}</p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isCollapsed ? "right" : "top"}
            align={isCollapsed ? "start" : "center"}
            className="w-56"
            sideOffset={8}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs text-muted-foreground">{userEmail}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => (window.location.href = "/profile")}
              className="cursor-pointer"
            >
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => (window.location.href = "/settings")}
              className="cursor-pointer"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <CreditCard className="mr-2 h-4 w-4" />
              Billing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                signOut()
                window.location.href = "/"
              }}
              className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

export default TwoLevelSidebar
