# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # watch mode (esbuild, no type check)
npm run build        # type-check then production build → main.js
```

After building, copy the output to the vault and reload:

```bash
cp main.js "/Users/markbulling/Documents/lepus albus/.obsidian/plugins/obsidian-fathom-sync/main.js"
obsidian plugin:reload id=fathom-sync
```

Check for runtime errors after reloading:

```bash
obsidian dev:errors
obsidian dev:console level=error
```

There are no automated tests.

## Architecture

The plugin has four source files in `src/`:

**`fathom-api.ts`** — all Fathom API interaction. Contains the `FathomClient` class (uses Obsidian's `requestUrl`, never native `fetch`), all TypeScript interfaces matching the real API schema, and pure formatter functions (`meetingToFullNote`, `meetingToBulletPoints`, `formatDuration`, etc.). The API base is `https://api.fathom.ai/external/v1`. Auth is via `X-Api-Key` header. `requestUrl` is called with `throw: false` so non-2xx responses are caught manually and wrapped as `FathomApiError`.

**`main.ts`** — plugin entry point. Registers commands, ribbon icon, startup sync, and the auto-sync interval. The sync counter uses a discriminated `"created" | "updated" | "skipped"` return rather than null/non-null. Two separate methods handle note writing: `syncMeetingToNote` (bulk sync — skips existing files) and `writeNoteFile` (user-triggered — always overwrites). The raw `setInterval` ID is stored separately from `registerInterval` so `clearAutoSync` can cancel it correctly.

**`settings.ts`** — `FathomSyncSettings` interface, defaults, and the settings tab UI. The "Test connection" button turns green (`fathom-btn-connected` CSS class) on success rather than just showing a notice. Calling `plugin.rescheduleAutoSync()` after the interval dropdown changes is required to apply the new schedule immediately.

**`meeting-picker-modal.ts`** — two `FuzzySuggestModal` subclasses: `MeetingPickerModal` (fuzzy-searches meetings by title + date + attendee names) and `ActionPickerModal` (choose insert mode). `LoadingModal` is a persistent `Notice` (timeout=0) used as a loading indicator — always call `.close()` in both the success and catch paths.

## Key conventions

- YAML frontmatter string values must go through `yamlQuote()` (defined in `fathom-api.ts`) to handle colons, brackets, and other special characters in meeting titles and names.
- Time formatting in filenames uses `getHours()/getMinutes()` directly — never `toLocaleTimeString`, which is locale-dependent.
- The built output is `main.js` (gitignored). Only `src/`, `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, and `styles.css` are committed.
