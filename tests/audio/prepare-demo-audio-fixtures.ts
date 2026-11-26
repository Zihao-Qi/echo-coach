import { existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { DemoAudioAsset } from "../../src/content/questions/demo-audio";
import {
  generateSpeech,
  MANIFEST_FILE,
  saveAudio,
  speechJobs,
} from "../../scripts/generate-demo-audio";

async function main() {
  // Only use a disposable checkout copy. This replaces neither the real audio nor its manifest.
  const root = realpathSync(process.cwd());
  const insideTemp = relative(realpathSync(tmpdir()), root);
  if (
    !insideTemp ||
    insideTemp.startsWith("..") ||
    existsSync(join(root, ".git"))
  ) {
    throw new Error(
      "Run this only in a disposable checkout copy under the OS temporary directory.",
    );
  }
  const file = join(root, MANIFEST_FILE);
  if (
    JSON.parse(readFileSync(file, "utf8")).length ||
    existsSync(join(root, "public/audio"))
  ) {
    throw new Error(
      "The disposable copy must have an empty manifest and no audio files.",
    );
  }
  const manifest: DemoAudioAsset[] = [];
  const silence = Buffer.alloc(12 * 24_000 * 2);
  const result = await generateSpeech(speechJobs(), {
    generate: async () => ({
      mimeType: "audio/L16;codec=pcm;rate=24000",
      bytes: silence,
    }),
    save: (job, audio) =>
      saveAudio(
        root,
        manifest,
        { ...job, voice: "none" },
        audio,
        "test-silence",
      ),
    log: () => {},
  });
  if (result.stopped || manifest.length !== speechJobs().length)
    throw new Error("Silent fixture generation did not finish.");
  console.log(`Prepared ${manifest.length} local silent audio fixtures.`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
