"use client"

import { useEffect, useState, useTransition } from "react"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Check } from "lucide-react"
import { useTheme } from "next-themes"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabaseUser } from "@/hooks/use-supabase-user"
import { getCurrentUser } from "@/app/actions/user"
import { updateProfile } from "@/app/actions/profile"
import { getPreferences, updatePreferences } from "@/app/actions/preferences"
import { toast } from "sonner"
import { BatchDiscoveryPanel } from "@/components/discovery/batch-discovery-panel"
import { CacheStatistics } from "@/components/discovery/cache-statistics"
import { motion, useReducedMotion } from "framer-motion"

interface UserData {
 id: string
 name: string
 email: string
 avatar: string | null
 headline: string | null
 bio: string | null
 location: string | null
 university: string | null
 graduationYear: string | null
 skills: string[]
 interests: string[]
 linkedinUrl: string | null
 githubUrl: string | null
 portfolioUrl: string | null
}

export default function SettingsPage() {
 const { setTheme, theme } = useTheme()
 const { user } = useSupabaseUser()
 const [isPending, startTransition] = useTransition()
 const [dbUser, setDbUser] = useState<UserData | null>(null)
 const [loading, setLoading] = useState(true)
 const [saved, setSaved] = useState(false)
 const shouldReduceMotion = useReducedMotion()

 // Form state
 const [formData, setFormData] = useState({
 name: "",
 headline: "",
 bio: "",
 location: "",
 university: "",
 graduationYear: "",
 linkedinUrl: "",
 githubUrl: "",
 portfolioUrl: "",
 skills: "",
 interests: "",
 })

 // Preferences state
 const [preferences, setPreferences] = useState({
 notifyOpportunities: true,
 notifyConnections: true,
 notifyMessages: true,
 weeklyDigest: false,
 publicProfile: true,
 showActivityStatus: false,
 showProfileViews: true,
 aiSuggestions: true,
 autoIcebreakers: true,
 careerNudges: true,
 })

 useEffect(() => {
 async function loadData() {
 try {
 const [user, prefs] = await Promise.all([getCurrentUser(), getPreferences()])
 if (user) {
 setDbUser(user)
 setFormData({
 name: user.name || "",
 headline: user.headline || "",
 bio: user.bio || "",
 location: user.location || "",
 university: user.university || "",
 graduationYear: user.graduationYear || "",
 linkedinUrl: user.linkedinUrl || "",
 githubUrl: user.githubUrl || "",
 portfolioUrl: user.portfolioUrl || "",
 skills: user.skills?.join(", ") || "",
 interests: user.interests?.join(", ") || "",
 })
 }
 if (prefs) {
 setPreferences({
 notifyOpportunities: prefs.notifyOpportunities,
 notifyConnections: prefs.notifyConnections,
 notifyMessages: prefs.notifyMessages,
 weeklyDigest: prefs.weeklyDigest,
 publicProfile: prefs.publicProfile,
 showActivityStatus: prefs.showActivityStatus,
 showProfileViews: prefs.showProfileViews,
 aiSuggestions: prefs.aiSuggestions,
 autoIcebreakers: prefs.autoIcebreakers,
 careerNudges: prefs.careerNudges,
 })
 }
 } catch (error) {
 console.error("[Settings] Failed to load data", error)
 } finally {
 setLoading(false)
 }
 }
 loadData()
 }, [])

 const handleChange = (field: string, value: string) => {
 setFormData((prev) => ({ ...prev, [field]: value }))
 setSaved(false)
 }

 const handlePreferenceChange = async (field: keyof typeof preferences, value: boolean) => {
 const newPreferences = { ...preferences, [field]: value }
 setPreferences(newPreferences)
 
 try {
 await updatePreferences(newPreferences)
 toast.success("Preferences updated")
 } catch (error) {
 console.error("[Settings] Failed to update preferences", error)
 toast.error("Failed to update preferences")
 setPreferences(preferences)
 }
 }

 const handleSave = () => {
 startTransition(async () => {
 try {
 const skills = formData.skills
 .split(",")
 .map((s) => s.trim())
 .filter(Boolean)
 const interests = formData.interests
 .split(",")
 .map((s) => s.trim())
 .filter(Boolean)

 await updateProfile({
 name: formData.name || undefined,
 headline: formData.headline || undefined,
 bio: formData.bio || undefined,
 location: formData.location || undefined,
 university: formData.university || undefined,
 graduationYear: formData.graduationYear
 ? parseInt(formData.graduationYear, 10)
 : undefined,
 skills,
 interests,
 linkedinUrl: formData.linkedinUrl || undefined,
 githubUrl: formData.githubUrl || undefined,
 portfolioUrl: formData.portfolioUrl || undefined,
 })

 setSaved(true)
 toast.success("Profile updated successfully")
 } catch (error) {
 console.error("[Settings] Failed to update profile", error)
 toast.error("Failed to update profile")
 }
 })
 }

 const userName =
 dbUser?.name ||
 (user?.user_metadata?.full_name as string | undefined) ||
 (user?.user_metadata?.name as string | undefined) ||
 user?.email?.split("@")[0] ||
 "User"
 const userEmail = dbUser?.email || user?.email || ""
 const userAvatar =
 dbUser?.avatar ||
 (user?.user_metadata?.avatar_url as string | undefined) ||
 "/placeholder.svg"
 const userInitials = userName
 .split(" ")
 .map((n) => n[0])
 .join("")
 .toUpperCase()

 if (loading) {
 return (
 <div className="flex min-h-[calc(100vh-80px)] items-center justify-center p-8">
 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
 </div>
 )
 }

 return (
 <div className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 sm:p-8 relative z-10 w-full overflow-hidden">
 <motion.div
 initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 18 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{
 duration: 0.45,
 ease: shouldReduceMotion ? "linear" : [0.16, 1, 0.3, 1],
 }}
 className="group w-full max-w-5xl rounded-3xl overflow-hidden border border-border/60 bg-card/85 p-6 backdrop-blur-3xl sm:p-12 relative shadow-2xl"
 aria-labelledby="glass-account-title"
 >

 <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
 <div>
 <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-muted-foreground">
 Account Settings
 </div>
 <h1
 id="glass-account-title"
 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl"
 >
 Manage your Networkly profile
 </h1>
 <p className="mt-2 text-sm text-muted-foreground max-w-lg">
 Update personal details, control notifications, and manage your discovery preferences in one place.
 </p>
 </div>
 
 <Button
 onClick={handleSave}
 disabled={isPending}
 className="rounded-full bg-primary px-6 py-5 text-primary-foreground shadow-[0_20px_60px_-30px_rgba(59,130,246,0.75)] transition-transform duration-300 hover:-translate-y-1"
 >
 {isPending ? (
 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
 ) : saved ? (
 <Check className="h-4 w-4 mr-2" />
 ) : null}
 {isPending ? "Saving..." : saved ? "Saved" : "Save changes"}
 </Button>
 </div>

 <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
 <div className="space-y-6">
 
 <div className="rounded-2xl border border-border/60 bg-background/45 p-6 backdrop-blur">
 <h2 className="text-sm font-medium text-foreground">Profile Overview</h2>
 <p className="mb-4 text-xs text-muted-foreground">
 Your primary identity on Networkly.
 </p>
 
 <div className="flex items-center gap-4 mb-6">
 <Avatar className="h-16 w-16 border border-border/60">
 <AvatarImage src={userAvatar} alt={userName} />
 <AvatarFallback>{userInitials}</AvatarFallback>
 </Avatar>
 <div>
 <Button variant="outline" size="sm" className="rounded-full text-xs h-8">
 Change photo
 </Button>
 <p className="text-[10px] mt-1 text-muted-foreground">JPG/PNG. Max 2MB.</p>
 </div>
 </div>

 <div className="space-y-4 text-sm">
 <div className="space-y-1">
 <Label className="text-xs font-medium text-muted-foreground">Email</Label>
 <p className="text-foreground text-sm font-medium">{userEmail}</p>
 </div>
 <div className="space-y-1">
 <Label className="text-xs font-medium text-muted-foreground">Full Name</Label>
 <Input
 value={formData.name}
 onChange={(e) => handleChange("name", e.target.value)}
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs font-medium text-muted-foreground">Headline</Label>
 <Input
 value={formData.headline}
 onChange={(e) => handleChange("headline", e.target.value)}
 placeholder="e.g. AI Researcher"
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 </div>
 </div>

 <div className="rounded-2xl border border-border/60 bg-background/45 p-6 backdrop-blur">
 <h2 className="text-sm font-medium text-foreground">Discovery Engine</h2>
 <p className="mb-4 text-xs text-muted-foreground">
 Manage your batch discovery opportunities.
 </p>
 <div className="space-y-6">
 <BatchDiscoveryPanel 
 onComplete={() => toast.success("Discovery completed! New opportunities added.")}
 />
 <CacheStatistics />
 </div>
 </div>

 <div className="rounded-2xl border border-border/60 bg-background/45 p-6 backdrop-blur">
 <h2 className="text-sm font-medium text-foreground">Appearance</h2>
 <p className="mb-4 text-xs text-muted-foreground">
 Customize your Networkly experience.
 </p>
 <div className="flex items-center justify-between">
 <Label className="text-sm text-muted-foreground">Theme</Label>
 <Select value={theme} onValueChange={setTheme}>
 <SelectTrigger className="w-[120px] h-8 text-xs bg-black/10 dark:bg-white/5 border-border/50 rounded-lg outline-none focus:ring-0">
 <SelectValue placeholder="Theme" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="light">Light</SelectItem>
 <SelectItem value="dark">Dark</SelectItem>
 <SelectItem value="system">System</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="rounded-2xl border border-destructive/30 bg-background/45 p-6 backdrop-blur">
 <h2 className="text-sm font-medium text-destructive">Danger Zone</h2>
 <p className="mb-4 text-xs text-muted-foreground">
 Irreversible account actions.
 </p>
 <Button variant="destructive" className="w-full rounded-full text-xs h-9">
 Delete Account
 </Button>
 </div>
 
 </div>

 <div className="space-y-6">
 <div className="rounded-2xl border border-border/60 bg-background/45 p-6 backdrop-blur">
 <h2 className="text-sm font-medium text-foreground">Professional Details</h2>
 <p className="mb-4 text-xs text-muted-foreground">
 Expanded details used for Networkly matching and discovery.
 </p>

 <div className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <Label className="text-xs font-medium text-muted-foreground">Location</Label>
 <Input
 value={formData.location}
 onChange={(e) => handleChange("location", e.target.value)}
 placeholder="City, Country"
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs font-medium text-muted-foreground">University</Label>
 <Input
 value={formData.university}
 onChange={(e) => handleChange("university", e.target.value)}
 placeholder="University name"
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <Label className="text-xs font-medium text-muted-foreground">Grad Year</Label>
 <Input
 value={formData.graduationYear}
 onChange={(e) => handleChange("graduationYear", e.target.value)}
 type="number"
 placeholder="YYYY"
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs font-medium text-muted-foreground">Skills</Label>
 <Input
 value={formData.skills}
 onChange={(e) => handleChange("skills", e.target.value)}
 placeholder="React, AI (comma separated)"
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 </div>

 <div className="space-y-1">
 <Label className="text-xs font-medium text-muted-foreground">Interests</Label>
 <Input
 value={formData.interests}
 onChange={(e) => handleChange("interests", e.target.value)}
 placeholder="Startups, Open Source"
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>

 <div className="space-y-1">
 <Label className="text-xs font-medium text-muted-foreground">Bio</Label>
 <Textarea
 value={formData.bio}
 onChange={(e) => handleChange("bio", e.target.value)}
 placeholder="Tell us about yourself..."
 rows={3}
 className="text-sm resize-none bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 </div>

 <div className="mt-6">
 <h3 className="text-xs font-medium text-foreground mb-3">Social Links</h3>
 <div className="space-y-3">
 <div className="space-y-1">
 <Input
 value={formData.linkedinUrl}
 onChange={(e) => handleChange("linkedinUrl", e.target.value)}
 placeholder="LinkedIn URL"
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 <div className="space-y-1">
 <Input
 value={formData.githubUrl}
 onChange={(e) => handleChange("githubUrl", e.target.value)}
 placeholder="GitHub URL"
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 <div className="space-y-1">
 <Input
 value={formData.portfolioUrl}
 onChange={(e) => handleChange("portfolioUrl", e.target.value)}
 placeholder="Portfolio / Main Website"
 className="h-8 text-sm bg-black/10 dark:bg-white/5 border-border/50"
 />
 </div>
 </div>
 </div>
 </div>

 <div className="rounded-2xl border border-border/60 bg-background/45 p-6 backdrop-blur">
 <h2 className="text-sm font-medium text-foreground">Preferences</h2>
 <p className="mb-4 text-xs text-muted-foreground">
 Control your notifications and AI features.
 </p>
 
 <div className="space-y-4 text-sm text-muted-foreground">
 <h3 className="text-[10px] font-semibold text-foreground uppercase tracking-wider mt-2">Notifications</h3>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">New Opportunities</span>
 <Switch checked={preferences.notifyOpportunities} onCheckedChange={(checked) => handlePreferenceChange("notifyOpportunities", checked)} />
 </label>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">Connection Requests</span>
 <Switch checked={preferences.notifyConnections} onCheckedChange={(checked) => handlePreferenceChange("notifyConnections", checked)} />
 </label>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">Messages</span>
 <Switch checked={preferences.notifyMessages} onCheckedChange={(checked) => handlePreferenceChange("notifyMessages", checked)} />
 </label>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">Weekly Digest</span>
 <Switch checked={preferences.weeklyDigest} onCheckedChange={(checked) => handlePreferenceChange("weeklyDigest", checked)} />
 </label>

 <h3 className="text-[10px] font-semibold text-foreground uppercase tracking-wider mt-6 mb-2">Privacy</h3>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">Public Profile</span>
 <Switch checked={preferences.publicProfile} onCheckedChange={(checked) => handlePreferenceChange("publicProfile", checked)} />
 </label>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">Show Activity Status</span>
 <Switch checked={preferences.showActivityStatus} onCheckedChange={(checked) => handlePreferenceChange("showActivityStatus", checked)} />
 </label>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">Show Profile Views</span>
 <Switch checked={preferences.showProfileViews} onCheckedChange={(checked) => handlePreferenceChange("showProfileViews", checked)} />
 </label>

 <h3 className="text-[10px] font-semibold text-foreground uppercase tracking-wider mt-6 mb-2">AI Assistants</h3>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">AI Suggestions</span>
 <Switch checked={preferences.aiSuggestions} onCheckedChange={(checked) => handlePreferenceChange("aiSuggestions", checked)} />
 </label>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">Au Icebreakers</span>
 <Switch checked={preferences.autoIcebreakers} onCheckedChange={(checked) => handlePreferenceChange("autoIcebreakers", checked)} />
 </label>
 <label className="flex items-center justify-between gap-3">
 <span className="text-sm">Career Nudges</span>
 <Switch checked={preferences.careerNudges} onCheckedChange={(checked) => handlePreferenceChange("careerNudges", checked)} />
 </label>
 </div>
 </div>
 
 </div>
 </div>
 </motion.div>
 </div>
 )
}
