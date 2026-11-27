import { connection } from "next/server";
import { PUBLIC_DEMO_BUILD } from "./public-demo";

// A nonce exists only on a live request. Static HTML cannot carry one.
export async function renderPublicDemoPerRequest() {
  if (PUBLIC_DEMO_BUILD) await connection();
}
