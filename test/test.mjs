// Live parser tests for the WoopRead plugin.
// Runs against the real site; every check must pass.
import {
  parseCatalogCards,
  parseChapterContent,
  parseChapterListFromHtml,
  parseChapterListFromRsc,
  parseNovelDetails,
  parseTotalPages,
} from './parsers.bundle.mjs';

const SITE = 'https://woopread.com';
let failures = 0;

function check(label, ok, extra) {
  if (ok) {
    console.log('  PASS', label);
  } else {
    failures++;
    console.log('  FAIL', label, extra !== undefined ? '-> ' + extra : '');
  }
}

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.text();
}

const NOVEL = '/series/the-star-painting-genius';
const NOVEL2 = '/series/the-ruined-world-was-mistaken-for-a-game';

console.log('catalog page 1 (New):');
const browse1 = await get(SITE + '/browse?sortBy=New&page=1');
const page1 = parseCatalogCards(browse1);
check('20 cards', page1.length === 20, page1.length);
check(
  'cards have name/path/cover',
  page1.every(c => c.name && c.path.startsWith('/series/') && c.cover),
);
check(
  'covers are the site image proxy, resized variant',
  page1.every(
    c =>
      c.cover &&
      c.cover.startsWith('https://woopread.com/_next/image?url=') &&
      c.cover.includes('imgcdn.woopread.com'),
  ),
  page1.map(c => c.cover).join(','),
);
const totalPages = parseTotalPages(browse1);
check('total pages >= 2', totalPages >= 2, totalPages);

console.log('catalog page 2 differs:');
const page2 = parseCatalogCards(
  await get(SITE + '/browse?sortBy=New&page=2'),
);
check('20 cards on page 2', page2.length === 20, page2.length);
check(
  'page 2 first card != page 1 first card',
  page2.length && page1.length && page2[0].path !== page1[0].path,
);
check(
  'no overlap page 1 / page 2',
  page2.every(c => !page1.some(d => d.path === c.path)),
);

console.log('catalog past the end:');
const pastEnd = parseCatalogCards(
  await get(SITE + '/browse?sortBy=New&page=' + (totalPages + 1)),
);
check('empty past last page', pastEnd.length === 0, pastEnd.length);

console.log('catalog Rating sort differs from New:');
const rated = parseCatalogCards(
  await get(SITE + '/browse?sortBy=Rating&page=1'),
);
check('20 cards on Rating page 1', rated.length === 20, rated.length);
check(
  'Rating first card != New first card',
  rated.length && page1.length && rated[0].path !== page1[0].path,
  rated[0] && rated[0].path + ' vs ' + page1[0].path,
);

console.log('search "genius":');
const searchHtml = await get(SITE + '/search?q=genius&page=1');
const search = parseCatalogCards(searchHtml);
check('search returns results', search.length > 0, search.length);
check(
  'search finds The Star-Painting Genius',
  search.some(c => c.path === NOVEL),
  search.map(c => c.path).join(','),
);
const search2 = parseCatalogCards(
  await get(SITE + '/search?q=genius&page=2'),
);
check(
  'search page 2 adds no duplicates of page 1',
  search2.every(c => !search.some(d => d.path === c.path)),
  search2.map(c => c.path).join(','),
);

console.log('novel details (The Star-Painting Genius):');
const novelHtml = await get(SITE + NOVEL);
const details = parseNovelDetails(novelHtml);
check('name', details.name === 'The Star-Painting Genius', details.name);
check('status Ongoing', details.statusRaw === 'Ongoing', details.statusRaw);
check('summary present', details.summary.length > 10, details.summary.length);
check(
  'summary is the description text',
  details.summary.includes('A heaven-sent talent rests in those hands.'),
  details.summary,
);
check('genres include Comedy', details.genres.includes('Comedy'), details.genres.join(','));
check('author present', details.author.length > 0, details.author);
check(
  'cover is the site image proxy URL',
  details.cover.startsWith('https://woopread.com/_next/image?url=') &&
    details.cover.includes('imgcdn.woopread.com'),
  details.cover,
);
check('total chapters 170', details.totalChapters === 170, details.totalChapters);

console.log('chapter list RSC (The Star-Painting Genius):');
const chapters = parseChapterListFromRsc(novelHtml);
check('170 chapters', chapters.length === 170, chapters.length);
check(
  'count matches page total',
  chapters.length === details.totalChapters,
  chapters.length + ' vs ' + details.totalChapters,
);
check(
  'ascending, first chapter-1, last chapter-170',
  chapters.length > 0 &&
    chapters[0].slug === 'chapter-1-the-shadow-and-the-swirl' &&
    chapters[chapters.length - 1].slug ===
      'chapter-170-a-hassle-free-deal',
  chapters.length
    ? chapters[0].slug + ' .. ' + chapters[chapters.length - 1].slug
    : 'empty',
);
check(
  'all entries have titles',
  chapters.every(c => c.title && c.title.startsWith('Chapter ')),
);
check(
  'entries have publish dates',
  chapters.every(c => c.publishDate),
);
check(
  'short slugs kept: chapter 16 is "light-and-shadow"',
  chapters.some(c => c.number === 16 && c.slug === 'light-and-shadow'),
  chapters
    .filter(c => c.number >= 15 && c.number <= 17)
    .map(c => c.number + ':' + c.slug)
    .join(','),
);

console.log('chapter list RSC (second novel, 370 chapters):');
const novel2Html = await get(SITE + NOVEL2);
const details2 = parseNovelDetails(novel2Html);
const chapters2 = parseChapterListFromRsc(novel2Html);
check(
  'count matches page total',
  chapters2.length === details2.totalChapters,
  chapters2.length + ' vs ' + details2.totalChapters,
);

console.log('chapter list HTML fallback:');
const fallback = parseChapterListFromHtml(novelHtml, 'the-star-painting-genius');
check('fallback finds chapters', fallback.length > 0, fallback.length);
check(
  'fallback includes chapter 170',
  fallback.some(c => c.number === 170),
);

console.log('chapter content (ch.1):');
const content = parseChapterContent(
  await get(SITE + NOVEL + '/chapter-1-the-shadow-and-the-swirl'),
);
check('content long', content.length > 5000, content.length);
check(
  'content has story text',
  content.includes('I remember the first day a picture spoke to me.'),
);
check('content is paragraphs', content.startsWith('<p>'));
check('no scripts', !content.includes('<script'));
check('no TTS buttons', !content.includes('Play from paragraph'));
check('no loading placeholder', !content.includes('Loading content'));
check('no site chrome', !content.includes('Patreon') && !content.includes('Discord'));

console.log('chapter content (ch.16, short slug):');
const content16 = parseChapterContent(
  await get(SITE + NOVEL + '/light-and-shadow'),
);
check('ch.16 long', content16.length > 1000, content16.length);
check('ch.16 is paragraphs', content16.startsWith('<p>'));

console.log('chapter content (ch.170, latest):');
const content170 = parseChapterContent(
  await get(SITE + NOVEL + '/chapter-170-a-hassle-free-deal'),
);
check('ch.170 long', content170.length > 1000, content170.length);
check('ch.170 no scripts', !content170.includes('<script'));

console.log(
  failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED',
);
process.exit(failures === 0 ? 0 : 1);
