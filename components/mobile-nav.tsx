"use client"

import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Menu } from "@/components/ui/icons"
import { Sidebar } from "@/components/sidebar"
import { useState, useEffect } from "react"

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="mr-2 px-0 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 lg:hidden"
      >
        <Menu className="h-6 w-6" />
        <span className="sr-only">Toggle Menu</span>
      </Button>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 px-0 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 lg:hidden"
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 border-r-0 bg-transparent shadow-none w-auto max-w-xs" showCloseButton={false}>
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <SheetDescription className="sr-only">
          Main navigation menu for Networkly
        </SheetDescription>
        <Sidebar 
          className="static h-full w-full border-r-0 bg-background/95 scrollbar-hide" 
          onClose={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
