// cloc-style line classifier: every line is exactly one of code / comment / blank.
// A line with any code on it is code; a line with only comment content is comment.

const compiled = new WeakMap();

function compile(syntax) {
  let c = compiled.get(syntax);
  if (c) return c;
  // Block openers are checked before line prefixes so e.g. Lua's `--[[` wins over `--`.
  const tokens = [
    ...syntax.block.map(([open, close]) => ({ kind: 'block', open, close })),
    ...syntax.line.map((open) => ({ kind: 'line', open })),
    ...syntax.str.map((open) => ({ kind: 'str', open })),
  ];
  const firsts = new Set(tokens.map((t) => t.open.charCodeAt(0)));
  c = { tokens, firsts, trivial: tokens.length === 0 };
  compiled.set(syntax, c);
  return c;
}

const isSpace = (ch) => ch === 32 || ch === 9 || ch === 13 || ch === 12 || ch === 11;

/**
 * Count lines in `text` using `syntax` ({ line, block, str }).
 * @returns {{ code: number, comment: number, blank: number }}
 */
export function countLines(text, syntax) {
  const { tokens, firsts, trivial } = compile(syntax);
  let code = 0, comment = 0, blank = 0;

  // Drop a single trailing newline so "a\nb\n" is 2 lines, like wc -l / cloc.
  const end = text.endsWith('\n') ? text.length - 1 : text.length;
  if (end <= 0) return { code, comment, blank };

  let blockClose = null; // closing token of an open block comment
  let strQuote = null;   // open multi-line string (only backtick survives newlines)

  let start = 0;
  while (start <= end) {
    let nl = text.indexOf('\n', start);
    if (nl === -1 || nl > end) nl = end;

    let hasCode = false, hasComment = false;

    if (start === 0 && text.startsWith('#!')) {
      hasCode = true; // shebang counts as code, like cloc
    } else if (trivial) {
      for (let i = start; i < nl; i++) {
        if (!isSpace(text.charCodeAt(i))) { hasCode = true; break; }
      }
    } else {
      let i = start;
      while (i < nl) {
        if (blockClose !== null) {
          hasComment = true;
          const j = text.indexOf(blockClose, i);
          if (j === -1 || j >= nl) { i = nl; break; }
          i = j + blockClose.length;
          blockClose = null;
          continue;
        }
        if (strQuote !== null) {
          hasCode = true;
          let closed = false;
          while (i < nl) {
            const ch = text[i];
            if (ch === '\\') { i += 2; continue; }
            i++;
            if (ch === strQuote) { closed = true; break; }
          }
          if (closed || strQuote !== '`') strQuote = null;
          continue;
        }

        const cc = text.charCodeAt(i);
        if (isSpace(cc)) { i++; continue; }
        if (!firsts.has(cc)) { hasCode = true; i++; continue; }

        let matched = null;
        for (const t of tokens) {
          if (text.startsWith(t.open, i)) { matched = t; break; }
        }
        if (!matched) { hasCode = true; i++; continue; }

        if (matched.kind === 'line') { hasComment = true; break; }
        if (matched.kind === 'block') {
          hasComment = true;
          i += matched.open.length;
          blockClose = matched.close;
          continue;
        }
        // string
        hasCode = true;
        strQuote = matched.open;
        i += matched.open.length;
      }
      // Ordinary strings don't span lines; an unterminated one ends here.
      if (strQuote !== null && strQuote !== '`') strQuote = null;
      // A blank line inside a block comment is still blank (matches cloc).
    }

    if (hasCode) code++;
    else if (hasComment) comment++;
    else blank++;

    start = nl + 1;
  }
  return { code, comment, blank };
}
