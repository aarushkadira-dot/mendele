"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Sparkles, SlidersHorizontal } from "lucide-react"
import { ConnectionCard } from "@/components/network/connection-card"
import { MessagesPanel } from "@/components/network/messages-panel"
import { NetworkStats } from "@/components/network/network-stats"
import { getConnections } from "@/app/actions/connections"

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

export default function NetworkPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchConnections() {
      const data = await getConnections()
      const transformed = data.map((c: Record<string, unknown>) => ({
        id: c.id as string,
        name: c.name as string,
        headline: (c.headline as string) || "",
        avatar: (c.avatar as string) || "/placeholder.svg",
        mutualConnections: (c.mutualConnections as number) || 0,
        matchReason: (c.matchReason as string) || "",
        status: (c.status as "connected" | "pending" | "suggested") || "suggested",
        connectedDate: c.connectedDate as string | null,
      }))
      setConnections(transformed)
      setLoading(false)
    }
    fetchConnections()
  }, [])

  const connectedUsers = connections.filter((c) => c.status === "connected")
  const pendingUsers = connections.filter((c) => c.status === "pending")
  const suggestedUsers = connections.filter((c) => c.status === "suggested")

  const filteredConnections = (list: typeof connections) =>
    list.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.headline.toLowerCase().includes(searchQuery.toLowerCase())
    )

  const handleConnect = (id: string) => {
    setConnections(connections.map((c) => (c.id === id ? { ...c, status: "pending" as const } : c)))
  }

  return (
    <div className="page-container">
      <div className="section-gap">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="page-header !mb-0">
            <h1 className="text-headline text-foreground">Network</h1>
            <p className="text-body text-muted-foreground">
              Grow your professional connections with AI-powered suggestions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search connections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 text-body-sm"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filter
            </Button>
          </div>
        </div>

        <NetworkStats />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all" className="text-xs">All ({connections.length})</TabsTrigger>
                <TabsTrigger value="connected" className="text-xs">Connected ({connectedUsers.length})</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs">Pending ({pendingUsers.length})</TabsTrigger>
                <TabsTrigger value="suggested" className="text-xs">
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Suggested ({suggestedUsers.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4 space-y-3">
                {filteredConnections(connections).map((connection) => (
                  <ConnectionCard key={connection.id} connection={connection} onConnect={handleConnect} />
                ))}
              </TabsContent>

              <TabsContent value="connected" className="mt-4 space-y-3">
                {filteredConnections(connectedUsers).map((connection) => (
                  <ConnectionCard key={connection.id} connection={connection} onConnect={handleConnect} />
                ))}
              </TabsContent>

              <TabsContent value="pending" className="mt-4 space-y-3">
                {filteredConnections(pendingUsers).map((connection) => (
                  <ConnectionCard key={connection.id} connection={connection} onConnect={handleConnect} />
                ))}
              </TabsContent>

              <TabsContent value="suggested" className="mt-4 space-y-3">
                {filteredConnections(suggestedUsers).map((connection) => (
                  <ConnectionCard key={connection.id} connection={connection} onConnect={handleConnect} />
                ))}
              </TabsContent>
            </Tabs>
          </div>

          <div>
            <MessagesPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
