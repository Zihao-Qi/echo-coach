import { PracticeWorkspace } from "../../features/practice/PracticeWorkspace";
import type { InterviewTrack } from "../../domain/interview/practice";
import { renderPublicDemoPerRequest } from "../../infrastructure/config/public-demo-rendering";

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ track?: string | string[] }> }) {
  await renderPublicDemoPerRequest();
  const { track } = await searchParams;
  const initialTrack: InterviewTrack = track === "swe" || track === "ai-ml" ? track : "behavioral";
  return <PracticeWorkspace initialTrack={initialTrack} />;
}
