// WoopRead plugin for LNReader.
// Site: https://woopread.com — Next.js, server-rendered pages.
// Catalog/search: /browse?sortBy=New|Rating&page=N (20 cards/page),
// search is /search?q=<term>&page=N with the same card markup.
// Novel details: /series/<slug> — h1 title, Status/Author/Translator
// rows, genre links, description div, cover img.
// Chapter list: embedded in the novel page's RSC flight payload as
// "chapters":[{id,title,number,slug,publishDate}] — complete, with the
// rendered HTML links as fallback (those only cover the latest ~70).
// Chapter text: <div data-paragraph-index="N"> blocks, one <p> each.
//
// Rules that keep it working on old app versions (learned the hard way):
// - The bundle is compiled to ES5, but SOURCE must also avoid ES2015+
//   runtime APIs (no polyfills in the host): no String.fromCodePoint
//   (use a fromCharCode surrogate-pair helper), no Array.prototype.at,
//   no Object.hasOwn, no Promise.prototype.finally. Promise, Map, Set,
//   String.prototype.includes/startsWith are fine.
// - No native `fetch` — the host injects @libs/fetch via require.
import {
  parseCatalogCards,
  parseChapterContent,
  parseChapterListFromHtml,
  parseChapterListFromRsc,
  parseNovelDetails,
  parseTotalPages,
} from './parsers';
import type { Plugin } from './lnreader-api';

// The host app injects these via `require`, but their exact shape has varied
// across app versions, so resolve them defensively at load with fallbacks.
declare function require(name: string): any;

function loadFetchLib(): {
  fetchText?: (url: string) => Promise<string>;
  fetchApi?: (url: string) => Promise<{ text: () => Promise<string> }>;
} {
  try {
    return require('@libs/fetch') || {};
  } catch (e) {
    return {};
  }
}

function loadNovelStatus(): Record<string, string> {
  try {
    const lib = require('@libs/novelStatus');
    if (lib && lib.NovelStatus) return lib.NovelStatus;
  } catch (e) {
    // fall through to the built-in copy below
  }
  // Built-in copy of the NovelStatus string enum, so the plugin keeps
  // working even if the host does not provide @libs/novelStatus.
  return {
    Unknown: 'Unknown',
    Ongoing: 'Ongoing',
    Completed: 'Completed',
    Licensed: 'Licensed',
    PublishingFinished: 'Publishing Finished',
    Cancelled: 'Cancelled',
    OnHiatus: 'On Hiatus',
  };
}

const fetchLib = loadFetchLib();
const NovelStatus = loadNovelStatus();

// --- Resilient fetching -------------------------------------------------
// Chapter downloads are one HTTP request per chapter, so a single flaky
// request used to fail the whole chapter. This wrapper adds a timeout and
// retries transient failures with exponential backoff. It never fires
// parallel requests and never retries definite client errors, so the site
// is treated respectfully.
const FETCH_TIMEOUT_MS = 30000;
const MAX_FETCH_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    if (typeof setTimeout === 'function') setTimeout(resolve, ms);
    else resolve();
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: any = undefined;
  const timeout = new Promise<T>((_, reject) => {
    if (typeof setTimeout === 'function') {
      timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    }
  });
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(
    v => {
      clear();
      return v;
    },
    e => {
      clear();
      throw e;
    },
  );
}

interface RawFetchResult {
  status?: number;
  retryAfter?: number;
  text: string;
}

async function fetchRaw(url: string): Promise<RawFetchResult> {
  if (typeof fetchLib.fetchApi === 'function') {
    const res: any = await fetchLib.fetchApi(url);
    const status =
      res && typeof res.status === 'number' ? res.status : undefined;
    const text =
      res && typeof res.text === 'function' ? await res.text() : '';
    // Retry-After only matters on 429; parse it defensively and cap it
    // at 10s so a hostile header can't stall the retry loop.
    let retryAfter: number | undefined;
    const rawHeader =
      res && res.headers && typeof res.headers.get === 'function'
        ? res.headers.get('retry-after')
        : undefined;
    if (typeof rawHeader === 'string') {
      const parsed = parseInt(rawHeader, 10);
      if (!isNaN(parsed) && parsed >= 0) retryAfter = Math.min(parsed, 10);
    }
    return { status, retryAfter, text };
  }
  if (typeof fetchLib.fetchText === 'function') {
    return { text: await fetchLib.fetchText(url) };
  }
  throw new Error('No fetch implementation provided by the host app');
}

/** Pull an HTTP status out of errors like "HTTP 503". */
function statusFromError(e: any): number | undefined {
  const m = /HTTP (\d{3})/.exec(String((e && e.message) || e || ''));
  return m ? parseInt(m[1], 10) : undefined;
}

async function fetchText(url: string): Promise<string> {
  let lastError: any = new Error('Request failed');
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    let status: number | undefined;
    let retryAfterSecs: number | undefined;
    try {
      const res = await withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS);
      status = res.status;
      retryAfterSecs = res.retryAfter;
      if (status === 429 || (status !== undefined && status >= 500)) {
        throw new Error('Server responded with HTTP ' + status);
      }
      return res.text;
    } catch (e) {
      lastError = e;
      if (status === undefined) status = statusFromError(e);
      // Attach the status so callers (and the app) can tell a site
      // block or outage apart from a plugin bug.
      if (status !== undefined) (lastError as any).status = status;
      const msg = String((e && (e as Error).message) || e || '');
      const retryable =
        status === undefined ||
        status === 429 ||
        status >= 500 ||
        /timed out|timeout|Network|network|fetch failed/i.test(msg);
      if (!retryable || attempt === MAX_FETCH_ATTEMPTS) throw lastError;
      const waitSecs =
        status === 429 && retryAfterSecs !== undefined
          ? retryAfterSecs
          : Math.pow(2, attempt - 1);
      await sleep(1000 * waitSecs); // 1s, then 2s, or Retry-After on 429
    }
  }
  throw lastError;
}

// --- Plugin -------------------------------------------------------------

class WoopReadPlugin implements Plugin.PluginBase {
  id = 'woopread';
  name = 'WoopRead';
  icon = 'src/en/woopread/icon.png';
  site = 'https://woopread.com';
  version = '1.0.0';

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    // Latest toggle -> newest first; otherwise highest rated first.
    // Both sort values are used by the site's own links.
    const sort =
      options && options.showLatestNovels ? 'New' : 'Rating';
    const html = await fetchText(
      `${this.site}/browse?sortBy=${sort}&page=${pageNo}`,
    );
    // The site clamps out-of-range pages to the last page, so an
    // explicit end check is needed — otherwise page 6 re-serves page 5.
    if (pageNo > parseTotalPages(html)) return [];
    return parseCatalogCards(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const parts = novelPath.split('/').filter(p => p.length > 0);
    if (parts.length !== 2 || parts[0] !== 'series') {
      throw new Error('Unexpected novel path: ' + novelPath);
    }
    const slug = parts[1];
    const html = await fetchText(this.site + novelPath);
    const details = parseNovelDetails(html);
    if (!details.name) {
      throw new Error('Could not parse the novel page for ' + novelPath);
    }
    let entries = parseChapterListFromRsc(html);
    if (entries.length === 0) {
      // Fallback: the rendered list (latest ~70 + chapter 1). Partial
      // beats nothing, and a novel with genuinely no chapters yet is
      // still an error here — the site always lists chapter 1.
      entries = parseChapterListFromHtml(html, slug);
    }
    if (entries.length === 0) {
      throw new Error('No chapters found for ' + novelPath);
    }
    const chapters: Plugin.ChapterItem[] = entries.map(e => ({
      name: e.title,
      path: `/series/${slug}/${e.slug}`,
      releaseTime: e.publishDate,
      chapterNumber: e.number,
    }));
    const statusRaw = details.statusRaw.toLowerCase();
    const status =
      statusRaw === 'completed'
        ? NovelStatus.Completed
        : statusRaw === 'ongoing'
          ? NovelStatus.Ongoing
          : statusRaw === 'hiatus' || statusRaw === 'on hiatus'
            ? NovelStatus.OnHiatus
            : statusRaw === 'dropped' || statusRaw === 'cancelled'
              ? NovelStatus.Cancelled
              : NovelStatus.Unknown;
    return {
      path: novelPath,
      name: details.name,
      cover: details.cover || undefined,
      summary: details.summary || undefined,
      author: details.author || undefined,
      genres: details.genres.length ? details.genres.join(', ') : undefined,
      status,
      chapters,
    };
  }

  // The app opens a saved novel with no stored chapters through
  // fetchPage, which fails when the plugin has no parsePage. This
  // site puts the whole chapter list on one page, so parsePage just
  // returns the full list from parseNovel.
  async parsePage(
    novelPath: string,
    _pageNo: number,
  ): Promise<Plugin.ChapterItem[]> {
    const novel = await this.parseNovel(novelPath);
    return novel.chapters || [];
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchText(this.site + chapterPath);
    const content = parseChapterContent(html);
    if (!content) {
      throw new Error('Chapter content not found on the page');
    }
    // A readable-text check: a stub served as HTTP 200 (lock page,
    // empty chapter) is far shorter than any real chapter.
    const text = content.replace(/<[^>]*>/g, '').trim();
    if (text.length < 200) {
      throw new Error(
        'Chapter looks empty or locked, open it on the site to check',
      );
    }
    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const html = await fetchText(
      `${this.site}/search?q=${encodeURIComponent(searchTerm)}&page=${pageNo}`,
    );
    // No "Page N of M" marker on search pages; past the end the site
    // serves an empty grid, so an empty card list is a genuine end.
    return parseCatalogCards(html);
  }

  resolveUrl = (path: string, _isNovel?: boolean) => {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf('//') === 0) return 'https:' + path;
    return this.site + path;
  };
}

export default new WoopReadPlugin();
