import type React from "react"
import type { Metadata } from "next"
import { Manrope, JetBrains_Mono } from "next/font/google"
import { Toaster } from "sonner"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Networkly",
  description: "Connect, grow, and succeed with AI-powered networking, opportunity discovery, and career guidance.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/networkly-logo-mini.png", media: "(prefers-color-scheme: light)" },
      { url: "/networkly-logo-mini-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/networkly-logo-mini.png",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
                try {
                  if (localStorage.getItem('theme') === 'dark' || ((!('theme' in localStorage) || localStorage.getItem('theme') === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (_) {}
              `,
          }}
        />
      </head>
      <body className={`${manrope.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <div className="relative">
            {children}
          </div>
          <Toaster
            position="top-center"
            toastOptions={{
              classNames: {
                toast: "font-sans",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
