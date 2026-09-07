import { describe, expect, it } from 'vitest';
import { getMessage, interpolate, parseYaml } from '../helpers/yaml.helper';

describe('parseYaml', () => {
  it('reads nested maps and plain scalars', () => {
    const tree = parseYaml(['app:', '  name: Spritemotion', '  save: Save'].join('\n'));
    expect(tree).toEqual({ app: { name: 'Spritemotion', save: 'Save' } });
  });

  it('keeps colons and hashes inside quoted values', () => {
    const tree = parseYaml(
      ['a:', '  time: "Frame: 3 / 4"', '  hash: "colour #ff0000"', "  quoted: 'it''s here'"].join('\n')
    );
    expect(tree.a).toEqual({ time: 'Frame: 3 / 4', hash: 'colour #ff0000', quoted: "it's here" });
  });

  it('unescapes newlines in double-quoted values', () => {
    const tree = parseYaml('a:\n  tip: "one\\ntwo"');
    expect(getMessage(tree, 'a.tip')).toBe('one\ntwo');
  });

  it('ignores comments and blank lines', () => {
    const tree = parseYaml(['# header', '', 'a:', '  # inner', '  b: c', ''].join('\n'));
    expect(tree).toEqual({ a: { b: 'c' } });
  });

  it('strips a trailing comment from an unquoted value', () => {
    expect(getMessage(parseYaml('a:\n  b: hello # trailing'), 'a.b')).toBe('hello');
  });

  it('closes nested blocks when the indentation drops', () => {
    const tree = parseYaml(['a:', '  b:', '    c: deep', '  d: shallow', 'e: top'].join('\n'));
    expect(getMessage(tree, 'a.b.c')).toBe('deep');
    expect(getMessage(tree, 'a.d')).toBe('shallow');
    expect(getMessage(tree, 'e')).toBe('top');
  });

  it('skips a malformed line instead of losing the file', () => {
    const tree = parseYaml(['a:', '  b: ok', '  this line has no colon', '  c: also ok'].join('\n'));
    expect(getMessage(tree, 'a.b')).toBe('ok');
    expect(getMessage(tree, 'a.c')).toBe('also ok');
  });
});

describe('getMessage', () => {
  const tree = parseYaml('a:\n  b: value');

  it('returns undefined for a missing or non-leaf path', () => {
    expect(getMessage(tree, 'a.missing')).toBeUndefined();
    expect(getMessage(tree, 'a')).toBeUndefined();
    expect(getMessage(tree, 'nope.at.all')).toBeUndefined();
  });
});

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('Frame: {current} / {total}', { current: 3, total: 8 })).toBe('Frame: 3 / 8');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}');
    expect(interpolate('Hi {name}')).toBe('Hi {name}');
  });
});
