"use client";

import { usePathname } from "next/navigation";
import { CoachProvider } from "./CoachProvider";

// The new practice workspace must not open legacy audio/preload workflows.
export function LegacyCoachBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/legacy") && !pathname.startsWith("/session/")) return children;
  return <CoachProvider>{children}</CoachProvider>;
}
