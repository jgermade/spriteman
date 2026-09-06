/**
 * ProjectTabs Component — Topbar multi-project tab strip.
 * STRICT RULE: Only imports from helpers/ or other components/.
 */

export interface ProjectTabsOptions {
  tabs?: string[];
  activeTab?: string | null;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onNewTab?: () => void;
}

export class ProjectTabs {
  private element: HTMLElement;
  private tabs: string[];
  private activeTab: string | null;
  private onSelectTab?: (id: string) => void;
  private onCloseTab?: (id: string) => void;
  private onNewTab?: () => void;

  constructor(options: ProjectTabsOptions = {}) {
    this.tabs = options.tabs ?? [];
    this.activeTab = options.activeTab ?? null;
    this.onSelectTab = options.onSelectTab;
    this.onCloseTab = options.onCloseTab;
    this.onNewTab = options.onNewTab;

    this.element = document.createElement('div');
    this.element.className = 'project-tabs-strip';
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public update(tabs: string[], activeTab: string | null): void {
    this.tabs = tabs;
    this.activeTab = activeTab;
    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="tabs-list"></div>
      <button class="btn-new-tab" title="Create or open new project">+</button>
    `;

    const list = this.element.querySelector('.tabs-list')!;

    this.tabs.forEach((tabId) => {
      const isActive = tabId === this.activeTab;
      const tabEl = document.createElement('div');
      tabEl.className = `tab-item ${isActive ? 'active' : ''}`;
      tabEl.innerHTML = `
        <span class="tab-title">📄 ${tabId}</span>
        <button class="tab-close" title="Close tab">✕</button>
      `;

      tabEl.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('tab-close')) return;
        this.onSelectTab?.(tabId);
      });

      tabEl.querySelector('.tab-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onCloseTab?.(tabId);
      });

      list.appendChild(tabEl);
    });

    this.element.querySelector('.btn-new-tab')?.addEventListener('click', () => {
      this.onNewTab?.();
    });
  }
}
