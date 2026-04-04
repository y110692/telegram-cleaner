# Telegram Cleaner

Local Telegram Saved Messages organizer with swipe UI and Obsidian export.

## Features

- Tinder-like one-message-at-a-time review flow
- Telegram-style message rendering for text, links, images, video, voice and files
- Save messages into tags and export them as Markdown for Obsidian
- Optional `Pro` mode for collecting candidate `message_id` values for future deletion
- Native picker for selecting `result.json` from a Telegram export

## Run locally

```powershell
cd /path/to/telegram-cleaner
python .\fav_tinder_app\server.py
```

Then open `http://127.0.0.1:8421`.

## Build

- Windows: `build_windows_exe.ps1`
- macOS: `build_macos_app.sh`
- GitHub Actions: `.github/workflows/build-app.yml`
