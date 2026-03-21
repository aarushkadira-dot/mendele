"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
 ImageIcon,
 FileUp,
 MonitorIcon,
 CircleUserRound,
 ArrowUpIcon,
 Paperclip,
 PlusIcon,
 Code2,
 Palette,
 Layers,
 Rocket,
 Sparkles,
 Search,
 Briefcase,
 UserRound,
 GraduationCap,
 Target
} from "@/components/ui/icons";

interface Message {
 id: string;
 role: "user" | "assistant";
 content: string;
}

const svgPaths = {
 p36880f80: "M0.32 0C0.20799 0 0.151984 0 0.109202 0.0217987C0.0715695 0.0409734 0.0409734 0.0715695 0.0217987 0.109202C0 0.151984 0 0.20799 0 0.32V6.68C0 6.79201 0 6.84801 0.0217987 6.8908C0.0409734 6.92843 0.0715695 6.95902 0.109202 6.9782C0.151984 7 0.207989 7 0.32 7L3.68 7C3.79201 7 3.84802 7 3.8908 6.9782C3.92843 6.95903 3.95903 6.92843 3.9782 6.8908C4 6.84801 4 6.79201 4 6.68V4.32C4 4.20799 4 4.15198 4.0218 4.1092C4.04097 4.07157 4.07157 4.04097 4.1092 4.0218C4.15198 4 4.20799 4 4.32 4L19.68 4C19.792 4 19.848 4 19.8908 4.0218C19.9284 4.04097 19.959 4.07157 19.9782 4.1092C20 4.15198 20 4.20799 20 4.32V6.68C20 6.79201 20 6.84802 20.0218 6.8908C20.041 6.92843 20.0716 6.95903 20.1092 6.9782C20.152 7 20.208 7 20.32 7L23.68 7C23.792 7 23.848 7 23.8908 6.9782C23.9284 6.95903 23.959 6.92843 23.9782 6.8908C24 6.84802 24 6.79201 24 6.68V0.32C24 0.20799 24 0.151984 23.9782 0.109202C23.959 0.0715695 23.9284 0.0409734 23.8908 0.0217987C23.848 0 23.792 0 23.68 0H0.32Z",
 p355df480: "M0.32 16C0.20799 16 0.151984 16 0.109202 15.9782C0.0715695 15.959 0.0409734 15.9284 0.0217987 15.8908C0 15.848 0 15.792 0 15.68V9.32C0 9.20799 0 9.15198 0.0217987 9.1092C0.0409734 9.07157 0.0715695 9.04097 0.109202 9.0218C0.151984 9 0.207989 9 0.32 9H3.68C3.79201 9 3.84802 9 3.8908 9.0218C3.92843 9.04097 3.95903 9.07157 3.9782 9.1092C4 9.15198 4 9.20799 4 9.32V11.68C4 11.792 4 11.848 4.0218 11.8908C4.04097 11.9284 4.07157 11.959 4.1092 11.9782C4.15198 12 4.20799 12 4.32 12L19.68 12C19.792 12 19.848 12 19.8908 11.9782C19.9284 11.959 19.959 11.9284 19.9782 11.8908C20 11.848 20 11.792 20 11.68V9.32C20 9.20799 20 9.15199 20.0218 9.1092C20.041 9.07157 20.0716 9.04098 20.1092 9.0218C20.152 9 20.208 9 20.32 9H23.68C23.792 9 23.848 9 23.8908 9.0218C23.9284 9.04098 23.959 9.07157 23.9782 9.1092C24 9.15199 24 9.20799 24 9.32V15.68C24 15.792 24 15.848 23.9782 15.8908C23.959 15.9284 23.9284 15.959 23.8908 15.9782C23.848 16 23.792 16 23.68 16H0.32Z",
 pfa0d600: "M6.32 10C6.20799 10 6.15198 10 6.1092 9.9782C6.07157 9.95903 6.04097 9.92843 6.0218 9.8908C6 9.84802 6 9.79201 6 9.68V6.32C6 6.20799 6 6.15198 6.0218 6.1092C6.04097 6.07157 6.07157 6.04097 6.1092 6.0218C6.15198 6 6.20799 6 6.32 6L17.68 6C17.792 6 17.848 6 17.8908 6.0218C17.9284 6.04097 17.959 6.07157 17.9782 6.1092C18 6.15198 18 6.20799 18 6.32V9.68C18 9.79201 18 9.84802 17.9782 9.8908C17.959 9.92843 17.9284 9.95903 17.8908 9.9782C17.848 10 17.792 10 17.68 10H6.32Z",
};

function InterfacesLogoSquare({ className }: { className?: string }) {
 return (
 <div className={cn("relative shrink-0 flex items-center justify-center", className)}>
 <svg className="h-auto w-full" fill="none" viewBox="0 0 24 16">
 <g fill="currentColor">
 <path d={svgPaths.p36880f80} />
 <path d={svgPaths.p355df480} />
 <path d={svgPaths.pfa0d600} />
 </g>
 </svg>
 </div>
 );
}

interface AutoResizeProps {
 minHeight: number;
 maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
 const textareaRef = useRef<HTMLTextAreaElement>(null);

 const adjustHeight = useCallback(
 (reset?: boolean) => {
 const textarea = textareaRef.current;
 if (!textarea) return;

 if (reset) {
 textarea.style.height = `${minHeight}px`;
 return;
 }

 textarea.style.height = `${minHeight}px`; // reset first
 const newHeight = Math.max(
 minHeight,
 Math.min(textarea.scrollHeight, maxHeight ?? Infinity)
 );
 textarea.style.height = `${newHeight}px`;
 },
 [minHeight, maxHeight]
 );

 useEffect(() => {
 if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
 }, [minHeight]);

 return { textareaRef, adjustHeight };
}

export default function RuixenMoonChat() {
 const [message, setMessage] = useState("");
 const [messages, setMessages] = useState<Message[]>([]);
 const [isLoading, setIsLoading] = useState(false);
 const scrollRef = useRef<HTMLDivElement>(null);
 
 const { textareaRef, adjustHeight } = useAutoResizeTextarea({
 minHeight: 48,
 maxHeight: 150,
 });

 const handleSend = () => {
 if (!message.trim() || isLoading) return;
 
 const userMsg: Message = { id: Date.now().toString(), role: "user", content: message };
 setMessages((prev) => [...prev, userMsg]);
 setMessage("");
 adjustHeight(true);
 setIsLoading(true);

 const assistantId = (Date.now() + 1).toString();
 setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "..." }]);

 setTimeout(() => {
 setMessages((prev) =>
 prev.map((m) =>
 m.id === assistantId
 ? {
 ...m,
 content:
 "I'm Networkly AI. I can help you discover opportunities and build your professional network! (I am currently running in demo mode, but I hear you!).",
 }
 : m
 )
 );
 setIsLoading(false);
 }, 1500);
 };

 const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
 if (e.key === "Enter" && !e.shiftKey) {
 e.preventDefault();
 handleSend();
 }
 };

 useEffect(() => {
 if (scrollRef.current) {
 scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
 }
 }, [messages]);

 return (
 <div className="relative w-full h-[calc(100vh-60px)] bg-background flex flex-col items-center pt-8 overflow-hidden z-0">
 
 {/* Background Arc */}
 <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden flex justify-center items-end">
 {/* Soft wide glow */}
 <div className="absolute bottom-[-50%] w-[150%] h-[100%] rounded-[100%] bg-blue-400/10 dark:bg-blue-400/30 blur-[100px]" />
 {/* Crisp edge arc */}
 <div className="absolute bottom-[-40%] w-[120%] h-[80%] rounded-[100%] border-t-[4px] border-blue-400/50 dark:border-blue-400/80 bg-blue-50/10 dark:bg-blue-900/30 blur-[2px] shadow-[0_-20px_80px_20px_rgba(59,130,246,0.15)] dark:shadow-[0_-30px_100px_20px_rgba(59,130,246,0.4)]" />
 </div>

 {/* Scrollable Chat / Landing Area */}
 <div 
 ref={scrollRef}
 className="flex-1 w-full max-w-3xl overflow-y-auto mb-6 px-4 no-scrollbar flex flex-col scroll-smooth relative z-10"
 >
 {messages.length === 0 ? (
 <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh]">
 <div className="text-center">
 <h1 className="text-4xl font-semibold text-foreground drop-shadow-md tracking-tight">
 Networkly AI
 </h1>
 <p className="mt-3 text-muted-foreground text-lg">
 Discover opportunities and build your network — just start typing below.
 </p>
 </div>
 </div>
 ) : (
 <div className="w-full flex flex-col gap-6 py-6 mt-auto">
 {messages.map((m) => (
 <div
 key={m.id}
 className={cn(
 "flex w-full gap-3",
 m.role === "user" ? "justify-end" : "justify-start"
 )}
 >
 {m.role === "assistant" && (
 <div className="w-8 h-8 rounded-full bg-blue-400/10 flex items-center justify-center shrink-0 shadow-lg border border-blue-400/30">
 <InterfacesLogoSquare className="w-5 h-5 text-white" />
 </div>
 )}
 
 <div
 className={cn(
 "px-4 py-3 rounded-2xl max-w-[85%] leading-relaxed shadow-sm text-sm",
 m.role === "user"
 ? "bg-primary/10 dark:bg-white/10 text-foreground backdrop-blur-md border border-primary/20 dark:border-white/20"
 : "bg-card/80 dark:bg-black/60 text-card-foreground border border-border backdrop-blur-md"
 )}
 >
 {m.content}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Input Box Section */}
 <div className="w-full max-w-3xl pb-[5vh] px-4 shrink-0 relative z-10">
 <div className="relative bg-card/60 dark:bg-black/60 backdrop-blur-md rounded-xl border border-border shadow-xl">
 <Textarea
 ref={textareaRef}
 value={message}
 onChange={(e) => {
 setMessage(e.target.value);
 adjustHeight();
 }}
 onKeyDown={handleKeyDown}
 placeholder="Type your request... (Demo only)"
 className={cn(
 "w-full px-4 py-3 resize-none border-none",
 "bg-transparent text-foreground text-sm",
 "focus-visible:ring-0 focus-visible:ring-offset-0",
 "placeholder:text-muted-foreground min-h-[48px]"
 )}
 style={{ overflow: "hidden" }}
 />

 {/* Footer Buttons */}
 <div className="flex items-center justify-between p-3">
 <Button
 variant="ghost"
 size="icon"
 className="text-muted-foreground hover:bg-zinc-100 dark:hover:bg-neutral-800 hover:text-foreground transition-colors"
 >
 <Paperclip className="w-4 h-4" />
 </Button>

 <div className="flex items-center gap-2">
 <Button
 disabled={!message.trim() || isLoading}
 onClick={handleSend}
 className={cn(
 "flex items-center gap-1 px-3 py-2 rounded-lg transition-colors",
 message.trim() && !isLoading
 ? "bg-primary text-primary-foreground hover:bg-primary/90" 
 : "bg-muted text-muted-foreground cursor-not-allowed"
 )}
 >
 <ArrowUpIcon className="w-4 h-4" />
 <span className="sr-only">Send</span>
 </Button>
 </div>
 </div>
 </div>

 {/* Quick Actions (conditionally display only if no messages) */}
 {messages.length === 0 && (
 <div className="flex items-center justify-center flex-wrap gap-3 mt-6">
 <QuickAction icon={<Search className="w-4 h-4" />} label="Find Opportunities" />
 <QuickAction icon={<Briefcase className="w-4 h-4" />} label="Career Guidance" />
 <QuickAction icon={<UserRound className="w-4 h-4" />} label="Review Profile" />
 <QuickAction icon={<GraduationCap className="w-4 h-4" />} label="Discover Researchers" />
 <QuickAction icon={<Target className="w-4 h-4" />} label="Set Goals" />
 </div>
 )}
 </div>
 </div>
 );
}

interface QuickActionProps {
 icon: React.ReactNode;
 label: string;
}

function QuickAction({ icon, label }: QuickActionProps) {
 return (
 <Button
 variant="outline"
 className="flex items-center gap-2 rounded-full border-border bg-card/60 dark:bg-black/50 text-foreground hover:bg-accent hover:text-accent-foreground backdrop-blur-sm"
 >
 {icon}
 <span className="text-xs">{label}</span>
 </Button>
 );
}
