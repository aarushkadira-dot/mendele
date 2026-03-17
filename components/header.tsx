"use client"

import { useState, useEffect } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSupabaseUser } from "@/hooks/use-supabase-user"
import { useHasMounted } from "@/hooks/use-has-mounted"
import { SearchResultsDropdown } from "@/components/search/search-results-dropdown"
import { globalSearch, type SearchResults } from "@/app/actions/search"
import { useDebouncedCallback } from "@/hooks/use-debounced-callback"

export function Header() {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const { user, signOut } = useSupabaseUser()
  const hasMounted = useHasMounted()

  const userName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "User"
  const userEmail = user?.email || ""
  const userAvatar = (user?.user_metadata?.avatar_url as string | undefined) || "/placeholder.svg"
  const userInitials = userName.split(" ").map(n => n[0]).join("").toUpperCase()

  const performSearch = useDebouncedCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    try {
      const results = await globalSearch({ query: query.trim(), type: "all" })
      setSearchResults(results)
    } catch (error) {
      console.error("[Header] Search error:", error)
      setSearchResults(null)
    } finally {
      setIsSearching(false)
    }
  }, 300)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (value.trim().length >= 2) {
      setIsSearchOpen(true)
      performSearch(value)
    } else {
      setIsSearchOpen(false)
      setSearchResults(null)
    }
  }

  const handleCloseSearch = () => {
    setIsSearchOpen(false)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.search-container')) {
        setIsSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 backdrop-blur-sm px-6">
      <div className="flex-1" />

      {/* Search */}
      <div className="relative w-full max-w-md search-container">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
        <Input
          type="search"
          placeholder="Search people, opportunities..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => {
            if (searchQuery.trim().length >= 2) setIsSearchOpen(true)
          }}
          className="pl-10 h-9 bg-secondary/50 border-border/60 text-body-sm focus-visible:ring-1 focus-visible:ring-ring"
        />
        <SearchResultsDropdown
          isOpen={isSearchOpen}
          isLoading={isSearching}
          results={searchResults}
          onClose={handleCloseSearch}
          onSelectResult={() => {
            setIsSearchOpen(false)
            setSearchQuery("")
            setSearchResults(null)
          }}
        />
      </div>

      {/* User Menu */}
      <div className="flex items-center">
        {hasMounted ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={userAvatar} alt={userName} />
                  <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <span className="text-sm font-medium">{userName}</span>
                  <span className="text-xs text-muted-foreground">{userEmail}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/profile">View Profile</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/settings">Settings</a>
              </DropdownMenuItem>
              <DropdownMenuItem>Help & Support</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={async () => {
                  await signOut()
                  window.location.href = "/login"
                }}
              >
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        )}
      </div>
    </header>
  )
}
