"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { UserPlus, Sparkles } from "@/components/ui/icons"

interface RecommendedConnection {
  id: string
  name: string
  headline: string
  avatar?: string
  sharedInterests: string[]
  mutualConnections: number
  connectionStatus: "connected" | "pending" | "not-connected"
}

// Mock data - in production this would come from an API
const mockConnections: RecommendedConnection[] = [
  {
    id: "1",
    name: "Sarah Chen",
    headline: "Computer Science Student | AI Enthusiast",
    avatar: "https://i.pravatar.cc/40?u=sarah",
    sharedInterests: ["AI", "Python"],
    mutualConnections: 12,
    connectionStatus: "not-connected",
  },
  {
    id: "2",
    name: "Alex Rodriguez",
    headline: "Marketing Student | Growth Hacker",
    avatar: "https://i.pravatar.cc/40?u=alex",
    sharedInterests: ["Marketing", "Startups"],
    mutualConnections: 8,
    connectionStatus: "not-connected",
  },
  {
    id: "3",
    name: "Jamie Park",
    headline: "Design Student | UX/UI Designer",
    avatar: "https://i.pravatar.cc/40?u=jamie",
    sharedInterests: ["Design", "Web"],
    mutualConnections: 5,
    connectionStatus: "not-connected",
  },
]

interface RecommendedConnectionsProps {
  connections?: RecommendedConnection[]
}

export const RecommendedConnections: React.FC<RecommendedConnectionsProps> = ({
  connections = mockConnections,
}) => {
  const [pendingConnections, setPendingConnections] = useState<Set<string>>(new Set())

  const handleConnect = (id: string) => {
    setPendingConnections((prev) => {
      const newSet = new Set(prev)
      newSet.add(id)
      return newSet
    })

    // Simulate API call
    setTimeout(() => {
      setPendingConnections((prev) => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }, 1500)
  }

  return (
    <Card className="border-border bg-card flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-4 shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Recommended For You
        </CardTitle>
        <p className="text-caption text-muted-foreground mt-1">AI-suggested students to connect with</p>
      </CardHeader>

      <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 p-4">
          {connections.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-48 text-center px-3"
            >
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-muted mb-2">
                <Sparkles className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">No recommendations yet</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Complete your profile to get suggestions
              </p>
            </motion.div>
          ) : (
            connections.map((connection, index) => (
              <motion.div
                key={connection.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -2 }}
                className="group p-3 rounded-lg border border-border hover:border-primary/30 bg-card hover:bg-accent/50 transition-all duration-200"
              >
                <div className="flex items-start gap-3 mb-2">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={connection.avatar} alt={connection.name} />
                    <AvatarFallback>{connection.name[0]}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {connection.name}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {connection.headline}
                    </p>
                  </div>
                </div>

                {/* Shared Interests */}
                {connection.sharedInterests.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {connection.sharedInterests.map((interest) => (
                      <Badge key={interest} variant="secondary" className="text-[10px] py-0 px-1.5">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Mutual Connections */}
                <p className="text-xs text-muted-foreground/70 mb-2">
                  {connection.mutualConnections} mutual connections
                </p>

                {/* Connect Button */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    size="sm"
                    variant={pendingConnections.has(connection.id) ? "outline" : "default"}
                    className="w-full gap-1.5 text-xs"
                    onClick={() => handleConnect(connection.id)}
                    disabled={pendingConnections.has(connection.id)}
                  >
                    {pendingConnections.has(connection.id) ? (
                      <>
                        <span className="inline-block animate-spin">⏳</span>
                        Sending...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5" />
                        Connect
                      </>
                    )}
                  </Button>
                </motion.div>
              </motion.div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
