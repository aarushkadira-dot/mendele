"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { CheckCircle2, Mail, Sparkles, ArrowRight } from "@/components/ui/icons"

import { createClient } from "@/lib/supabase/client"
import { ensureUserRecord } from "@/app/actions/user"
import { Button } from "@/components/ui/button"
import { SignInPage } from "@/components/ui/sign-in"

export default function SignupPage() {
    const [email, setEmail] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [signupSuccess, setSignupSuccess] = useState(false)
    const router = useRouter()
    const searchParams = useSearchParams()
    const redirect = searchParams.get("redirect") || "/dashboard"
    const supabase = createClient()

    const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setError("")

        const formData = new FormData(event.currentTarget)
        const name = formData.get("name") as string
        const emailValue = formData.get("email") as string
        const password = formData.get("password") as string
        setEmail(emailValue)

        const { error: signUpError } = await supabase.auth.signUp({
            email: emailValue,
            password,
            options: {
                data: {
                    full_name: name,
                },
                emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
            },
        })

        if (signUpError) {
            setError(signUpError.message)
            setLoading(false)
            return
        }

        try {
            await ensureUserRecord()
        } catch (e) {
            console.warn("Could not create user record immediately:", e)
        }

        setSignupSuccess(true)
        setLoading(false)
    }

    const handleGoogleSignup = async () => {
        setLoading(true)
        setError("")

        try {
            const { error: signInError } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
                },
            })

            if (signInError) {
                setError(signInError.message)
                setLoading(false)
            }
        } catch (e) {
            console.error("Google signup error:", e)
            setError("An unexpected error occurred with Google signup. Please try again.")
            setLoading(false)
        }
    }

    if (signupSuccess) {
        return (
            <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
                <motion.div
                    className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-lg"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                >
                    <div className="space-y-4 text-center">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
                        >
                            <CheckCircle2 className="w-8 h-8 text-blue-400" />
                        </motion.div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-semibold bg-clip-text text-foreground">
                                Welcome to Networkly! 🎉
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Your professional network journey begins now
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <motion.div
                            className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <div className="flex items-start gap-3">
                                <Mail className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">Check your inbox</p>
                                    <p className="text-xs text-muted-foreground">
                                        We've sent a verification link to <span className="font-mono bg-muted px-1 rounded">{email}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Sparkles className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">What's next?</p>
                                    <p className="text-xs text-muted-foreground">
                                        After verifying, sign in to unlock AI-powered networking and career insights
                                    </p>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="space-y-3"
                        >
                            <Button
                                onClick={() => router.push(`/dashboard`)}
                                className="w-full relative overflow-hidden group"
                                size="lg"
                            >
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    Sign In to Get Started
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </span>
                            </Button>

                            <p className="text-center text-xs text-muted-foreground">
                                Can't find the email? Check your spam folder or
                                <button
                                    onClick={() => setSignupSuccess(false)}
                                    className="text-primary hover:underline ml-1"
                                >
                                    try again
                                </button>
                            </p>
                        </motion.div>
                    </div>
                </motion.div>
            </div>
        )
    }

    return (
        <SignInPage
            isSignUp={true}
            onSignIn={handleSignup}
            onGoogleSignIn={handleGoogleSignup}
            error={error}
            loading={loading}
            onHaveAccount={() => router.push(`/dashboard`)}
            title={<span className="font-light text-foreground tracking-tighter">Join Networkly</span>}
            description="Create your professional identity and connect with thousands of opportunities."
            heroImageSrc="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=2000"
        />
    )
}
