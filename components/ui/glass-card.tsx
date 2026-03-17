import React from "react"
import { cn } from "@/lib/utils"

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  variant?: "default" | "hero" | "muted" | "sidebar" | "compact"
  hover?: boolean
  glow?: boolean
}

export function GlassCard({
  children,
  className,
  variant = "default",
  hover = false,
  glow = false,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card transition-all duration-200",
        variant === "hero" && "border-border/80",
        variant === "muted" && "bg-muted/50 border-border/60",
        variant === "compact" && "p-0",
        hover && "hover:border-border/80 hover:shadow-sm",
        glow && "shadow-sm",
        "relative overflow-hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
