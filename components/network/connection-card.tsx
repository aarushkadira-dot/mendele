"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { UserPlus, MessageCircle, Sparkles, Check, Clock, MoreHorizontal } from "@/components/ui/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Connection {
  id: string
  name: string
  headline: string
  avatar: string
  mutualConnections: number
  matchReason: string
  status: "connected" | "pending" | "suggested"
  connectedDate: string | null
}

interface ConnectionCardProps {
  connection: Connection
  onConnect?: (id: string) => void
  onMessage?: (id: string) => void
}

export function ConnectionCard({ connection, onConnect, onMessage }: ConnectionCardProps) {
  const statusConfig = {
    connected: { label: "Connected", variant: "outline" as const, icon: Check },
    pending: { label: "Pending", variant: "outline" as const, icon: Clock },
    suggested: { label: "Suggested", variant: "outline" as const, icon: Sparkles },
  }

  const config = statusConfig[connection.status]
  const StatusIcon = config.icon

  return (
    <Card className="border-border bg-card hover:border-border/80 hover:shadow-sm transition-all duration-150">
      <CardContent className="p-4">
        <div className="flex items-start gap-3.5">
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarImage src={connection.avatar || "/placeholder.svg"} alt={connection.name} />
            <AvatarFallback className="text-sm">{connection.name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-body-sm font-semibold text-foreground">{connection.name}</h4>
                <p className="text-caption text-muted-foreground line-clamp-1">{connection.headline}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Profile</DropdownMenuItem>
                  <DropdownMenuItem>Remove Connection</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs gap-1 font-normal border-border">
                <StatusIcon className="h-3 w-3" />
                {config.label}
              </Badge>
              <span className="text-caption text-muted-foreground">
                {connection.mutualConnections} mutual
              </span>
            </div>

            {connection.matchReason && (
              <p className="text-caption text-primary flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {connection.matchReason}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              {connection.status === "suggested" && (
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onConnect?.(connection.id)}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Connect
                </Button>
              )}
              {connection.status === "connected" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => onMessage?.(connection.id)}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Message
                </Button>
              )}
              {connection.status === "pending" && (
                <Button size="sm" variant="outline" disabled className="h-8 gap-1.5 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  Pending
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
