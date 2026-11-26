import type { Metadata } from "next";
import { CoachProvider } from "../../providers/CoachProvider";

// Only the original voice prototype loads its provider, audio preload, and
// Gemini Live client. One shared instance spans /legacy → /session/[id] → recap.
export const metadata: Metadata = {
  description: "Live interview expression coach for spoken grammar, phrasing, and professional answers",
};

export default function LegacyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <CoachProvider><div className="legacy contents">{children}</div></CoachProvider>;
}
