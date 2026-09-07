import { describe, expect, it } from 'vitest';
import { formatTabsHash, parseTabsHash } from '../services/tabs.service';

describe('parseTabsHash', () => {
  it('returns an empty state for an unrelated hash', () => {
    expect(parseTabsHash('')).toEqual({ tabs: [], activeTab: null });
    expect(parseTabsHash('#other=1')).toEqual({ tabs: [], activeTab: null });
  });

  it('reads tabs and marks the active one', () => {
    expect(parseTabsHash('#tabs=walk,#run,idle')).toEqual({
      tabs: ['walk', 'run', 'idle'],
      activeTab: 'run',
    });
  });

  it('falls back to the first tab when none is marked active', () => {
    expect(parseTabsHash('#tabs=walk,idle')).toEqual({ tabs: ['walk', 'idle'], activeTab: 'walk' });
  });
});

describe('formatTabsHash', () => {
  it('round-trips through parseTabsHash', () => {
    const hash = formatTabsHash(['walk', 'run', 'idle'], 'run');
    expect(hash).toBe('#tabs=walk,#run,idle');
    expect(parseTabsHash(hash)).toEqual({ tabs: ['walk', 'run', 'idle'], activeTab: 'run' });
  });

  it('produces an empty hash with no tabs open', () => {
    expect(formatTabsHash([], null)).toBe('');
  });
});
