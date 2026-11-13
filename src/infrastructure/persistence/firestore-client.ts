import { Firestore } from "@google-cloud/firestore";

let client: Firestore | undefined;
export function firestoreClient() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT is required for durable practice storage.");
  // Uses Application Default Credentials; Firebase association is not required.
  // Skip nested undefined properties during serialization; lease cleanup uses FieldValue.delete().
  return client ??= new Firestore({ projectId, ignoreUndefinedProperties: true });
}
