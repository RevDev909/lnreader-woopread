// Pure parsing helpers for the WoopRead LNReader plugin.
// These functions take raw HTML and have no dependencies,
// so they can be unit-tested in plain Node.
//
// Site notes (verified live 2026-11-14):
// - Next.js site; catalog, novel and chapter pages are server-rendered,
//   so everything parses straight out of the HTML.
// - Catalog: GET /browse?sortBy=New|Rating&page=N, 20 cards per page,
//   "Page N of M" marker, 85 novels total at time of writing.
//   Search is GET /search?q=<term>&page=N, same card markup.
// - Cards: <a class="block" href="/series/<slug>"> with a cover <img>
//   (Next.js image proxy: /_next/image?url=<encoded imgcdn URL>&w=...)
//   and the title in the img alt.
// - Novel page /series/<slug>: <h1> title, Status/Type/Author/
//   Translator rows, genre links (/browse?genres=<slug>), description
//   in <div id="novel-description-content">, cover img with alt=title.
// - The full chapter list is embedded in the page's RSC flight payload
//   as "chapters":[{"id","title","number","slug","groupId","groupNumber",
//   "publishDate"}] — complete (170/170 and 370/370 on the two novels
//   checked). The visible HTML list only renders the latest 70 plus
//   chapter 1, so the RSC list is the source of truth, with the HTML
//   links as fallback.
// - Chapter text: one <div data-paragraph-index="N"> per paragraph,
//   each holding a TTS <button> and a single <p>. Story images, when
//   present, sit inside the same paragraph divs.

export interface NovelCard {
  name: string;
  path: string;
  cover?: string;
}

export interface ChapterEntry {
  slug: string;
  title: string;
  number: number;
  publishDate?: string;
}

export interface NovelDetails {
  name: string;
  cover: string;
  summary: string;
  author: string;
  translator: string;
  genres: string[];
  /** Raw status string from the page, e.g. "Ongoing" / "Completed". */
  statusRaw: string;
  /** Chapter count printed on the page, e.g. 170. */
  totalChapters: number;
}

/**
 * Upper bound on a page this plugin will parse. Site pages are orders
 * of magnitude smaller; anything bigger is a broken or hostile
 * response, and regex-scanning it would bill the reader's phone, not
 * the site. Enforced before any parsing happens.
 */
export const MAX_PAGE_CHARS = 10000000;

const HTML_ENTITY_CHARS: Record<string, string> = {
  amp: '&',
  quot: '"',
  '#39': "'",
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

/** Encode one Unicode code point without String.fromCodePoint (ES5-safe). */
function codePointToString(cp: number): string {
  if (cp < 0x10000) return String.fromCharCode(cp);
  const v = cp - 0x10000;
  return String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
}

export function decodeHtmlEntities(s: string): string {
  // Named entities first (single pass so "&amp;lt;" stays literal),
  // then numeric entities (&#8217; / &#x2019;).
  return s
    .replace(
      /&(amp|quot|#39|apos|lt|gt|nbsp|ndash|mdash|hellip|lsquo|rsquo|ldquo|rdquo);/g,
      (m, e: string) => HTML_ENTITY_CHARS[e] ?? m,
    )
    .replace(/&#(\d+);/g, (m, d: string) => {
      const cp = parseInt(d, 10);
      return cp > 0 && cp <= 0x10ffff ? codePointToString(cp) : m;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h: string) => {
      const cp = parseInt(h, 16);
      return cp > 0 && cp <= 0x10ffff ? codePointToString(cp) : m;
    });
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

function cleanText(s: string): string {
  return decodeHtmlEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

function checkSize(html: string): void {
  if (html.length > MAX_PAGE_CHARS) throw new Error('Page too large to parse');
}

/**
 * Unescape a JSON string value as it appears inside the RSC flight
 * payload (backslash-escaped quotes, \uXXXX, \n, \\, \/). Only the
 * escapes JSON defines are handled; anything else is left as-is.
 */
export function unescapeRscString(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_m, esc: string) => {
    if (esc.charAt(0) === 'u') {
      const cp = parseInt(esc.slice(1), 16);
      return !isNaN(cp) ? codePointToString(cp) : _m;
    }
    switch (esc) {
      case '"':
        return '"';
      case '\\':
        return '\\';
      case '/':
        return '/';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return _m;
    }
  });
}

/**
 * Cover URL out of a Next.js image proxy value
 * (/_next/image?url=<percent-encoded real URL>&w=256&q=75).
 * Returns the proxy URL itself, absolutized: the proxy serves a
 * resized image, and the grid shows covers at roughly that size, so
 * the resized variant loads several times faster than the original
 * on a slow connection. An already-absolute URL passes through,
 * and http:// is upgraded to https://.
 */
export function absolutizeImageUrl(src: string): string {
  let out = decodeHtmlEntities(src).trim();
  if (out.indexOf('//') === 0) return 'https:' + out;
  if (out.indexOf('http://') === 0) return 'https://' + out.slice(7);
  if (out.charAt(0) === '/') return 'https://woopread.com' + out;
  return out;
}

/**
 * Pick one entry out of a srcset: the entry whose proxy URL carries
 * the preferred width, else the first entry. Entry descriptors are
 * "256w" on list cards and "1x"/"2x" on the novel cover.
 */
export function pickSrcsetEntry(
  srcset: string,
  preferredWidth: number,
): string {
  const entries = srcset.split(',');
  for (const e of entries) {
    const url = e.trim().split(/\s+/)[0];
    if (url && url.indexOf('w=' + preferredWidth) !== -1) return url;
  }
  const first = entries.length ? entries[0].trim().split(/\s+/)[0] : '';
  return first || '';
}

/**
 * Catalog / search cards: an <a> whose class list contains `block`
 * and whose href is /series/<slug>, wrapping a cover <img> and the
 * title (an <h2> on search pages, the img alt on browse pages).
 * Cover is the smallest sensible srcset variant served by the site's
 * image proxy (256w on browse cards, first entry otherwise).
 */
export function parseCatalogCards(html: string): NovelCard[] {
  checkSize(html);
  const cards: NovelCard[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const attrs = m[1];
    const cls = /\bclass\s*=\s*"([^"]*)"/.exec(attrs);
    if (!cls || /(^|\s)block(\s|$)/.test(cls[1]) === false) continue;
    const href = /\bhref="(\/series\/[^"/]+)"/.exec(attrs);
    if (!href) continue;
    const path = href[1];
    if (seen.has(path)) continue;
    const body = m[2];
    const img = /<img\b([^>]*)>/.exec(body);
    if (!img) continue;
    let name = '';
    const h2 = /<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(body);
    if (h2) name = cleanText(h2[1]);
    if (!name) {
      const alt = /\balt="([^"]*)"/.exec(img[1]);
      if (alt) {
        name = cleanText(alt[1]);
        // Search cards use alt="Cover image for <Title>".
        if (name.indexOf('Cover image for ') === 0) {
          name = name.slice('Cover image for '.length);
        }
      }
    }
    if (!name) {
      const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(body);
      if (h3) name = cleanText(h3[1]);
    }
    if (!name) continue;
    seen.add(path);
    let cover: string | undefined;
    const srcset = /\bsrcset="([^"]+)"/i.exec(img[1]);
    if (srcset) {
      const picked = pickSrcsetEntry(srcset[1], 256);
      if (picked) cover = absolutizeImageUrl(picked);
    }
    if (!cover) {
      const src = /\bsrc="([^"]+)"/.exec(img[1]);
      if (src) cover = absolutizeImageUrl(src[1]);
    }
    cards.push({ name, path, cover });
  }
  return cards;
}

/** Total page count from the "Page N of M" marker; 1 when absent. */
export function parseTotalPages(html: string): number {
  checkSize(html);
  const m = /Page\s*<!-- -->\s*(\d+)\s*<!-- -->\s*of\s*<!-- -->\s*(\d+)/.exec(
    html,
  );
  if (m) return parseInt(m[2], 10) || 1;
  const plain = /Page\s+(\d+)\s+of\s+(\d+)/.exec(stripTags(html));
  return plain ? parseInt(plain[2], 10) || 1 : 1;
}

/** Text of a labelled row: Status/Type/Author/Translator. */
function labelledRow(html: string, label: string): string {
  // Rows render as: <span ...>Label<!-- -->:</span> <span>value</span>
  // or <span ...>Label<!-- -->:</span> <a ...>value</a>.
  const re = new RegExp(
    label + '<!-- -->:</span>\\s*<(?:span|a)\\b[^>]*>([\\s\\S]*?)</(?:span|a)>',
  );
  const m = re.exec(html);
  return m ? cleanText(m[1]) : '';
}

/**
 * Find a <div> by id and return its inner HTML, matched to its
 * closing tag by depth scan so nested markup can never truncate it.
 * Returns '' when the div is not found or unbalanced.
 */
function divInnerById(html: string, id: string): string {
  const openRe = new RegExp(
    '<div\\b[^>]*\\bid="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>',
  );
  const open = openRe.exec(html);
  if (!open) return '';
  const start = open.index + open[0].length;
  let depth = 1;
  const divRe = /<\/?div\b[^>]*>/g;
  divRe.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = divRe.exec(html)) !== null) {
    if (m[0].charAt(1) === '/') {
      depth--;
      if (depth === 0) return html.slice(start, m.index);
    } else if (m[0].slice(-2) !== '/>') {
      depth++;
    }
  }
  return '';
}

/** Novel details from the novel page. */
export function parseNovelDetails(html: string): NovelDetails {
  checkSize(html);
  let name = '';
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (h1) name = cleanText(h1[1]);
  let cover = '';
  const coverImg = /<img\b([^>]*)>/g;
  let im: RegExpExecArray | null;
  while ((im = coverImg.exec(html)) !== null) {
    const alt = /\balt="([^"]*)"/.exec(im[1]);
    if (alt && name && cleanText(alt[1]) === name) {
      const srcset = /\bsrcset="([^"]+)"/i.exec(im[1]);
      if (srcset) {
        const picked = pickSrcsetEntry(srcset[1], 640);
        if (picked) cover = absolutizeImageUrl(picked);
      }
      if (!cover) {
        const src = /\bsrc="([^"]+)"/.exec(im[1]);
        if (src) cover = absolutizeImageUrl(src[1]);
      }
      break;
    }
  }
  const descHtml = divInnerById(html, 'novel-description-content');
  const paras: string[] = [];
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(descHtml)) !== null) {
    const t = cleanText(pm[1]);
    if (t) paras.push(t);
  }
  const genres: string[] = [];
  const genreRe =
    /<a\b[^>]*href="\/browse\?genres=([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let gm: RegExpExecArray | null;
  while ((gm = genreRe.exec(html)) !== null) {
    const label = cleanText(gm[2]);
    if (label && genres.indexOf(label) === -1) genres.push(label);
  }
  const totalM = /(\d+)<!-- --> <!-- -->chapters/.exec(html);
  return {
    name,
    cover,
    summary: paras.join('\n\n'),
    author: labelledRow(html, 'Author'),
    translator: labelledRow(html, 'Translator'),
    genres,
    statusRaw: labelledRow(html, 'Status'),
    totalChapters: totalM ? parseInt(totalM[1], 10) : 0,
  };
}

/**
 * Full chapter list from the RSC flight payload embedded in the novel
 * page: "chapters":[{"id","title","number","slug",...}]. The match is
 * scoped to the chapters array itself, and each chapter object is
 * matched on its own (title, number, slug), so a title containing
 * quotes or unicode can't break the match. Slugs are NOT required to
 * start with "chapter-": a few chapters use short slugs
 * (e.g. "light-and-shadow" is chapter 16). Sorted ascending by
 * number, deduped by number (first wins).
 */
export function parseChapterListFromRsc(html: string): ChapterEntry[] {
  checkSize(html);
  // Scope to the chapters array: the payload carries other objects
  // with similar shapes, and only this array is the chapter list.
  // The array ends at the first "}]" after its opening marker —
  // chapter objects hold only scalars, so no nested object can
  // contain that sequence before the real end.
  let scoped = html;
  const marker = html.indexOf('\\"chapters\\":[{');
  if (marker >= 0) {
    const end = html.indexOf('}]', marker);
    if (end >= 0) scoped = html.slice(marker, end + 2);
    else scoped = html.slice(marker);
  }
  const entries: ChapterEntry[] = [];
  const seen = new Set<number>();
  const re =
    /\\"title\\":\\"((?:[^\\"\\\\]|\\\\.)*)\\",\\"number\\":(\d+),\\"slug\\":\\"([^\\]+)\\"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scoped)) !== null) {
    const number = parseInt(m[2], 10);
    if (isNaN(number) || seen.has(number)) continue;
    seen.add(number);
    const slug = m[3];
    if (!slug) continue;
    entries.push({
      slug,
      title: unescapeRscString(m[1]),
      number,
    });
  }
  entries.sort((a, b) => a.number - b.number);
  // Publish dates ride in the same objects, one field later; attach
  // them in a second pass keyed by slug so the main match stays
  // narrow.
  const dateRe =
    /\\"slug\\":\\"([^\\]+)\\",\\"groupId\\":[^,]*,\\"groupNumber\\":[^,]*,\\"publishDate\\":\\"([^\\]+)\\"/g;
  const dates: Record<string, string> = {};
  while ((m = dateRe.exec(scoped)) !== null) dates[m[1]] = m[2];
  for (const e of entries) {
    if (dates[e.slug]) e.publishDate = dates[e.slug];
  }
  return entries;
}

/**
 * Fallback chapter list from the rendered HTML links
 * (/series/<slug>/<chapter-slug>). The page only renders the latest
 * ~70 plus chapter 1, so this is a partial list — used only when the
 * RSC list is missing entirely. Slugs are not always "chapter-N-..."
 * (some are short, e.g. "light-and-shadow"), so the number comes
 * from the slug when it has one, else from the link text
 * ("Chapter N: ..."), else from the link's position.
 */
export function parseChapterListFromHtml(
  html: string,
  novelSlug: string,
): ChapterEntry[] {
  checkSize(html);
  const entries: ChapterEntry[] = [];
  const seen = new Set<number>();
  const re = new RegExp(
    '<a\\b[^>]*href="\\/series\\/' +
      novelSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\/([^"/]+)"[^>]*>([\\s\\S]*?)</a>',
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    const text = cleanText(m[2]);
    let number = NaN;
    const slugNum = /^chapter-(\d+)-/.exec(slug);
    if (slugNum) number = parseInt(slugNum[1], 10);
    if (isNaN(number)) {
      const textNum = /^Chapter (\d+)\b/.exec(text);
      if (textNum) number = parseInt(textNum[1], 10);
    }
    if (isNaN(number)) number = entries.length + 1;
    if (seen.has(number)) continue;
    seen.add(number);
    entries.push({
      slug,
      title: text && text !== 'Read Now' ? text : 'Chapter ' + number,
      number,
    });
  }
  entries.sort((a, b) => a.number - b.number);
  return entries;
}

/**
 * Strip executable content from chapter HTML before it reaches the
 * reader: scripts, frames, form elements, inline event handlers and
 * javascript:/vbscript:/data:text/html URLs. Tag matching is
 * quote-aware, so a `>` inside a quoted attribute value can't end
 * the match early and let attributes after it escape cleaning.
 * Attribute cleaning runs TAG BY TAG (not over the whole string), so
 * story text is never touched: `<p>Set online=true</p>` keeps its
 * words, while a real `on*` attribute inside a tag dies. Attribute
 * separators are whitespace OR slash, so `<img src="x"/onerror=...>`
 * is caught too. URL values are checked regardless of quoting
 * (double, single, or unquoted) and AFTER decoding HTML entities,
 * so `javascript&colon;...`, `&#106;...`, semicolon-less numerics,
 * and mixed-case / control-character smuggling are all caught;
 * story markup (paragraphs, images, links, tables) is kept.
 */
export function sanitizeChapterHtml(html: string): string {
  const noExecutable = html
    .replace(
      /<(script|style|noscript|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi,
      '',
    )
    .replace(
      /<(script|style|noscript|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi,
      '',
    );
  return noExecutable.replace(
    /<(?:\"[^\"]*\"|'[^']*'|[^>\"'])*>/g,
    function (tag: string) {
      return tag
        .replace(/[\s/](on\w+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/[\s/]style\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
        .replace(
          /[\s/](?:href|src)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
          function (m: string) {
            return isSafeUrlValue(m) ? m : '';
          },
        );
    },
  );
}

// Decode HTML character references the way a browser decodes an
// attribute value, then test the scheme. Numeric references (decimal
// and hex, either x case, with or without the semicolon) plus the
// scheme-relevant named references (`&colon;`, `&Tab;`, `&NewLine;`,
// `&sol;`) and the legacy semicolon-less named references; repeated so
// double-encoding can't smuggle a scheme past the check. Decoding only
// ever makes the check stricter, never looser.
function decodeEntities(value: string): string {
  let out = value;
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&#(\d+);?/g, function (_m: string, code: string) {
        const n = parseInt(code, 10);
        return !isNaN(n) && n >= 0 && n <= 0x10ffff ? String.fromCharCode(n) : _m;
      })
      .replace(/&#[xX]([0-9a-fA-F]+);?/g, function (_m: string, code: string) {
        const n = parseInt(code, 16);
        return !isNaN(n) && n >= 0 && n <= 0x10ffff ? String.fromCharCode(n) : _m;
      })
      .replace(/&colon;/g, ':')
      .replace(/&Tab;/g, '\t')
      .replace(/&NewLine;/g, '\n')
      .replace(/&sol;/g, '/')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp(?![a-zA-Z0-9=])/g, '&')
      .replace(/&lt(?![a-zA-Z0-9=])/g, '<')
      .replace(/&gt(?![a-zA-Z0-9=])/g, '>')
      .replace(/&quot(?![a-zA-Z0-9=])/g, '"');
    if (next === out) break;
    out = next;
  }
  return out;
}

// Read the attribute value from immediately after `=`: a quoted value
// is everything up to its matching quote, an unquoted value runs to the
// next whitespace or `>`. Never search for quotes anywhere in the
// match — for `href=javascript:alert('x')` the value is the whole
// `javascript:alert('x')`, not `'x'`.
function attrValue(attr: string): string {
  const eq = attr.indexOf('=');
  if (eq < 0) return '';
  const rest = attr.slice(eq + 1).replace(/^\s+/, '');
  if (rest.charAt(0) === '"') {
    const end = rest.indexOf('"', 1);
    return end < 0 ? rest.slice(1) : rest.slice(1, end);
  }
  if (rest.charAt(0) === "'") {
    const end = rest.indexOf("'", 1);
    return end < 0 ? rest.slice(1) : rest.slice(1, end);
  }
  const m = /^[^\s>]+/.exec(rest);
  return m ? m[0] : '';
}

function isSafeUrlValue(attr: string): boolean {
  const clean = decodeEntities(attrValue(attr))
    .split('')
    .filter(function (ch: string) {
      const code = ch.charCodeAt(0);
      return code > 32 && code !== 127;
    })
    .join('')
    .toLowerCase();
  // Scheme allowlist, not a blacklist: after control-character
  // stripping, a value with a scheme must be http(s); anything else
  // (javascript:, vbscript:, data:, blob:, or a scheme the parser
  // would repair from a smuggled form) is dropped. Scheme-less values
  // are relative URLs and pass; the caller resolves them against the
  // site.
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(clean);
  if (scheme) {
    return scheme[1] === 'http' || scheme[1] === 'https';
  }
  return true;
}

/**
 * Chapter body: one <p> per <div data-paragraph-index="N">, plus any
 * <img> inside those divs (illustration-only paragraphs have no <p>
 * at all, and a <p>-only extractor would silently empty them).
 * The per-paragraph TTS <button> is a sibling of the <p> and is never
 * collected. Returns '' when no paragraph divs are found.
 */
export function parseChapterContent(html: string): string {
  checkSize(html);
  const clean = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const parts: string[] = [];
  // Match each paragraph div to its own closing tag by depth scan:
  // a lazy `.*?</div>` would stop at a nested div inside the
  // paragraph (an image wrapper, say) and drop the text after it.
  const openRe = /<div\b[^>]*data-paragraph-index="\d+"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(clean)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    const divRe = /<\/?div\b[^>]*>/g;
    divRe.lastIndex = start;
    let dm: RegExpExecArray | null;
    let end = -1;
    while ((dm = divRe.exec(clean)) !== null) {
      if (dm[0].charAt(1) === '/') {
        depth--;
        if (depth === 0) {
          end = dm.index;
          break;
        }
      } else if (dm[0].slice(-2) !== '/>') {
        depth++;
      }
    }
    if (end < 0) continue;
    const body = clean.slice(start, end);
    const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
    let pm: RegExpExecArray | null;
    let found = false;
    while ((pm = pRe.exec(body)) !== null) {
      parts.push('<p>' + pm[1].trim() + '</p>');
      found = true;
    }
    const imgRe = /<img\b[^>]*>/g;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(body)) !== null) {
      parts.push(im[0]);
      found = true;
    }
    if (!found) {
      const text = cleanText(body);
      if (text) parts.push('<p>' + text + '</p>');
    }
  }
  if (parts.length === 0) return '';
  return sanitizeChapterHtml(parts.join('\n'));
}
