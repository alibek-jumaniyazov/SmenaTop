import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearProfileDrafts, openProfileDraft } from '../profile-drafts';

afterEach(() => {
  clearProfileDrafts();
  vi.useRealTimers();
});

describe('In-memory profile drafts', () => {
  it('restores a draft only to the same account and profile scope', () => {
    openProfileDraft('alice', '/organizations/one').write({ description: 'My edits' });
    expect(openProfileDraft('alice', '/organizations/one').read()).toEqual({
      description: 'My edits',
    });
    expect(openProfileDraft('bob', '/organizations/one').read()).toBeUndefined();
    expect(openProfileDraft('alice', '/organizations/two').read()).toBeUndefined();
    expect(openProfileDraft('alice', 'worker/profile').read()).toBeUndefined();
  });

  it('retains the original company baseline and version separately from later edits', () => {
    const source = { draft: { name: 'New name' }, baseline: { name: 'Old name' }, version: 7 };
    const store = openProfileDraft<typeof source>('alice', '/organizations/one');
    store.write(source);
    source.version = 8;
    source.baseline.name = 'Updated by another manager';
    const restored = store.read()!;
    expect(restored).toEqual({
      draft: { name: 'New name' },
      baseline: { name: 'Old name' },
      version: 7,
    });
    restored.draft.name = 'Another edit';
    expect(store.read()?.draft.name).toBe('New name');
  });

  it('expires a draft after thirty minutes without extending its lifetime on read', () => {
    vi.useFakeTimers();
    const store = openProfileDraft('alice', 'worker/profile');
    store.write({ experience: 'Unsaved experience' });
    vi.advanceTimersByTime(29 * 60 * 1000);
    expect(store.read()).toBeDefined();
    vi.advanceTimersByTime(60 * 1000);
    expect(store.read()).toBeUndefined();
  });

  it('clears saved or discarded edits without deleting other profile drafts', () => {
    const worker = openProfileDraft('alice', 'worker/profile');
    const company = openProfileDraft('alice', '/organizations/one');
    worker.write({ experience: 'Draft' });
    company.write({ description: 'Company draft' });
    worker.clear();
    expect(worker.read()).toBeUndefined();
    expect(company.read()).toEqual({ description: 'Company draft' });
  });

  it('logout removes every draft and rejects delayed cleanup from previous mounts', () => {
    const oldWorker = openProfileDraft('alice', 'worker/profile');
    oldWorker.write({ experience: 'Private draft' });
    openProfileDraft('alice', '/organizations/one').write({ description: 'Private company' });
    clearProfileDrafts();
    oldWorker.write({ experience: 'Cleanup after logout' });
    expect(openProfileDraft('alice', 'worker/profile').read()).toBeUndefined();
    expect(openProfileDraft('alice', '/organizations/one').read()).toBeUndefined();
    const newSession = openProfileDraft('alice', 'worker/profile');
    newSession.write({ experience: 'New session draft' });
    oldWorker.clear();
    expect(newSession.read()).toEqual({ experience: 'New session draft' });
  });
});
