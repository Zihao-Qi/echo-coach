import { lstat, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { validateCanonicalWav } from "../../src/domain/audio/canonical-wav";
import { canonicalJson, manifestSchema, sha256, type PilotManifest } from "./spec";

export async function loadCorpus(manifestPath: string) {
  if (basename(manifestPath) !== "manifest.json") throw new Error("Select an explicit manifest.json, not another local file.");
  const info = await lstat(manifestPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 100_000) throw new Error("Manifest must be a small regular file.");
  let value: unknown;
  try { value = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch { throw new Error("Invalid manifest JSON; its contents are not logged."); }
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) throw new Error("Manifest violates the frozen pilot schema.");
  const manifest: PilotManifest = parsed.data;
  const audio = new Map<string, Uint8Array>();
  for (const fixture of manifest.fixtures) {
    const file = join(dirname(manifestPath), fixture.file);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) throw new Error("Fixture must be a bounded regular WAV file.");
    const bytes = await readFile(file);
    const wav = validateCanonicalWav(bytes);
    if (wav.frames !== fixture.frames || sha256(bytes) !== fixture.sha256) throw new Error("Fixture bytes changed; regenerate/audit before freezing.");
    audio.set(fixture.id, bytes);
  }
  const clean = manifest.fixtures[0]; const noisy = manifest.fixtures[4];
  if (noisy.reference !== clean.reference || noisy.provenance.sourceSha256 !== clean.sha256 || noisy.frames !== clean.frames) {
    throw new Error("Noisy case must derive from the exact clean reference/audio.");
  }
  return { manifest, manifestSha256: sha256(canonicalJson(manifest)), audio };
}
