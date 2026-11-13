// A deadline rejects its waiter, not the pending acquisition. Dispose resources
// that arrive after the owner has already entered cleanup.
export async function acquireOrDispose<T>(acquire: () => Promise<T>, expired: () => boolean, dispose: (resource: T) => Promise<void>): Promise<T> {
  const resource = await acquire();
  if (expired()) { await dispose(resource); throw new Error("Resource arrived after workflow expiry."); }
  return resource;
}

export async function withDeadline<T>(label: string, milliseconds: number, operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms deadline.`)), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}
