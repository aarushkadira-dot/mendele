"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Calendar, MapPin, Building2, Sparkles } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

interface Opportunity {
    id: string
    title: string
    organization?: string
    category: string
    type: string
    url: string
    deadline?: string
    summary: string
    location_type: string
    confidence: number
}

interface LiveOpportunitiesFeedProps {
    opportunities: Opportunity[]
    className?: string
}

export function LiveOpportunitiesFeed({ opportunities, className }: LiveOpportunitiesFeedProps) {
    const [displayedOpps, setDisplayedOpps] = useState<Opportunity[]>([])

    useEffect(() => {
        // Add new opportunities with animation
        const newOpps = opportunities.filter(
            opp => !displayedOpps.some(d => d.id === opp.id)
        )
        
        if (newOpps.length > 0) {
            newOpps.forEach((opp, index) => {
                setTimeout(() => {
                    setDisplayedOpps(prev => [opp, ...prev])
                }, index * 200) // Stagger animations
            })
        }
    }, [opportunities])

    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            "STEM": "bg-blue-400/10 text-blue-400 dark:text-blue-400",
            "Arts": "bg-blue-400/10 text-blue-400 dark:text-blue-400",
            "Business": "bg-blue-400/10 text-blue-400 dark:text-blue-400",
            "Leadership": "bg-blue-400/10 text-blue-400 dark:text-blue-400",
            "Community Service": "bg-blue-400/10 text-blue-400 dark:text-blue-400",
            "Sports": "bg-blue-400/10 text-blue-400 dark:text-blue-400",
            "Humanities": "bg-blue-400/10 text-blue-400 dark:text-blue-400",
        }
        return colors[category] || "bg-gray-500/10 text-gray-700 dark:text-gray-400"
    }

    const getTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            "Competition": "border-blue-400/30 text-blue-400 dark:text-blue-400",
            "Internship": "border-blue-400/30 text-blue-400 dark:text-blue-400",
            "Summer Program": "border-blue-400/30 text-blue-400 dark:text-blue-400",
            "Scholarship": "border-blue-400/30 text-blue-400 dark:text-blue-400",
            "Research": "border-blue-400/30 text-blue-400 dark:text-blue-400",
        }
        return colors[type] || "border-gray-500/30 text-gray-600 dark:text-gray-400"
    }

    if (displayedOpps.length === 0) {
        return null
    }

    return (
        <div className={cn("space-y-3", className)}>
            <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                <h3 className="font-semibold text-lg">
                    Live Results ({displayedOpps.length})
                </h3>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {displayedOpps.map((opp, index) => (
                    <Card
                        key={opp.id}
                        className={cn(
                            "p-4 hover:shadow-md transition-all duration-300",
                            "animate-in slide-in- fade-in",
                            index === 0 && "border-primary/50 shadow-sm"
                        )}
                        style={{
                            animationDelay: `${index * 50}ms`,
                            animationDuration: "400ms"
                        }}
                    >
                        <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <a
                                        href={opp.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group"
                                    >
                                        <h4 className="font-semibold text-base group-hover:text-primary transition-colors line-clamp-2">
                                            {opp.title}
                                            <ExternalLink className="inline h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </h4>
                                    </a>
                                    {opp.organization && (
                                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                            <Building2 className="h-3 w-3" />
                                            {opp.organization}
                                        </p>
                                    )}
                                </div>
                                
                                {/* Confidence Badge */}
                                {opp.confidence >= 0.7 && (
                                    <Badge variant="outline" className="text-xs border-blue-400/30 text-blue-400">
                                        {Math.round(opp.confidence * 100)}% match
                                    </Badge>
                                )}
                            </div>

                            {/* Summary */}
                            <p className="text-sm text-muted-foreground line-clamp-2">
                                {opp.summary}
                            </p>

                            {/* Metadata */}
                            <div className="flex flex-wrap gap-2 items-center">
                                <Badge className={getCategoryColor(opp.category)}>
                                    {opp.category}
                                </Badge>
                                <Badge variant="outline" className={getTypeColor(opp.type)}>
                                    {opp.type}
                                </Badge>
                                {opp.location_type && (
                                    <Badge variant="outline" className="text-xs">
                                        <MapPin className="h-3 w-3 mr-1" />
                                        {opp.location_type}
                                    </Badge>
                                )}
                                {opp.deadline && (
                                    <Badge variant="outline" className="text-xs">
                                        <Calendar className="h-3 w-3 mr-1" />
                                        {new Date(opp.deadline).toLocaleDateString()}
                                    </Badge>
                                )}
                            </div>

                            {/* New Badge for first item */}
                            {index === 0 && (
                                <div className="absolute top-2 right-2">
                                    <Badge className="bg-primary text-primary-foreground animate-pulse">
                                        New
                                    </Badge>
                                </div>
                            )}
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    )
}
