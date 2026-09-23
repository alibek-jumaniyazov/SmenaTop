import { useCallback, useEffect, useRef, useState } from 'react';

const lifetime = 30 * 60 * 1000;
const drafts = new Map<string, { value: unknown; expiresAt: number }>();
let generation = 0;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Drafts exist only in this tab's memory and are isolated by account and profile. */
export function openProfileDraft<T>(userId: string, scope: string) {
  const key = JSON.stringify([userId, scope]);
  const openedGeneration = generation;
  const active = () => !!userId && generation === openedGeneration;
  return {
    read(): T | undefined {
      if (!active()) return;
      const entry = drafts.get(key);
      if (!entry) return;
      if (entry.expiresAt <= Date.now()) {
        drafts.delete(key);
        return;
      }
      return copy(entry.value as T);
    },
    write(value: T) {
      if (!active()) return;
      for (const [entryKey, entry] of drafts) {
        if (entry.expiresAt <= Date.now()) drafts.delete(entryKey);
      }
      drafts.set(key, { value: copy(value), expiresAt: Date.now() + lifetime });
    },
    clear() {
      if (active()) drafts.delete(key);
    },
  };
}

export function clearProfileDrafts() {
  drafts.clear();
  // A profile unmounts after logout finishes. Its old cleanup must not recreate a draft.
  generation += 1;
}

export function useProfileDraft<T>(userId: string, scope: string) {
  const [store] = useState(() => openProfileDraft<T>(userId, scope));
  const [initialDraft] = useState(() => store.read());
  const snapshot = useRef<T | null>(initialDraft ?? null);
  const capture = useCallback((value: T | null) => {
    snapshot.current = value;
  }, []);
  const clear = useCallback(() => {
    snapshot.current = null;
    store.clear();
  }, [store]);
  useEffect(
    () => () => {
      if (snapshot.current === null) store.clear();
      else store.write(snapshot.current);
    },
    [store],
  );
  return { initialDraft, capture, clear };
}
