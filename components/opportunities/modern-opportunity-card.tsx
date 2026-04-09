"use client"

import { motion } from "framer-motion"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { 
  MapPin, 
  Calendar, 
  Trophy, 
  Zap, 
  Bookmark, 
  BookmarkCheck,
  ArrowUpRight,
  Clock,
  Globe
} from "@/components/ui/icons"
import type { Opportunity } from "@/types/opportunity"
import { getTypeGradientStyle, getMatchScoreColor } from "@/types/opportunity"
import { cn } from "@/lib/utils"

interface ModernOpportunityCardProps {
  opportunity: Opportunity
  isSelected?: boolean
  onSelect: (opportunity: Opportunity) => void
  onToggleSave: (e: React.MouseEvent, id: string) => void
  saving?: boolean
}

export function ModernOpportunityCard({
  opportunity,
  isSelected,
  onSelect,
  onToggleSave,
  saving = false,
}: ModernOpportunityCardProps) {
  const isFree = opportunity.cost?.toLowerCase() === "free" || !opportunity.cost
  
  return (
    <motion.div
      layoutId={`opp-card-${opportunity.id}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="h-full"
      onClick={() => onSelect(opportunity)}
    >
      <Card
        className={cn(
          "h-full flex flex-col group cursor-pointer border-border hover:border-border/80 hover:shadow-sm transition-all duration-200",
          isSelected && "ring-2 ring-primary border-primary bg-primary/5"
        )}
      >
        {/* Header Background */}
        <div 
          className="h-24 w-full relative overflow-hidden rounded-t-xl"
          style={{ background: getTypeGradientStyle(opportunity.type) }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent" />
          <div className="absolute top-3 right-3 flex gap-2">
            {opportunity.matchScore >= 80 && (
              <Badge className="bg-primary text-primary-foreground border-0 gap-1">
                <Zap className="h-3 w-3 fill-current" />
                Top Match
              </Badge>
            )}
            {isFree && (
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                Free
              </Badge>
            )}
          </div>
          
          {/* Logo Floating */}
          <div className="absolute -bottom-6 left-5">
            <div className="p-1 rounded-xl bg-white shadow-sm">
              <Avatar className="h-12 w-12 rounded-xl border-2 border-white">
                <AvatarImage src={opportunity.logo || "/placeholder.svg"} className="object-cover" />
                <AvatarFallback className="bg-slate-100 font-bold">{opportunity.company[0]}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>

        <div className="flex-1 px-5 pt-10 pb-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
             <span className="text-label-sm text-primary">
                {opportunity.type}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{opportunity.postedDate || "Recently"}</span>
              </div>
            </div>
            <h3 className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
              {opportunity.title}
            </h3>
            <p className="text-caption text-muted-foreground font-medium mt-0.5">
              {opportunity.company}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
           <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md border border-border">
              <MapPin className="h-3 w-3" />
              {opportunity.locationType || "Remote"}
            </div>
            <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md border border-border">
              <Calendar className="h-3 w-3" />
              {opportunity.deadline || "Rolling"}
            </div>
          </div>

          <p className="text-body-sm text-muted-foreground line-clamp-2">
            {opportunity.description}
          </p>

          <div className="pt-2 flex items-center justify-between">
            <div className="flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-6 w-6 rounded-full border-2 border-background bg-slate-200 flex items-center justify-center overflow-hidden">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${opportunity.id}${i}`} alt="avatar" />
                </div>
              ))}
              <div className="h-6 w-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[8px] font-bold">
                +12
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSave(e, opportunity.id)
                }}
              >
                {opportunity.saved ? <BookmarkCheck className="h-4 w-4 fill-current" /> : <Bookmark className="h-4 w-4" />}
              </Button>
             <Button
                variant="default"
                size="sm"
                className="h-8 px-3 rounded-md gap-1 text-xs font-medium"
              >
                Learn More
                <ArrowUpRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
     </Card>
    </motion.div>
  )
}
