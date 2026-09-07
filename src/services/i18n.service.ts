/**
 * UI translations.
 *
 * The locale comes from the browser (`navigator.languages`, matched on the primary
 * subtag) and falls back to English, which is always loaded so a key missing from a
 * translation still renders real text instead of the key itself.
 *
 * Catalogues live in `messages/<locale>.yml` at the repository root, so translators work
 * on plain files with no build step and no code around them.
 */
import enSource from '../../messages/en.yml?raw';
import { getMessage, interpolate, parseYaml, MessageTree } from '../helpers/yaml.helper';

export const FALLBACK_LOCALE = 'en';

/**
 * Translations other than the fallback, keyed by primary language subtag. They are
 * loaded on demand, so a visitor only downloads the language they actually get.
 */
const TRANSLATIONS: Record<string, () => Promise<{ default: string }>> = {
  es: () => import('../../messages/es.yml?raw'),
};

export const SUPPORTED_LOCALES = [FALLBACK_LOCALE, ...Object.keys(TRANSLATIONS)];

/**
 * Picks the first browser language the app has a catalogue for, comparing primary
 * subtags so `es-AR` matches `es`.
 */
export function resolveLocale(preferred: readonly string[], supported: readonly string[] = SUPPORTED_LOCALES): string {
  for (const tag of preferred) {
    const primary = String(tag || '').toLowerCase().split('-')[0];
    if (supported.includes(primary)) return primary;
  }
  return FALLBACK_LOCALE;
}

class I18nService {
  private locale: string = FALLBACK_LOCALE;
  private messages: MessageTree = parseYaml(enSource);
  private fallback: MessageTree = this.messages;
  private missing: Set<string> = new Set();

  /**
   * Loads the catalogue for the browser's language. English is bundled with the app, so
   * an English-speaking visitor makes no extra request.
   */
  public async init(preferred?: readonly string[]): Promise<string> {
    const languages =
      preferred ?? (typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []);
    this.locale = resolveLocale(languages || []);
    // Always start from English so re-initializing with another language never leaves
    // the previous catalogue in place.
    this.messages = this.fallback;

    if (this.locale !== FALLBACK_LOCALE) {
      try {
        const module = await TRANSLATIONS[this.locale]();
        this.messages = parseYaml(module.default);
      } catch (err) {
        console.warn(`[i18n] Falling back to ${FALLBACK_LOCALE}: ${this.locale} failed to load`, err);
        this.locale = FALLBACK_LOCALE;
        this.messages = this.fallback;
      }
    }

    if (typeof document !== 'undefined') {
      document.documentElement.lang = this.locale;
      const title = this.t('app.title');
      if (title !== 'app.title') document.title = title;
    }

    return this.locale;
  }

  public getLocale(): string {
    return this.locale;
  }

  /**
   * Translates a dotted key, substituting `{name}` placeholders. Falls back to English
   * and, failing that, returns the key so a gap is visible rather than blank.
   */
  public t = (key: string, params?: Record<string, string | number>): string => {
    const message = getMessage(this.messages, key) ?? getMessage(this.fallback, key);
    if (message === undefined) {
      if (!this.missing.has(key)) {
        this.missing.add(key);
        console.warn(`[i18n] Missing message for "${key}"`);
      }
      return key;
    }
    return interpolate(message, params);
  };
}

export const i18nService = new I18nService();
export const t = i18nService.t;
