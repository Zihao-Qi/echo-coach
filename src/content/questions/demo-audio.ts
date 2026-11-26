import bundled from "./audio-manifest.json";
import {
  sampleContent,
  type SampleQuestionContent,
  type SampleQuestionId,
} from "./sample-content";

export type DemoAudioKind = "question" | "answer";
export interface DemoAudioAsset {
  id: SampleQuestionId;
  kind: DemoAudioKind;
  path: string;
  textSha256: string;
  fileSha256: string;
  size: number;
  durationSeconds: number;
  model: string;
  voice: string;
}

export const demoAudioAssets: readonly DemoAudioAsset[] =
  bundled as DemoAudioAsset[];
export const demoAudioPaths: ReadonlySet<string> = new Set(
  demoAudioAssets.map(({ path }) => path),
);

export function getDemoAudio(
  id: string,
  kind: DemoAudioKind,
): DemoAudioAsset | undefined {
  return demoAudioAssets.find(
    (asset) => asset.id === id && asset.kind === kind,
  );
}

export function getSampleContent(
  id: string,
): SampleQuestionContent | undefined {
  return Object.hasOwn(sampleContent, id)
    ? sampleContent[id as SampleQuestionId]
    : undefined;
}
