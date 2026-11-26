// The default-profile route stays question-agnostic. Substitute only this exact fixture.
export const DEMO_TRANSCRIPT_TEXT =
  "I worked on a class project where I implemented an API and wrote integration tests. I would explain my own contribution, the decisions I made, and what I learned.";

export function transcriptForStarter(
  text: string,
  mode: string,
  sample?: string,
) {
  return mode === "demo" && text === DEMO_TRANSCRIPT_TEXT && sample
    ? sample
    : text;
}
