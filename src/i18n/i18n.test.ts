// Guards the "every text in both languages" rule: English and German must have exactly
// the same keys, and no translation may be empty.
import { describe, expect, it } from 'vitest';
import en from './en.json';
import de from './de.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

describe('translations', () => {
  const enFlat = flatten(en);
  const deFlat = flatten(de);

  it('German has every English key', () => {
    expect(Object.keys(deFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it('no translation is empty', () => {
    for (const [key, value] of [...Object.entries(enFlat), ...Object.entries(deFlat)]) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('placeholders like {{phase}} match between languages', () => {
    const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const key of Object.keys(enFlat)) {
      expect(placeholders(deFlat[key] ?? ''), key).toEqual(placeholders(enFlat[key] ?? ''));
    }
  });
});
