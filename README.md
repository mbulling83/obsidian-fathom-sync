# Fathom Meeting Sync

An [Obsidian](https://obsidian.md) plugin that pulls your [Fathom](https://fathom.video) meeting notes directly into your vault — summaries, action items, attendees, and optional transcripts.

## Features

- **Sync all recordings** — bulk sync every Fathom meeting to a folder in your vault
- **Pull a specific meeting** — fuzzy-search your meetings and choose how to insert them
- **Insert as bullet points** — drop a meeting summary inline into any note
- **Insert + link** — insert bullet points and create a full linked note in one step
- **Auto-sync** — background sync on a schedule (15 min → 4 hours)
- **Sync on startup** — automatically sync when Obsidian opens

## Installation

### Via BRAT (recommended for beta users)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from Obsidian's Community Plugins
2. Open BRAT settings → **Add Beta Plugin**
3. Paste: `https://github.com/mbulling83/obsidian-fathom-sync`
4. Click **Add Plugin**, then enable **Fathom Meeting Sync** in Community Plugins

### Manual installation

1. Download the latest release from the [Releases page](https://github.com/mbulling83/obsidian-fathom-sync/releases)
2. Extract and copy the three files (`main.js`, `manifest.json`, `styles.css`) into:
   ```
   <your vault>/.obsidian/plugins/obsidian-fathom-sync/
   ```
3. Reload Obsidian and enable **Fathom Meeting Sync** in Settings → Community Plugins

### Build from source

```bash
git clone https://github.com/mbulling83/obsidian-fathom-sync
cd obsidian-fathom-sync
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugins folder as above.

## Setup

1. Go to **Settings → Fathom Meeting Sync**
2. Paste your Fathom API key (get it from [app.fathom.video → Settings → API](https://app.fathom.video/settings/api))
3. Click **Test connection** — the button turns green when successful
4. Set your **Sync folder** (default: `Meetings/Fathom`)

## Usage

### Commands (Command Palette)

| Command | What it does |
|---|---|
| **Sync all recordings to vault** | Fetches all meetings from Fathom and creates/updates notes in your sync folder |
| **Pull a specific meeting…** | Opens an action picker, then a fuzzy meeting search |
| **Insert meeting as bullet points** | Directly opens the meeting picker to insert into the current note |

The **mic icon** in the ribbon also opens the meeting picker.

### Insert modes

When pulling a specific meeting you'll be asked how to add it:

- **Insert as bullet points** — inserts a summary block at your cursor in the current note
- **Create full meeting note** — creates a standalone `.md` file in your sync folder
- **Insert bullet points + link to full note** — does both and adds a `[[wikilink]]`

### Auto-sync

Set an interval in settings and the plugin will sync silently in the background. You'll only see a notice if new meetings were found.

## Settings reference

| Setting | Default | Description |
|---|---|---|
| API key | — | Your Fathom API key |
| Sync folder | `Meetings/Fathom` | Vault folder for synced notes |
| Filename template | `{{date}} {{title}}` | Variables: `{{date}}`, `{{time}}`, `{{title}}` |
| Sync on startup | Off | Sync automatically when Obsidian opens |
| Auto-sync interval | Off | Background sync every 15m / 30m / 1h / 2h / 4h |
| Include transcript | Off | Add full transcript to notes (makes them much longer) |
| Include action items | On | Add Fathom's extracted action items as checkboxes |
| Open note after sync | Off | Auto-open the note after pulling a specific meeting |

## Note format

Each synced meeting note includes YAML frontmatter (`date`, `time`, `duration`, `attendees`, `fathom_id`, `fathom_url`) followed by Attendees, Summary, and Action Items sections. Transcripts are included if enabled.
