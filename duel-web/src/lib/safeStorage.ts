/**
 * localStorage that never throws. Writes fail on a full quota and when storage is disabled (private mode,
 * blocked site data), and reads can throw in the same situations. Each helper reports whether it worked so
 * a caller can carry on with in-memory state instead of throwing out of a click handler.
 */

/** Write a string; false when the browser refused (quota, disabled storage). */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Remove a key; false when storage is unavailable. */
export function safeRemoveItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Read a string; null when the key is missing or storage is unavailable. */
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
