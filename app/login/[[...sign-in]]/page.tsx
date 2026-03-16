"use client"

import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ensureUserRecord } from "@/app/actions/user"
import { SignInPage } from "@/components/ui/sign-in"

export default function LoginPage() {
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const searchParams = useSearchParams()
    const router = useRouter()
    const redirect = searchParams.get("redirect") || "/dashboard"
    const supabase = createClient()

    const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setError("")

        const formData = new FormData(event.currentTarget)
        const email = formData.get("email") as string
        const password = formData.get("password") as string

        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (signInError) {
                setError(signInError.message)
                setLoading(false)
                return
            }

            try {
                await ensureUserRecord()
            } catch (e) {
                console.warn("Could not ensure user record:", e)
            }

            window.location.href = redirect
        } catch (e) {
            console.error("Login error:", e)
            setError("An unexpected error occurred. Please try again.")
            setLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
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
            console.error("Google login error:", e)
            setError("An unexpected error occurred with Google login. Please try again.")
            setLoading(false)
        }
    }

    return (
        <SignInPage
            onSignIn={handleLogin}
            onGoogleSignIn={handleGoogleLogin}
            error={error}
            loading={loading}
            onCreateAccount={() => router.push(`/signup?redirect=${encodeURIComponent(redirect)}`)}
            onResetPassword={() => setError("Password reset is currently handled by Supabase Dashboard.")}
            heroImageSrc="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&q=80&w=2000"
        />
    )
}
