import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { i18nService, resolveLocale, SUPPORTED_LOCALES } from '../services/i18n.service';
import { parseYaml, MessageTree } from '../helpers/yaml.helper';

const readCatalogue = (locale: string): MessageTree =>
  parseYaml(readFileSync(resolve(process.cwd(), `messages/${locale}.yml`), 'utf8'));

const flatten = (tree: MessageTree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`)
  );

describe('resolveLocale', () => {
  it('matches on the primary subtag', () => {
    expect(resolveLocale(['es-AR', 'en-US'])).toBe('es');
    expect(resolveLocale(['en-GB'])).toBe('en');
  });

  it('falls back to English for anything unsupported', () => {
    expect(resolveLocale(['fr-FR', 'de'])).toBe('en');
    expect(resolveLocale([])).toBe('en');
    expect(resolveLocale([''])).toBe('en');
  });

  it('prefers the first supported entry in the list', () => {
    expect(resolveLocale(['fr', 'es', 'en'])).toBe('es');
  });
});

describe('catalogues', () => {
  it('ships the locales the loader advertises', () => {
    expect(SUPPORTED_LOCALES.sort()).toEqual(['en', 'es']);
  });

  it('keeps every locale in sync with the English keys', () => {
    const english = flatten(readCatalogue('en')).sort();
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== 'en')) {
      expect(flatten(readCatalogue(locale)).sort(), `${locale}.yml`).toEqual(english);
    }
  });

  it('keeps the same placeholders in every translation', () => {
    const placeholders = (value: string) => (value.match(/\{\w+\}/g) || []).sort().join(',');
    const english = readCatalogue('en');
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== 'en')) {
      const translated = readCatalogue(locale);
      for (const key of flatten(english)) {
        const from = key.split('.').reduce<any>((node, part) => node?.[part], english);
        const to = key.split('.').reduce<any>((node, part) => node?.[part], translated);
        expect(placeholders(to), `${locale}.yml → ${key}`).toBe(placeholders(from));
      }
    }
  });
});

describe('translation', () => {
  it('returns English before init and interpolates params', async () => {
    expect(i18nService.t('app.name')).toBe('Spritemotion');
    expect(i18nService.t('app.fps_badge', { fps: 12 })).toBe('12 FPS');
  });

  it('returns the key itself when a message does not exist', () => {
    expect(i18nService.t('nope.missing')).toBe('nope.missing');
  });

  it('switches catalogue for a Spanish browser and falls back for an unknown one', async () => {
    expect(await i18nService.init(['es-ES'])).toBe('es');
    expect(i18nService.t('layers.title')).toBe('Jerarquía de capas');

    expect(await i18nService.init(['fr-FR'])).toBe('en');
    expect(i18nService.t('layers.title')).toBe('Layer Hierarchy');
  });
});
