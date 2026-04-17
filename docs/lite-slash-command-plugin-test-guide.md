# Lite Slash Command Plugin Test Guide

This guide covers manual verification for the developer-mode local lite slash command plugin.

## Preconditions

- Cerebr is running a build that supports developer-mode local script plugins.
- The plugin package is available at `statics/dev-plugins/lite-slash-commands/`.
- The package contains `plugin.json`, `shell.js`, and `commands.json`.
- Developer mode is enabled.

Use a command catalog with at least two commands and one alias so fuzzy matching and navigation are easy to observe.

Suggested sample entries:

```json
[
  {
    "name": "translate",
    "label": "Translate",
    "description": "Translate into Traditional Chinese.",
    "template": "Translate the following text into Traditional Chinese:",
    "aliases": ["tr"]
  },
  {
    "name": "summarize",
    "label": "Summarize",
    "description": "Summarize with action items.",
    "template": "Summarize the following content and list action items."
  }
]
```

## Manual Verification Checklist

### 1. Install through developer mode

Steps:

1. Open `偏好设置 -> 开发者模式` and enable developer mode.
2. Open `设置 -> 插件 -> 开发者`.
3. Import `/statics/dev-plugins/lite-slash-commands/plugin.json`.
4. Confirm the plugin stays enabled after import.

Expected result:

- The plugin is listed as a local developer plugin.
- No manifest or shell runtime error is shown during import.

### 2. Refresh picks up catalog changes

Steps:

1. Edit `commands.json` and change the label or description of one command.
2. Use the refresh action for the local plugin.
3. Focus the message input and type `/`.

Expected result:

- The picker reflects the updated catalog content after refresh.
- The new label or description appears without a full app rebuild.

### 3. Slash query opens the picker

Steps:

1. Focus the message input.
2. Type `/`.

Expected result:

- The picker opens above the input container.
- Every packaged command is visible when the query is empty.

### 4. Fuzzy matching filters results

Steps:

1. Type `/tra`.
2. Observe the picker contents.
3. Replace the query with `/tr`.

Expected result:

- Commands whose `name`, `label`, or `aliases` contain the query remain visible.
- `translate` stays visible for `/tra`.
- Alias-based matching still works for `/tr`.

### 5. Keyboard navigation works while the picker is open

Steps:

1. Type `/`.
2. Press `ArrowDown` until the second command is highlighted.
3. Press `ArrowUp` to move back.

Expected result:

- The active row changes with each key press.
- Navigation wraps across the available matches.
- The input stays focused while the active row changes.

### 6. Enter commits the highlighted command

Steps:

1. Type `/summarize`.
2. Press `Enter`.

Expected result:

- The picker closes.
- The draft is rewritten to the selected command template.
- The visible draft no longer starts with the slash query.

### 7. Escape dismisses the picker

Steps:

1. Type `/translate`.
2. Press `Escape`.

Expected result:

- The picker closes immediately.
- The draft text remains unchanged.
- The plugin does not clear the input.

### 8. Trailing text expands below the template

Steps:

1. Type `/translate Keep product names in English.`
2. Press `Enter` or click the matching picker row.

Expected result:

- The draft becomes the selected template.
- A blank line is inserted after the template.
- The trailing text appears after the blank line.

Expected expanded draft shape:

```text
Translate the following text into Traditional Chinese:

Keep product names in English.
```

### 9. Pointer selection commits without blurring the input

Steps:

1. Type `/`.
2. Click a picker row.

Expected result:

- The command is applied.
- The picker closes.
- The editor remains ready for continued typing in the rewritten draft.

### 10. Normal send uses the visible expanded draft

Steps:

1. Expand a command into the draft.
2. Press the normal send shortcut or click the normal send control.
3. Inspect the sent user message content.

Expected result:

- The sent message matches the visible expanded draft text.
- No slash chip, hidden prompt badge, or transport-only slash metadata is required for success.

### A. Seed Slimming Acceptance

Steps:

1. Open DevTools inside Cerebr; run `chrome.storage.local.clear()` to simulate a new user.
2. Reload the extension.
3. Focus the message input and type `/`.

Expected result:

- The picker lists exactly four commands in order: `/解釋`, `/翻譯`, `/摘要`, `/程式碼解釋` (for `zh_TW`).
- No trace of the 17-command example library unless it was imported manually.
- Clicking **Reset defaults** in the settings modal restores the same 4-command set.

### B. `{{lang}}` Placeholder Expansion

Steps:

1. Type `/翻譯`, press Enter to expand the template.
2. Observe the draft.
3. Switch Cerebr UI language to English (`偏好設置 → 語言 → English`).
4. Type `/translate` and press Enter again.
5. Switch to `简体中文` and run `/翻译` once more.

Expected result:

- Each expansion replaces `{{lang}}` with the natural-language label corresponding to the current Cerebr locale: `台灣正體中文`, `English`, or `简体中文`.
- Variants like `{{ lang }}` or `{{LANG}}` that a user pastes into their own prompt are also replaced correctly.
- Prompts without any `{{lang}}` token are expanded verbatim (backward-compatible).

### C. Plugin-Local i18n UI

Steps:

1. Set Cerebr UI language to `auto` and confirm the modal reflects the system locale.
2. Switch to `zh_TW`, `zh_CN`, `en` in sequence; each switch should redraw the modal labels, buttons, status messages, and picker empty state within a second, without reloading Cerebr.
3. Edit `/解釋` (rename to `/mine`, save) and switch the locale again.

Expected result:

- All modal chrome — toolbar buttons, field labels, dialog titles, ⋯ menu items, status messages — appears in the selected language.
- The 4 seed commands `/explain`, `/translate`, `/summarize`, `/code-explain` rename automatically when locale changes (until the user edits them).
- The user-edited `/mine` command stays `/mine` regardless of locale switches.

### D. Two-View UX

Steps:

1. Open the settings modal and verify it starts on the list view.
2. Click a card → enters edit view; focus lands on the name input.
3. Type anything in any field → a red dot appears next to the `/name` header indicator.
4. Press `Esc` or click **← 回清單** → returns to list view; the red dot is gone; draft was discarded.
5. Click **➕ 新增命令** → edit view with placeholder text; dirty dot visible; the list view did not gain a placeholder entry.
6. Press **← 回清單** without saving → the new draft is discarded silently; the list view is unchanged.
7. Click **➕ 新增命令** again → edit, press **儲存變更** → new card appears in the list view and edit view persists in non-dirty state.
8. Click ⋯ → menu appears with **重設預設值 / 匯出 JSON / 匯入 JSON**. Click outside to dismiss.
9. Click ⋯ → **匯入 JSON** opens the transfer panel; paste an envelope and click **匯入**.

Expected result:

- Transitions are immediate, no layout shift.
- Dirty indicator correctly reflects the unsaved state.
- Discarding a draft never pollutes the list.
- Overflow menu closes on outside click and on `Esc`.

### E. CSS / Visual Checks

Steps:

1. Inspect the `/` button next to the input. Measure its right margin relative to the input container edge.
2. Open the modal at the default Cerebr sidebar width (around 380px).
3. Resize the browser window down to 420px wide.
4. Toggle dark/light mode in Cerebr.

Expected result:

- The `/` button has at least 8px breathing space on the right edge (not clipped).
- The modal fits within the sidebar without horizontal scroll and feels comfortably narrow.
- At widths ≤480px, the modal pins to the screen edges (full width, no rounded outer corners).
- Contrast, borders, and hover states look correct in both color schemes.

## Optional Regression Checks

- Type plain text that does not start with `/` and confirm the picker never opens.
- Remove the slash query so the draft no longer begins with `/` and confirm the picker closes.
- If the draft contains image tags, confirm the picker does not activate for slash queries in that state.
