"use client";

import React, { FC, useMemo } from 'react';
import { useRealtimeSalesData, SaleDataPoint, LatestPayment } from '@/demos/hooks/useRealtimeSalesData';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import { DollarSign, Repeat2, TrendingUp, Activity, BarChart, Clock, Briefcase, Zap, User, Target, Rocket } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface SalesDashboardProps {
  user?: any;
  stats?: any;
  activities?: any[];
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const MetricCard: FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: string;
  isPositive?: boolean;
}> = ({ title, value, subtitle, icon, trend, isPositive }) => (
  <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-300">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <div className="p-2 bg-blue-500/10 rounded-lg">{icon}</div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      <div className="flex items-center gap-2 mt-1">
        {trend && (
          <span className={`text-xs font-medium ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trend}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
    </CardContent>
  </Card>
);

export const SalesDashboard: FC<SalesDashboardProps> = ({ user, stats, activities }) => {
  const {
    totalRevenue,
    cumulativeRevenueData,
    salesCount,
    averageSale,
    salesChartData,
    latestPayments,
  } = useRealtimeSalesData();

  const safeSalesChartData = Array.isArray(salesChartData) ? salesChartData : [];
  const safeCumulativeRevenueData = Array.isArray(cumulativeRevenueData) ? cumulativeRevenueData : [];
  const safeLatestPayments = Array.isArray(latestPayments) ? latestPayments : [];

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Welcome back, <span className="text-blue-500">{user?.name?.split(' ')[0] || 'User'}</span>
          </h1>
          <p className="text-lg text-muted-foreground flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-400" />
            Your professional growth is accelerating.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1">
            <div className="size-2 bg-emerald-500 rounded-full animate-pulse mr-2" />
            Live Ecosystem Updates
          </Badge>
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Profile Visibility"
          value={stats?.profileViews || 1240}
          subtitle="Views this month"
          icon={<User className="h-5 w-5 text-blue-500" />}
          trend="+12%"
          isPositive={true}
        />
        <MetricCard
          title="Network Nodes"
          value={stats?.connections || 542}
          subtitle="Professional links"
          icon={<Repeat2 className="h-5 w-5 text-emerald-500" />}
          trend="+8%"
          isPositive={true}
        />
        <MetricCard
          title="Opportunity Matches"
          value={stats?.searchAppearances || 86}
          subtitle="AI-matched roles"
          icon={<Target className="h-5 w-5 text-purple-500" />}
          trend="+5%"
          isPositive={true}
        />
        <MetricCard
          title="Momentum Score"
          value="94.2"
          subtitle="Growth index"
          icon={<TrendingUp className="h-5 w-5 text-orange-500" />}
          trend="+2.1"
          isPositive={true}
        />
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Network Engagement Trend</CardTitle>
                <CardDescription>Real-time ecosystem activity across all nodes</CardDescription>
              </div>
              <Activity className="h-5 w-5 text-blue-500 animate-pulse" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={safeSalesChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis 
                    dataKey="time" 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={12} 
                    tick={{ fill: '#94a3b8' }} 
                    minTickGap={30}
                  />
                  <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#94a3b8' }} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden flex flex-col">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" /> Live Stream
            </CardTitle>
            <CardDescription>Milestones across your network</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[350px]">
              <div className="flex flex-col">
                {safeLatestPayments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground italic">Connecting to ecosystem...</div>
                ) : (
                  safeLatestPayments.map((payment, i) => (
                    <div key={payment.id} className="p-4 border-b border-border/20 last:border-0 hover:bg-white/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                          <User className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate leading-tight">
                            {payment.customer} <span className="font-normal text-muted-foreground text-xs">reached a milestone in</span>
                          </p>
                          <p className="text-xs text-blue-500 font-medium truncate mt-0.5">{payment.product}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{payment.time}</p>
                          <Badge variant="outline" className="text-[9px] h-4 mt-1 border-blue-200 text-blue-600 bg-blue-50">VERIFIED</Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
          <CardFooter className="bg-muted/30 py-3">
            <button className="text-xs font-semibold text-blue-600 hover:text-blue-700 mx-auto">View Full Activity Log →</button>
          </CardFooter>
        </Card>
      </div>

      {/* Featured Opportunity Banner */}
      <GlassCard className="p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 transform translate-x-1/4 -translate-y-1/4 opacity-10 group-hover:scale-110 transition-transform duration-700">
           <Briefcase size={200} className="text-blue-500" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            <Badge className="w-fit bg-blue-500 text-white hover:bg-blue-600 border-none">TOP MATCH</Badge>
            <h2 className="text-3xl font-bold leading-tight">Senior Product Strategist <span className="text-blue-500 italic">@ OpenAI</span></h2>
            <p className="text-muted-foreground text-lg">
              Your skills in <span className="font-semibold text-foreground italic">Neural Interfaces</span> and <span className="font-semibold text-foreground italic">Product Research</span> make you a 98.4% match for this role.
            </p>
          </div>
          <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-blue-500/25 transition-all hover:-translate-y-1">
            Apply with One-Click
          </button>
        </div>
      </GlassCard>
    </div>
  );
};
