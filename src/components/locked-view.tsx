"use client"

import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export function LockedView() {
  return (
    <div className="min-h-screen max-md:min-h-0 max-md:flex-1 max-md:h-full bg-background flex flex-col items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Subscription ended
        </h1>
        <p className="mt-3 text-muted-foreground">
          Your access has been paused. Resubscribe to continue reading Spanish with Lector.
        </p>
        <Link to="/settings" className="mt-6 block">
          <Button className="w-full">View pricing plans</Button>
        </Link>
      </div>
    </div>
  )
}
