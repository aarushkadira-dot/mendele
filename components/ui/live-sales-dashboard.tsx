"use client"

import React, { FC } from "react"
import { useRealtimeSalesData } from "@/demos/hooks/useRealtimeSalesData"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import {
  TrendingUp,
  Activity,
  Briefcase,
  Zap,
  User,
  Target,
  ArrowUpRight,
  Eye,
  Users,
} from "lucide-react"

interface SalesDashboardProps {
  user?: any
  stats?: any
  activities?: any[]
}

/* ─── Metric Card ────────────────────────────────────────────────────────── */

const MetricCard: FC<{
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: string
  isPositive?: boolean
}> = ({ title, value, subtitle, icon, trend, isPositive }) => (
  <Card className="border-border bg-card">
    <CardContent className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-label-sm text-muted-foreground">{title}</span>
        <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
              isPositive ? "text-success" : "text-destructive"
            }`}
          >
            <ArrowUpRight className={`h-3 w-3 ${!isPositive ? "rotate-90" : ""}`} />
            {trend}
          </span>
        )}
        {subtitle && <span className="text-caption text-muted-foreground">{subtitle}</span>}
      </div>
    </CardContent>
  </Card>
)

/* ─── Dashboard ──────────────────────────────────────────────────────────── */

export const SalesDashboard: FC<SalesDashboardProps> = ({ user, stats }) => {
  const {
    salesChartData,
    latestPayments,
  } = useRealtimeSalesData()

  const safeSalesChartData = Array.isArray(salesChartData) ? salesChartData : []
  const safeLatestPayments = Array.isArray(latestPayments) ? latestPayments : []

  return (
    <div className="section-gap">
      {/* Header */}
      <div className="page-header">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-display text-foreground">
              Welcome back, {user?.name?.split(" ")[0] || "User"}
            </h1>
            <p className="text-body text-muted-foreground mt-1">
              Here&apos;s your professional growth snapshot.
            </p>
          </div>
          <Badge
            variant="outline"
            className="self-start sm:self-auto border-success/30 text-success bg-success/5 px-3 py-1.5 gap-2"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            Live Updates
          </Badge>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Profile Views"
          value={stats?.profileViews || 1240}
          subtitle="this month"
          icon={<Eye className="h-4 w-4 text-primary" />}
          trend="+12%"
          isPositive
        />
        <MetricCard
          title="Connections"
          value={stats?.connections || 542}
          subtitle="professional links"
          icon={<Users className="h-4 w-4 text-primary" />}
          trend="+8%"
          isPositive
        />
        <MetricCard
          title="Opportunities"
          value={stats?.searchAppearances || 86}
          subtitle="AI-matched"
          icon={<Target className="h-4 w-4 text-primary" />}
          trend="+5%"
          isPositive
        />
        <MetricCard
          title="Growth Score"
          value="94.2"
          subtitle="index"
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          trend="+2.1"
          isPositive
        />
      </div>

      {/* Chart + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <Card className="lg:col-span-2 border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-title">Network Activity</CardTitle>
                <CardDescription className="text-caption">
                  Engagement trend across your connections
                </CardDescription>
              </div>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={safeSalesChartData}
                  margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="networkGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.50 0.19 255)" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="oklch(0.50 0.19 255)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="oklch(0.90 0.008 255 / 0.5)"
                  />
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    fontSize={11}
                    tick={{ fill: "oklch(0.50 0.02 255)" }}
                    minTickGap={30}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    fontSize={11}
                    tick={{ fill: "oklch(0.50 0.02 255)" }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid oklch(0.90 0.008 255)",
                      boxShadow: "0 4px 12px oklch(0.50 0.02 255 / 0.08)",
                      fontSize: "13px",
                      fontFamily: "Manrope, system-ui, sans-serif",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="oklch(0.50 0.19 255)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#networkGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="border-border bg-card flex flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-title flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Live Feed
            </CardTitle>
            <CardDescription className="text-caption">
              Network milestones
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[320px]">
              <div className="flex flex-col">
                {safeLatestPayments.length === 0 ? (
                  <div className="p-8 text-center text-body-sm text-muted-foreground">
                    Connecting to network...
                  </div>
                ) : (
                  safeLatestPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="px-4 py-3 border-b border-border/50 last:border-0 hover:bg-accent/50 transition-colors duration-150"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body-sm font-medium text-foreground truncate">
                            {payment.customer}
                          </p>
                          <p className="text-caption text-muted-foreground truncate">
                            {payment.product}
                          </p>
                        </div>
                        <span className="text-label-sm text-muted-foreground shrink-0">
                          {payment.time}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
          <CardFooter className="border-t border-border py-2.5 px-4">
            <button className="text-caption font-semibold text-primary hover:text-primary/80 transition-colors mx-auto">
              View all activity →
            </button>
          </CardFooter>
        </Card>
      </div>

      {/* Featured Opportunity */}
      <Card className="border-border bg-card overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex-1 space-y-3">
              <Badge className="bg-primary text-primary-foreground border-none text-label-sm">
                Top Match
              </Badge>
              <h2 className="text-headline text-foreground">
                Senior Product Strategist{" "}
                <span className="text-primary">@ OpenAI</span>
              </h2>
              <p className="text-body text-muted-foreground max-w-xl">
                Your skills in <span className="font-semibold text-foreground">Neural Interfaces</span> and{" "}
                <span className="font-semibold text-foreground">Product Research</span> make you a 98.4% match.
              </p>
            </div>
            <button className="shrink-0 inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 rounded-lg transition-colors duration-150">
              <Briefcase className="h-4 w-4" />
              Apply Now
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
