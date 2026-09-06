/**
 * Progressive Web App (PWA) registration and lifecycle service.
 * Powered by jq79 $reactive store.
 */
import { $reactive, ReactiveDeepData } from 'jq79';

export interface PwaState {
  isInstallable: boolean;
  isOffline: boolean;
  isInstalled: boolean;
}

type PwaListener = (state: PwaState) => void;

class PwaService {
  private deferredPrompt: any = null;
  public readonly state: ReactiveDeepData<PwaState>;
  private listeners: Set<PwaListener> = new Set();

  constructor() {
    this.state = $reactive<PwaState>({
      isInstallable: false,
      isOffline: !navigator.onLine,
      isInstalled: window.matchMedia('(display-mode: standalone)').matches,
    });
    this.initListeners();

    this.state.$onAny(() => {
      this.notify();
    });
  }

  private initListeners(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.state.isInstallable = true;
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.state.isInstallable = false;
      this.state.isInstalled = true;
    });

    window.addEventListener('online', () => {
      this.state.isOffline = false;
    });

    window.addEventListener('offline', () => {
      this.state.isOffline = true;
    });
  }

  public async registerServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
      try {
        await navigator.serviceWorker.register('./sw.js');
        console.log('[PWA] ServiceWorker registered successfully');
      } catch (err) {
        console.warn('[PWA] ServiceWorker registration failed:', err);
      }
    }
  }

  public async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.state.isInstallable = false;
    return outcome === 'accepted';
  }

  public getState(): PwaState {
    return { ...this.state };
  }

  public subscribe(listener: PwaListener): () => void {
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
}

export const pwaService = new PwaService();
