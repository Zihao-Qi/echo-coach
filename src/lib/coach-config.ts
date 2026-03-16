export const DEFAULT_LANGUAGE = "en-US" as const;
export const MVP_SCENARIO = "interview" as const;
export const INTERVIEW_OPENING_QUESTION =
  "Tell me about yourself and why you are interested in this role.";
export const MAX_INTERVIEW_QUESTIONS = 3;

export const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
export const LIVE_VOICE_NAME = "Kore";
export const TRANSCRIPTION_MODEL = "chirp_3";
export const ANALYSIS_MODEL = "gemini-2.5-flash";
export const TTS_MODEL = "gemini-2.5-flash-preview-tts";
export const TTS_FALLBACK_MODEL = "gemini-2.5-pro-preview-tts";
export const RECAP_CARD_MODEL = "imagen-4.0-generate-001";

export const DEFAULT_ENCOURAGEMENT_LINE =
  "Your clarity is taking you forward.";
export const DEFAULT_ROLE_LABEL = "Professional Candidate";
export const DEFAULT_STRENGTH_KEYWORD = "clarity";

const MOCK_INTERVIEW_EXAMPLES = [
  {
    question: INTERVIEW_OPENING_QUESTION,
    originalTranscript:
      "I think I am a good fit because I have worked on a lot of things and I can probably help the team quickly.",
    polishedAnswer:
      "I am a strong fit for this role because I have delivered similar work, and I can help the team contribute quickly.",
    improvementTags: ["Tighter structure", "More confident tone"],
    coachMessage:
      "Lead with your strongest fit statement, then close with the value you can deliver for the team right away.",
    roleLabel: "Technical Builder",
    strengthKeyword: "delivery",
  },
  {
    question:
      "Can you walk me through a recent project where you made a measurable impact?",
    originalTranscript:
      "In my last role I helped with onboarding and we made it a bit faster for customers, and I worked with a few teams to get it done.",
    polishedAnswer:
      "A recent example is a customer onboarding project where I partnered across teams to streamline the workflow and reduce time to value for new customers.",
    improvementTags: ["More concrete example", "Stronger impact statement"],
    coachMessage:
      "Anchor the answer around one project and make the outcome more explicit so your impact is easier to follow.",
    roleLabel: "Product-Minded Engineer",
    strengthKeyword: "impact",
  },
  {
    question:
      "If you joined this team, how would you build trust and ramp up in your first 90 days?",
    originalTranscript:
      "I would try to learn fast, meet people, understand the product, and then start helping wherever I can as soon as possible.",
    polishedAnswer:
      "In my first 90 days, I would build trust by learning the team's priorities quickly, meeting key partners early, and delivering one visible win that supports the product roadmap.",
    improvementTags: ["Clearer plan", "More executive phrasing"],
    coachMessage:
      "This answer improves when you lay out a simple plan and connect your ramp-up to a visible business outcome.",
    roleLabel: "Engineering Leader",
    strengthKeyword: "ownership",
  },
] as const;

export function getInterviewQuestionByIndex(questionIndex: number) {
  const clampedIndex = Math.min(Math.max(questionIndex, 1), MAX_INTERVIEW_QUESTIONS) - 1;
  return MOCK_INTERVIEW_EXAMPLES[clampedIndex]?.question || INTERVIEW_OPENING_QUESTION;
}

export function getMockInterviewExample(questionIndex: number) {
  const clampedIndex = Math.min(Math.max(questionIndex, 1), MAX_INTERVIEW_QUESTIONS) - 1;
  return MOCK_INTERVIEW_EXAMPLES[clampedIndex] || MOCK_INTERVIEW_EXAMPLES[0];
}
