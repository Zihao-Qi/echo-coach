import { PracticeWorkspace } from "../../features/practice/PracticeWorkspace";
import type { InterviewTrack } from "../../domain/interview/practice";

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ track?: string | string[] }> }) {
  const { track } = await searchParams;
  const initialTrack: InterviewTrack = track === "swe" || track === "ai-ml" ? track : "behavioral";
  return <PracticeWorkspace initialTrack={initialTrack} />;
}
