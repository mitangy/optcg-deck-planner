
export const MODELS_WAIT_MS = 30_000;

export async function waitForModels(pending: Promise<unknown>, timeoutMs = MODELS_WAIT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([pending.then(() => true as const, () => true as const), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
