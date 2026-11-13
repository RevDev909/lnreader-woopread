# WoopRead — LNReader plugin

An unofficial [LNReader](https://github.com/LNReader/lnreader) plugin (extension) for [woopread.com](https://woopread.com/), a site hosting light novels and web novels in English (around 85 titles).

## Install in the app

1. In LNReader, go to **Settings → Repositories**.
2. Add this repository URL:

   ```
   https://raw.githubusercontent.com/RevDev909/lnreader-woopread/main/.dist/plugins.min.json
   ```

3. Install the **WoopRead** plugin from the repository.

## What it supports

- Browse novels (highest rated, or newest via the app's Latest toggle) — the full catalog, 20 per page
- Novel details: title, author, genres, status, synopsis, cover, full chapter list (embedded in the novel page)
- Chapter reading
- Search

## Development

```sh
npm install
npm test     # live integration test against woopread.com
npm run build # type-check + bundle into .dist/
```

- `src/plugin.ts` — the plugin class (LNReader host interface + resilient fetching with timeout/retries).
- `src/parsers.ts` — pure parsing helpers with no dependencies; everything testable lives here.
- `test/test.mjs` — live integration test; run with `npm test`.
- `.dist/` — built plugin bundle(s) + `plugins.min.json` (the repository index LNReader reads).

Bump `version` in `package.json`, run `npm run build`, and commit directly to the main branch.
