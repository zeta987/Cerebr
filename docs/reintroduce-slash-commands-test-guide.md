# Reintroduce Slash Commands Test Guide

This guide documents the verification flow for the OpenSpec change
`reintroduce-slash-commands` on branch
`feat/v2.4.69-slash-commands`.

## Scope

This document is only for the slash-commands branch.

- Branch: `feat/v2.4.69-slash-commands`
- OpenSpec change: `reintroduce-slash-commands`
- In scope: slash command UI, slash query detection, slash command persistence,
  slash-command-backed send/render behavior, current upstream backup export,
  current upstream backup import, and legacy backup migration through the local
  conversion script
- Out of scope: debugger/sidebar reconnection fixes, stale iframe command
  prevention for the debugger branch, toolbar reinjection behavior, and any
  other work that belongs to `fix/v2.4.69-chrome-debugger-compat`

## Core Rules

Use these rules for every verification run.

1. Build the extension with `build-chrome.ps1` before testing.
2. Reload the unpacked extension from `dist/chrome` after each rebuild.
3. Test on a real webpage with the real injected sidebar.
4. Do not use `/index.html` as the acceptance surface for this change.
5. Validate slash input behavior through the injected sidebar on a real page.
6. Treat the current import/export feature as upstream `cerebr-backup`
   behavior.
7. Do not import `cerebr-settings-2026-04-08_131704.json` directly. Convert it
   first with the local script in `scripts/`.

## Build And Reload

### Build

Run from the repo root:

```powershell
pwsh -NoProfile -File .\build-chrome.ps1
```

Expected result:

- unpacked build output is written to `dist/chrome`

### Reload In Chrome

1. Open `chrome://extensions/?id=khckodgjpmpgpaohjeafhafmmbjlkfed`
2. Ensure Developer Mode is enabled
3. Click `重新載入`
4. Confirm the source path is the current repo `dist/chrome`

## Test Environment

Recommended real pages:

- `https://zh.wikipedia.org/wiki/Wikipedia:%E9%A6%96%E9%A1%B5`
- `https://zh.wikipedia.org/wiki/%E5%8C%88%E7%89%99%E5%88%A9%E6%80%BB%E7%90%86`
- additional Wikipedia tabs for multi-page context checks when needed

Useful debug surfaces:

- real webpage console
- real webpage network panel
- Cerebr service worker console from `chrome://extensions/?id=...`

## Real Webpage Validation Principle

This change must be validated through the injected sidebar on a real webpage.

Accepted:

- open the injected Cerebr sidebar on a real webpage
- manage slash commands from the injected sidebar settings UI
- type slash queries in the real injected message input
- send slash-command-backed prompts from the injected sidebar
- inspect real-page network requests to confirm API-visible prompt injection
- export and import data through the current upstream UI while using the real
  injected sidebar as the working surface

Rejected as final acceptance:

- testing only inside `chrome-extension://.../index.html`
- testing only by opening the extension page directly
- testing only with static DOM inspection that does not exercise the real
  content-script-injected sidebar

## Baseline Regression Check

Use this before the task-specific tests.

1. Open a real webpage, for example the Wikipedia homepage.
2. Open the injected Cerebr sidebar on that webpage.
3. Confirm the sidebar is the real injected iframe, not the standalone
   extension page.
4. Send a normal prompt such as `請總結這個網頁`.
5. Confirm Cerebr can still read the current page content.
6. Send a normal non-slash prompt again after opening and closing the settings
   menu.

Pass criteria:

- the injected sidebar still works on the real page
- normal non-slash input still sends successfully
- webpage reading behavior still works

## OpenSpec 1.1 To 1.3

`Add slash command storage helpers and shared command data loading`

`Add slash command management entry points, DOM structure, i18n keys, and style imports`

`Implement create, edit, and delete flows that persist commands in
\`cerebr_slash_commands_v1\``

### Slash Command Management Flow

Goal: prove the settings UI can create, edit, delete, and persist slash
commands.

Steps:

1. Open a real webpage with the injected sidebar.
2. Open `設定`.
3. Go to `快速命令`.
4. Create a new command.

Suggested values:

```text
命令名稱: summarize
命令簡介: 總結成三點
提示詞: 請將以下內容整理成三點重點：
```

5. Edit the command fields and confirm the new values remain visible.
6. Create a second temporary command and then delete it.
7. Close the settings page.
8. Reopen `快速命令`.

Expected pass behavior:

- created commands appear immediately in the management list
- edits remain after leaving and reopening the page
- deleted commands do not return

### Persistence Across Reopen And Reload

1. Keep at least one non-default command saved.
2. Close the sidebar.
3. Reopen the sidebar on the same real webpage.
4. Reopen `快速命令`.
5. Reload the extension from `chrome://extensions/?id=...`.
6. Reopen Cerebr on the real webpage.
7. Open `快速命令` again.

Pass criteria:

- commands remain after sidebar close and reopen
- commands remain after extension reload
- no duplicate entries appear

## OpenSpec 2.1

`Add slash query detection, IME-safe picker updates, and command chip
interactions to \`src/components/message-input.js\``

### Slash Query And Picker Flow

Goal: prove slash queries and command chip behavior do not regress normal input.

Steps:

1. On a real webpage, focus the injected message input.
2. Type `/tra` if the imported legacy command set contains `translate`, or use
   another prefix that matches an existing command.
3. Confirm the slash picker appears.
4. Use keyboard navigation if available.
5. Select a command.
6. Confirm a slash chip appears in the input.
7. Type normal trailing text after the chip.
8. Remove the trailing text so the chip is the only active content.
9. Press backspace.

Expected pass behavior:

- the picker appears only for slash queries
- selecting a command inserts a chip
- trailing text remains editable after chip insertion
- backspace removes the chip when trailing text is empty
- after chip removal, normal slash-query behavior returns

### IME-Safe Slash Query Flow

1. Use a Chinese IME on the real injected input.
2. Start composing text for a slash query.
3. Finish composition.

Pass criteria:

- the picker does not break composition
- the final composed slash query still updates matching commands
- normal IME input remains usable when no slash command is active

### Normal Input Regression Check

1. Type a plain message without `/`.
2. Send it.
3. Repeat after previously selecting and clearing a slash chip.

Pass criteria:

- no slash picker appears for plain input
- normal send behavior still works

## OpenSpec 2.2

`Update \`src/runtime/chat/chat-controller.js\` to inject slash prompts into
outgoing API-visible content while preserving display metadata`

### API-Visible Prompt Injection Flow

Goal: prove the slash command prompt is injected into the outbound request
without polluting visible user text.

Steps:

1. Open the real webpage console and network panel.
2. Select a slash command from the real injected input.
3. Send a message such as:

```text
請處理這段內容：The API failed with status 429.
```

4. Inspect the actual chat completion request body in the real-page network
   panel.

Expected pass behavior:

- the outbound request contains both the slash command prompt and the user text
- the visible user bubble does not expand into the injected full prompt
- the request still goes through the normal upstream transport path

## OpenSpec 2.3

`Update \`src/render/message/message-renderer.js\` to show slash badges and
restore visible history without exposing injected prompt text`

### Visible History And Badge Flow

Goal: prove slash-command-backed messages render cleanly and survive reload.

Steps:

1. Send at least one slash-command-backed message on a real webpage.
2. Confirm the visible user message shows a slash badge.
3. Confirm the visible content is the raw user-entered text, not the injected
   full prompt.
4. Close the sidebar.
5. Reopen the sidebar on the same real webpage.
6. Return to the same chat if needed.

Pass criteria:

- the slash badge appears on the stored user message
- the visible text remains the user-facing text only
- after reopen, the stored history still shows the slash badge

## Current Upstream Export Validation

Goal: prove the existing upstream export path includes slash-command-related
data without replacing the upstream backup feature.

Steps:

1. Keep at least one custom slash command saved.
2. Open `設定 -> 偏好設定`.
3. Use `匯出資料`.
4. Save the produced backup file.
5. Inspect the JSON file.

Expected evidence:

- the file is in `cerebr-backup` format
- slash command data is present in the canonical storage key
- no separate slash-only backup format is produced

Suggested JSON checks:

- `format === "cerebr-backup"`
- `version === 1`
- extension mode stores slash commands in
  `storage.local.cerebr_slash_commands_v1`
- web mode stores slash commands in
  `storage.indexedDb.cerebr_slash_commands_v1`

## Current Upstream Import Validation

Goal: prove the existing upstream import path restores slash-command-related
data from current-format backups.

Steps:

1. Export a current upstream backup after saving slash commands.
2. Change or delete one of the commands in the UI.
3. Import the backup through `設定 -> 偏好設定 -> 匯入資料`.
4. Reopen `快速命令`.

Pass criteria:

- the imported backup restores the expected slash command set
- unrelated settings and chats remain intact

## Legacy Backup Migration Flow

This branch intentionally uses a local conversion script instead of changing
the upstream import logic.

### Convert The Legacy Backup

Run from the repo root:

```powershell
node scripts/convert-legacy-settings-backup.mjs `
  cerebr-settings-2026-04-08_131704.json
```

Expected result:

- a converted file is created next to the legacy file
- default output name:
  `cerebr-settings-2026-04-08_131704.cerebr-backup.json`

### Import The Converted Legacy Backup

1. Open a real webpage with the injected sidebar.
2. Open `設定 -> 偏好設定`.
3. Use `匯入資料`.
4. Select the converted file:
   `cerebr-settings-2026-04-08_131704.cerebr-backup.json`
5. Confirm the import.
6. Reopen `快速命令`.

Expected pass behavior:

- import succeeds through the existing upstream UI
- legacy slash commands are restored into the canonical storage key
- representative commands such as `translate` appear with the expected label
  and prompt

Suggested spot checks:

- `translate`
- label `翻譯成英文`
- prompt `請將以下內容翻譯成英文：`

## Backward Compatibility Matrix

Use this to record what was imported and what should happen.

### Older Upstream Backup Without Slash Commands

Prepare or reuse a valid `cerebr-backup` file that does not contain
`cerebr_slash_commands_v1`.

Pass criteria:

- import succeeds
- no phantom slash commands are created
- chats and preferences remain intact

### Current Upstream Backup With Slash Commands

Use a backup produced by the current export path after creating slash commands.

Pass criteria:

- import succeeds
- slash commands are restored
- visible slash history badges remain intact after reopen

### Converted Legacy Backup

Use the script-generated
`cerebr-settings-2026-04-08_131704.cerebr-backup.json`.

Pass criteria:

- import succeeds through the existing upstream UI
- slash commands are restored
- selected config and key preferences still make sense after import

## Unrelated Data Loss Check

After every import path, verify these spot checks.

1. Existing chats still open correctly.
2. Theme, language, and font scale still look correct.
3. API configuration count still looks correct.
4. The current page can still be read by Cerebr.
5. Slash command management still allows edit and delete after import.

## What To Record In A Test Report

For each run, record:

- branch name
- build timestamp
- whether `build-chrome.ps1` completed successfully
- whether `dist/chrome` was reloaded in Chrome
- exact real webpage used
- whether the test used the injected sidebar
- relevant real-page console logs
- relevant real-page network evidence for slash prompt injection
- which backup file was imported
- whether the imported file was direct upstream or script-converted legacy
- final pass/fail judgment for `1.1`, `1.2`, `1.3`, `2.1`, `2.2`, `2.3`, and
  backup/import compatibility

## Quick Checklist

- built with `build-chrome.ps1`
- reloaded unpacked extension from `dist/chrome`
- validated on a real webpage
- did not use `/index.html` as the acceptance surface
- verified normal non-slash input still works
- verified slash picker and chip behavior
- verified slash-command-backed message rendering
- verified outbound request prompt injection on the real page
- verified current upstream export
- verified current upstream import
- converted the legacy backup with the local script before import
- verified no unintended data loss in chats, settings, or preferences
