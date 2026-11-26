import { demoAudioPaths } from "../../content/questions/demo-audio";

export const isPublicPracticeApi = (path: string) =>
  /^\/api\/practice\/(?:access|evaluate|attempts(?:\/[0-9a-fA-F-]+)?)$/.test(
    path,
  );

export function isPublicDemoPathAllowed(
  path: string,
  audio: ReadonlySet<string> = demoAudioPaths,
) {
  return (
    isPublicPracticeApi(path) ||
    path === "/" ||
    path === "/practice" ||
    path === "/practice/" ||
    path === "/mock-interview" ||
    path === "/mock-interview/" ||
    audio.has(path) ||
    path === "/favicon.ico" ||
    path.startsWith("/_next/static/")
  );
}
