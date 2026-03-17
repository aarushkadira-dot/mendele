"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import Sidebar from "@/components/ui/sidebar-component"
import { WelcomeModal } from "@/components/ui/welcome-modal"
import type React from "react"

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed)
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <WelcomeModal />
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={toggleSidebar}
      />
      <div
        className="flex-1 flex flex-col overflow-hidden transition-[margin] duration-300"
        style={{
          marginLeft: isSidebarCollapsed ? "68px" : "260px",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <Header />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  )
}
