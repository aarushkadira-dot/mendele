"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Users, Ticket } from "@/components/ui/icons"

interface Event {
  id: string
  title: string
  date: Date
  type: "career-fair" | "webinar" | "networking" | "workshop"
  description: string
  participants: number
  registered: boolean
}

interface UpcomingEventsProps {
  events?: Event[]
}

// Mock data - in production this would come from an API
const mockEvents: Event[] = [
  {
    id: "1",
    title: "Tech Career Fair 2026",
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    type: "career-fair",
    description: "Meet top tech companies and explore internship opportunities",
    participants: 1250,
    registered: false,
  },
  {
    id: "2",
    title: "AI & Machine Learning Webinar",
    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    type: "webinar",
    description: "Learn latest AI trends from industry experts",
    participants: 450,
    registered: true,
  },
  {
    id: "3",
    title: "Student Networking Mixer",
    date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    type: "networking",
    description: "Connect with peers in your field of interest",
    participants: 280,
    registered: false,
  },
]

const eventTypeConfig = {
  "career-fair": {
    label: "Career Fair",
    color: "bg-blue-500/20 text-blue-600",
    icon: "🎯",
  },
  webinar: {
    label: "Webinar",
    color: "bg-purple-500/20 text-purple-600",
    icon: "🎓",
  },
  networking: {
    label: "Networking",
    color: "bg-green-500/20 text-green-600",
    icon: "🤝",
  },
  workshop: {
    label: "Workshop",
    color: "bg-amber-500/20 text-amber-600",
    icon: "🛠️",
  },
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export const UpcomingEvents: React.FC<UpcomingEventsProps> = ({ events = mockEvents }) => {
  const [registeredEvents, setRegisteredEvents] = useState<Set<string>>(
    new Set(events.filter((e) => e.registered).map((e) => e.id))
  )

  const handleRegister = (id: string) => {
    setRegisteredEvents((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const sortedEvents = [...events].sort((a, b) => a.date.getTime() - b.date.getTime())

  return (
    <Card className="border-border bg-card flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Upcoming Events
        </CardTitle>
        <p className="text-caption text-muted-foreground mt-1">Career and networking events</p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-2 overflow-y-auto scrollbar-thin">
        {sortedEvents.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center flex-1 text-center px-4"
          >
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-muted mb-2">
              <Calendar className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">No events scheduled</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Check back soon!</p>
          </motion.div>
        ) : (
          sortedEvents.map((event, index) => {
            const isRegistered = registeredEvents.has(event.id)
            const config = eventTypeConfig[event.type]

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -2 }}
                className="group p-3 rounded-lg border border-border hover:border-primary/30 bg-card hover:bg-accent/50 transition-all duration-200"
              >
                {/* Event Type Badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge className={`text-[10px] py-0 px-1.5 ${config.color} border-0`}>
                    {config.label}
                  </Badge>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {formatDate(event.date)}
                  </span>
                </div>

                {/* Event Title */}
                <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-1">
                  {event.title}
                </h4>

                {/* Event Description */}
                <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                  {event.description}
                </p>

                {/* Participants */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground/70 mb-2">
                  <Users className="h-3 w-3" />
                  {event.participants} participants
                </div>

                {/* Register Button */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    size="sm"
                    variant={isRegistered ? "default" : "outline"}
                    className="w-full gap-1.5 text-xs h-7"
                    onClick={() => handleRegister(event.id)}
                  >
                    <Ticket className="h-3 w-3" />
                    {isRegistered ? "Registered" : "Register"}
                  </Button>
                </motion.div>
              </motion.div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
