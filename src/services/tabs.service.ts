/**
 * Tab and URL Hash routing service.
 * Manages open project tabs using the format: #tabs=<id>,#<active_id>,<id2>
 */

export interface TabsState {
  tabs: string[];
  activeTab: string | null;
}

type TabsListener = (state: TabsState) => void;

export function parseTabsHash(hash: string): TabsState {
  const clean = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!clean.startsWith('tabs=')) {
    return { tabs: [], activeTab: null };
  }

  const raw = clean.slice('tabs='.length);
  if (!raw.trim()) {
    return { tabs: [], activeTab: null };
  }

  const rawList = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const tabs: string[] = [];
  let activeTab: string | null = null;

  for (const item of rawList) {
    if (item.startsWith('#')) {
      const id = item.slice(1);
      if (id) {
        tabs.push(id);
        activeTab = id;
      }
    } else if (item) {
      tabs.push(item);
    }
  }

  if (!activeTab && tabs.length > 0) {
    activeTab = tabs[0];
  }

  return { tabs, activeTab };
}

export function formatTabsHash(tabs: string[], activeTab: string | null): string {
  if (tabs.length === 0) return '';
  const list = tabs.map((t) => (t === activeTab ? `#${t}` : t));
  return `#tabs=${list.join(',')}`;
}

class TabsService {
  private state: TabsState = {
    tabs: [],
    activeTab: null,
  };
  private listeners: Set<TabsListener> = new Set();
  private isUpdatingHash = false;

  constructor() {
    this.state = parseTabsHash(window.location.hash);

    window.addEventListener('hashchange', () => {
      if (this.isUpdatingHash) return;
      const parsed = parseTabsHash(window.location.hash);
      this.state = parsed;
      this.notify();
    });
  }

  public getState(): TabsState {
    return {
      tabs: [...this.state.tabs],
      activeTab: this.state.activeTab,
    };
  }

  public subscribe(listener: TabsListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  private syncHash(): void {
    this.isUpdatingHash = true;
    const hash = formatTabsHash(this.state.tabs, this.state.activeTab);
    if (hash) {
      window.location.hash = hash;
    } else {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    this.isUpdatingHash = false;
    this.notify();
  }

  public openTab(id: string): void {
    if (!this.state.tabs.includes(id)) {
      this.state.tabs.push(id);
    }
    this.state.activeTab = id;
    this.syncHash();
  }

  public selectTab(id: string): void {
    if (this.state.tabs.includes(id)) {
      this.state.activeTab = id;
      this.syncHash();
    }
  }

  public closeTab(id: string): void {
    const idx = this.state.tabs.indexOf(id);
    if (idx === -1) return;

    this.state.tabs.splice(idx, 1);

    if (this.state.activeTab === id) {
      if (this.state.tabs.length > 0) {
        const nextIdx = Math.min(idx, this.state.tabs.length - 1);
        this.state.activeTab = this.state.tabs[nextIdx];
      } else {
        this.state.activeTab = null;
      }
    }

    this.syncHash();
  }

  public closeAllTabs(): void {
    this.state.tabs = [];
    this.state.activeTab = null;
    this.syncHash();
  }
}

export const tabsService = new TabsService();
