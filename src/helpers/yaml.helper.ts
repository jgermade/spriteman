/**
 * Minimal YAML reader for the message catalogues in `messages/*.yml`.
 *
 * Deliberately covers only what those files use, so the app ships no parser dependency:
 * comments, nested maps by indentation, and `key: value` scalars that may be plain,
 * single-quoted or double-quoted. Double-quoted values understand `\n`, `\t`, `\"` and
 * `\\`. Lists, anchors, multi-line blocks and typed scalars are not supported — every
 * value is a string.
 *
 * A line it cannot make sense of is skipped rather than throwing, so one malformed entry
 * never blanks out an entire UI.
 */

export type MessageTree = { [key: string]: string | MessageTree };

const unescapeDoubleQuoted = (raw: string): string =>
  raw.replace(/\\(["\\ntr])/g, (_, char) => {
    switch (char) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      default:
        return char;
    }
  });

/** Strips a trailing `# comment` from an unquoted scalar. */
const stripInlineComment = (value: string): string => {
  const hash = value.indexOf(' #');
  return hash === -1 ? value : value.slice(0, hash);
};

const parseScalar = (raw: string): string => {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return unescapeDoubleQuoted(value.slice(1, -1));
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return stripInlineComment(value).trim();
};

export function parseYaml(source: string): MessageTree {
  const root: MessageTree = {};
  // Stack of open maps paired with the indentation that opened them.
  const stack: Array<{ indent: number; node: MessageTree }> = [{ indent: -1, node: root }];

  for (const line of source.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    const colon = content.indexOf(':');
    if (colon === -1) continue;

    const key = content.slice(0, colon).trim();
    if (!key) continue;
    const rest = content.slice(colon + 1);

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].node;

    if (rest.trim() === '') {
      const child: MessageTree = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else {
      parent[key] = parseScalar(rest);
    }
  }

  return root;
}

/** Reads a dotted path out of a parsed tree, or returns undefined. */
export function getMessage(tree: MessageTree, path: string): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Substitutes `{name}` placeholders. Unknown placeholders are left untouched. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined ? match : String(params[name])
  );
}
