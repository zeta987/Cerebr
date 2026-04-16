# Lite Slash Commands Plugin v0.4.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the Lite Slash Commands dev-plugin by slimming the default seed to 4 core commands, integrating plugin-local i18n with a `{{lang}}` placeholder, redesigning the settings modal as a list↔edit two-view flow, and fixing the clipped settings button.

**Architecture:** Extract pure helpers for placeholder expansion and i18n loading, ship per-locale JSONs inside the plugin folder, reshape the settings modal into a single-column state machine driven by a `data-view` attribute, guard backward compatibility by leaving existing user envelopes untouched, and preserve the original 17-command set in an importable `example-library.json`.

**Tech Stack:** Vanilla JS ES modules, Cerebr plugin runtime (shell scope), `chrome.storage.local` with `localStorage` fallback, zero-dependency `node --experimental-vm-modules` script for pure helper self-tests.

**Spec:** `docs/superpowers/specs/2026-04-17-lite-slash-commands-optimization-design.md`

**Branch:** `feat/lite-slash-commands-v0.4.0` (already created — do **NOT** commit to main)

---

## File Structure

### New Files

- `statics/dev-plugins/lite-slash-commands/example-library.json` — original 17-command library, user-importable via Modal ⋯ menu
- `statics/dev-plugins/lite-slash-commands/seed-prompts.json` — 4 core prompts with `{{lang}}` tokens, shared across locales
- `statics/dev-plugins/lite-slash-commands/locales/zh_TW.json` — Traditional Chinese UI strings + seed metadata + `language_label`
- `statics/dev-plugins/lite-slash-commands/locales/zh_CN.json` — Simplified Chinese variant
- `statics/dev-plugins/lite-slash-commands/locales/en.json` — English variant
- `statics/dev-plugins/lite-slash-commands/helpers/language-placeholders.js` — pure `expandLanguagePlaceholders` function
- `statics/dev-plugins/lite-slash-commands/helpers/plugin-i18n.js` — `loadPluginLocale`, `t`, `getLocaleLabel`, `getSeedCommandMeta`, `getActiveLocale`, `onLocaleChanged`
- `statics/dev-plugins/lite-slash-commands/helpers/__selftest__.mjs` — zero-dependency Node self-test script

### Modified Files

- `statics/dev-plugins/lite-slash-commands/plugin.json` — version bump 0.3.0 → 0.4.0
- `statics/dev-plugins/lite-slash-commands/shell.js` — major refactor (i18n wiring, seed slim, seedKey, two-view modal, draft state, overflow menu, CSS diff)
- `docs/lite-slash-command-plugin-test-guide.md` — append verification sections A–E

### Deleted Files

- `statics/dev-plugins/lite-slash-commands/default-commands.legacy.json` — deleted in Task 6 after `shell.js` stops referencing it (content preserved in `example-library.json`)

---

## Task 1: Bootstrap data files (example-library, seed-prompts, locales)

**Files:**
- Create: `statics/dev-plugins/lite-slash-commands/example-library.json`
- Create: `statics/dev-plugins/lite-slash-commands/seed-prompts.json`
- Create: `statics/dev-plugins/lite-slash-commands/locales/{zh_TW,zh_CN,en}.json`

Data-only task. `shell.js` and the legacy JSON stay untouched so the plugin keeps running while new files are added.

- [ ] **Step 1: Copy the legacy 17-command JSON into `example-library.json`**

```bash
cp statics/dev-plugins/lite-slash-commands/default-commands.legacy.json \
   statics/dev-plugins/lite-slash-commands/example-library.json
```

- [ ] **Step 2: Create `seed-prompts.json`**

Create file `statics/dev-plugins/lite-slash-commands/seed-prompts.json` with this exact content:

```json
{
  "explain": "You are an expert teacher skilled at breaking down complex topics for beginners. Based on the content provided in the system prompt, produce a clear and accessible explanation in {{lang}}. Identify and highlight the key points, using plain language and concrete examples where appropriate to ensure comprehension.",
  "translate": "Translate the content provided in the system prompt into {{lang}}. Output only the translated text with no additional commentary, explanation, or formatting beyond what exists in the original.",
  "summarize": "You are a professional summarizer. Based on the content provided in the system prompt, produce a concise summary in {{lang}} within 3-5 sentences. Focus on the core arguments, key findings, and essential context while omitting minor details and examples.",
  "code_explain": "You are a senior software engineer and system architect. Analyze the code provided in the system prompt and respond in {{lang}}, structured as follows:\n\n1. Walk through the code step by step in logical execution order, explaining what each block or function does and the design rationale behind its structure, naming conventions, or pattern choices.\n2. Identify potential issues including but not limited to: bugs, edge cases, performance bottlenecks, security vulnerabilities, and maintainability concerns. For each issue, briefly explain the risk and suggest an improvement direction.\n3. Conclude with a concise statement of the code's overall purpose and architectural role within a larger system, if inferable."
}
```

- [ ] **Step 3: Create `locales/` directory**

```bash
mkdir -p statics/dev-plugins/lite-slash-commands/locales
```

- [ ] **Step 4: Create `locales/zh_TW.json`**

```json
{
  "language_label": "台灣正體中文",
  "ui": {
    "settings_title": "Lite Slash Commands",
    "settings_subtitle": "在這裡管理自己的斜線命令。點卡片即可編輯，按「新增命令」從空白開始。",
    "button_aria_label": "管理斜線命令",
    "list_empty": "還沒有斜線命令，點「新增命令」開始建立。",
    "create_command": "新增命令",
    "more_menu": "更多",
    "reset_defaults": "重設預設值",
    "export_json": "匯出 JSON",
    "import_json": "匯入 JSON",
    "import_note": "匯出格式是外掛私有 envelope；匯入時也接受單純的命令陣列。",
    "import_action": "匯入",
    "export_action": "匯出",
    "back_to_list": "← 回清單",
    "close": "關閉",
    "save_changes": "儲存變更",
    "delete_command": "刪除命令",
    "move_up": "上移",
    "move_down": "下移",
    "dirty_indicator_tooltip": "有未儲存變更",
    "field_name_label": "命令名稱",
    "field_name_placeholder": "例如：翻譯",
    "field_label_label": "顯示標題",
    "field_label_placeholder": "例如：翻譯成目標語言",
    "field_aliases_label": "別名",
    "field_aliases_placeholder": "用逗號或換行分隔",
    "field_aliases_note": "別名只用於搜尋與輸入匹配，不會另外顯示成主要命令名。",
    "field_description_label": "描述",
    "field_description_placeholder": "簡短說明這個命令會做什麼",
    "field_prompt_label": "提示詞內容",
    "field_prompt_placeholder": "真正展開到草稿區的提示詞",
    "status_saved": "已儲存 /$1。",
    "status_deleted": "已刪除 /$1。",
    "status_reordered": "已更新 /$1 的排序。",
    "status_reset_done": "已重設為預設值。",
    "status_imported": "已匯入 $1 筆斜線命令。",
    "status_count": "目前共有 $1 筆斜線命令。",
    "status_no_move": "這筆命令不能再移動了。",
    "error_name_required": "命令名稱不能留白。",
    "error_prompt_required": "提示詞內容不能留白。",
    "error_json_required": "請先在文字框貼上 JSON。",
    "error_json_parse": "JSON 解析失敗：$1",
    "error_nothing_to_delete": "目前沒有可刪除的命令。",
    "error_nothing_to_save": "目前沒有可儲存的命令。",
    "picker_empty": "目前沒有符合的斜線命令，點右側 / 按鈕管理命令。",
    "blank_command_name": "新命令 $1",
    "blank_command_prompt": "請在這裡輸入提示詞。"
  },
  "seed_commands": {
    "explain":      { "name": "解釋",       "label": "解釋",       "description": "" },
    "translate":    { "name": "翻譯",       "label": "翻譯",       "description": "" },
    "summarize":    { "name": "摘要",       "label": "摘要",       "description": "" },
    "code_explain": { "name": "程式碼解釋", "label": "程式碼解釋", "description": "" }
  }
}
```

- [ ] **Step 5: Create `locales/zh_CN.json`**

```json
{
  "language_label": "简体中文",
  "ui": {
    "settings_title": "Lite Slash Commands",
    "settings_subtitle": "在这里管理自己的斜线命令。点卡片即可编辑，按「新增命令」从空白开始。",
    "button_aria_label": "管理斜线命令",
    "list_empty": "还没有斜线命令，点「新增命令」开始建立。",
    "create_command": "新增命令",
    "more_menu": "更多",
    "reset_defaults": "重置默认值",
    "export_json": "导出 JSON",
    "import_json": "导入 JSON",
    "import_note": "导出格式是插件私有 envelope；导入时也接受单纯的命令数组。",
    "import_action": "导入",
    "export_action": "导出",
    "back_to_list": "← 回列表",
    "close": "关闭",
    "save_changes": "保存更改",
    "delete_command": "删除命令",
    "move_up": "上移",
    "move_down": "下移",
    "dirty_indicator_tooltip": "有未保存更改",
    "field_name_label": "命令名称",
    "field_name_placeholder": "例如：翻译",
    "field_label_label": "显示标题",
    "field_label_placeholder": "例如：翻译成目标语言",
    "field_aliases_label": "别名",
    "field_aliases_placeholder": "用逗号或换行分隔",
    "field_aliases_note": "别名仅用于搜索与输入匹配，不会另外显示成主要命令名。",
    "field_description_label": "描述",
    "field_description_placeholder": "简短说明这个命令会做什么",
    "field_prompt_label": "提示词内容",
    "field_prompt_placeholder": "真正展开到草稿区的提示词",
    "status_saved": "已保存 /$1。",
    "status_deleted": "已删除 /$1。",
    "status_reordered": "已更新 /$1 的排序。",
    "status_reset_done": "已重置为默认值。",
    "status_imported": "已导入 $1 条斜线命令。",
    "status_count": "目前共有 $1 条斜线命令。",
    "status_no_move": "这条命令不能再移动了。",
    "error_name_required": "命令名称不能留空。",
    "error_prompt_required": "提示词内容不能留空。",
    "error_json_required": "请先在文本框粘贴 JSON。",
    "error_json_parse": "JSON 解析失败：$1",
    "error_nothing_to_delete": "目前没有可删除的命令。",
    "error_nothing_to_save": "目前没有可保存的命令。",
    "picker_empty": "目前没有符合的斜线命令，点右侧 / 按钮管理命令。",
    "blank_command_name": "新命令 $1",
    "blank_command_prompt": "请在这里输入提示词。"
  },
  "seed_commands": {
    "explain":      { "name": "解释",     "label": "解释",     "description": "" },
    "translate":    { "name": "翻译",     "label": "翻译",     "description": "" },
    "summarize":    { "name": "摘要",     "label": "摘要",     "description": "" },
    "code_explain": { "name": "代码解释", "label": "代码解释", "description": "" }
  }
}
```

- [ ] **Step 6: Create `locales/en.json`**

```json
{
  "language_label": "English",
  "ui": {
    "settings_title": "Lite Slash Commands",
    "settings_subtitle": "Manage your slash commands here. Tap a card to edit, or press \"New command\" to start from scratch.",
    "button_aria_label": "Manage slash commands",
    "list_empty": "No slash commands yet — press \"New command\" to add one.",
    "create_command": "New command",
    "more_menu": "More",
    "reset_defaults": "Reset defaults",
    "export_json": "Export JSON",
    "import_json": "Import JSON",
    "import_note": "Export uses the plugin's private envelope format; a plain command array is also accepted on import.",
    "import_action": "Import",
    "export_action": "Export",
    "back_to_list": "← Back to list",
    "close": "Close",
    "save_changes": "Save changes",
    "delete_command": "Delete command",
    "move_up": "Move up",
    "move_down": "Move down",
    "dirty_indicator_tooltip": "Unsaved changes",
    "field_name_label": "Command name",
    "field_name_placeholder": "e.g. translate",
    "field_label_label": "Display title",
    "field_label_placeholder": "e.g. Translate into target language",
    "field_aliases_label": "Aliases",
    "field_aliases_placeholder": "Separate with commas or newlines",
    "field_aliases_note": "Aliases are only used for search and input matching; they are not shown as primary command names.",
    "field_description_label": "Description",
    "field_description_placeholder": "Short summary of what this command does",
    "field_prompt_label": "Prompt",
    "field_prompt_placeholder": "The actual prompt that replaces the draft when the command is selected",
    "status_saved": "Saved /$1.",
    "status_deleted": "Deleted /$1.",
    "status_reordered": "Reordered /$1.",
    "status_reset_done": "Reset to default commands.",
    "status_imported": "Imported $1 slash commands.",
    "status_count": "You currently have $1 slash commands.",
    "status_no_move": "This command cannot move further.",
    "error_name_required": "Command name cannot be empty.",
    "error_prompt_required": "Prompt content cannot be empty.",
    "error_json_required": "Paste the JSON into the text area first.",
    "error_json_parse": "JSON parse error: $1",
    "error_nothing_to_delete": "Nothing to delete right now.",
    "error_nothing_to_save": "Nothing to save right now.",
    "picker_empty": "No matching slash commands — press the / button on the right to manage them.",
    "blank_command_name": "New command $1",
    "blank_command_prompt": "Write your prompt here."
  },
  "seed_commands": {
    "explain":      { "name": "explain",      "label": "Explain",            "description": "" },
    "translate":    { "name": "translate",    "label": "Translate",          "description": "" },
    "summarize":    { "name": "summarize",    "label": "Summarize",          "description": "" },
    "code_explain": { "name": "code-explain", "label": "Explain this code",  "description": "" }
  }
}
```

- [ ] **Step 7: Validate all JSON files parse**

```bash
node -e "
const fs = require('fs');
['example-library.json','seed-prompts.json','locales/zh_TW.json','locales/zh_CN.json','locales/en.json'].forEach(p => {
  JSON.parse(fs.readFileSync('statics/dev-plugins/lite-slash-commands/'+p, 'utf8'));
  console.log('OK', p);
});
"
```
Expected: 5 `OK <path>` lines with no thrown errors.

- [ ] **Step 8: Commit**

```bash
git add statics/dev-plugins/lite-slash-commands/example-library.json \
        statics/dev-plugins/lite-slash-commands/seed-prompts.json \
        statics/dev-plugins/lite-slash-commands/locales/
git commit -m "feat(lite-slash): add example library, seed prompts, and plugin-local locale JSON"
```

---

## Task 2: Build pure helpers (`language-placeholders.js`, `plugin-i18n.js`) with Node self-test

**Files:**
- Create: `statics/dev-plugins/lite-slash-commands/helpers/language-placeholders.js`
- Create: `statics/dev-plugins/lite-slash-commands/helpers/plugin-i18n.js`
- Create: `statics/dev-plugins/lite-slash-commands/helpers/__selftest__.mjs`

Pure helpers come first so we can TDD them independently from the DOM.

- [ ] **Step 1: Create `helpers/` directory**

```bash
mkdir -p statics/dev-plugins/lite-slash-commands/helpers
```

- [ ] **Step 2: Write failing self-test skeleton**

Create `statics/dev-plugins/lite-slash-commands/helpers/__selftest__.mjs`:

```js
// Zero-dependency Node self-test. Run with:
//   node --experimental-vm-modules ./statics/dev-plugins/lite-slash-commands/helpers/__selftest__.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expandLanguagePlaceholders } from './language-placeholders.js';

// --- language-placeholders.js ---
assert.equal(expandLanguagePlaceholders('Reply in {{lang}}.', '台灣正體中文'), 'Reply in 台灣正體中文.');
assert.equal(expandLanguagePlaceholders('Answer in {{ lang }}.', 'English'), 'Answer in English.');
assert.equal(expandLanguagePlaceholders('Use {{LANG}} + {{lang}}.', 'xx'), 'Use xx + xx.');
assert.equal(expandLanguagePlaceholders('No tokens here.', 'en'), 'No tokens here.');
assert.equal(expandLanguagePlaceholders('', 'en'), '');
assert.equal(expandLanguagePlaceholders('{{lang}}', undefined), 'English');
assert.equal(expandLanguagePlaceholders(null, '中文'), '');
console.log('language-placeholders.js: 7 assertions passed');

// --- locales/*.json schema ---
const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'locales');
const REQUIRED_UI_KEYS = [
    'settings_title','list_empty','create_command','back_to_list',
    'save_changes','delete_command','field_name_label','field_prompt_label',
    'status_saved','error_name_required','error_prompt_required','picker_empty',
    'export_json','import_json','reset_defaults','more_menu',
    'status_imported','status_count','error_json_parse',
];
const REQUIRED_SEED_KEYS = ['explain','translate','summarize','code_explain'];

for (const locale of ['zh_TW','zh_CN','en']) {
    const raw = readFileSync(join(localesDir, `${locale}.json`), 'utf8');
    const map = JSON.parse(raw);
    assert.equal(typeof map.language_label, 'string', `${locale}: language_label must be string`);
    assert.ok(map.language_label.trim().length > 0, `${locale}: language_label must be non-empty`);
    for (const key of REQUIRED_UI_KEYS) {
        assert.equal(typeof map?.ui?.[key], 'string', `${locale}: ui.${key} must be string`);
    }
    for (const seedKey of REQUIRED_SEED_KEYS) {
        const meta = map?.seed_commands?.[seedKey];
        assert.equal(typeof meta?.name, 'string', `${locale}: seed_commands.${seedKey}.name must be string`);
        assert.equal(typeof meta?.label, 'string', `${locale}: seed_commands.${seedKey}.label must be string`);
        assert.equal(typeof meta?.description, 'string', `${locale}: seed_commands.${seedKey}.description must be string`);
    }
    console.log(`locale ${locale}: schema OK`);
}

// --- seed-prompts.json schema ---
const seedPromptsPath = join(here, '..', 'seed-prompts.json');
const seedPrompts = JSON.parse(readFileSync(seedPromptsPath, 'utf8'));
for (const key of REQUIRED_SEED_KEYS) {
    assert.equal(typeof seedPrompts[key], 'string', `seed-prompts.json: ${key} must be string`);
    assert.ok(seedPrompts[key].includes('{{lang}}'), `seed-prompts.json: ${key} must contain {{lang}} token`);
}
console.log('seed-prompts.json: schema OK');

console.log('\nAll self-tests passed ✓');
```

- [ ] **Step 3: Run self-test — expect module-not-found failure**

```bash
node --experimental-vm-modules \
  ./statics/dev-plugins/lite-slash-commands/helpers/__selftest__.mjs
```
Expected: error mentioning `Cannot find module '.../helpers/language-placeholders.js'`. Good — that's the red phase.

- [ ] **Step 4: Implement `language-placeholders.js`**

Create `statics/dev-plugins/lite-slash-commands/helpers/language-placeholders.js`:

```js
// Pure helper: expand {{lang}} placeholders to a natural-language label.
// No side effects; imported by shell.js at draft-expansion time.

const LANG_TOKEN_REGEX = /\{\{\s*lang\s*\}\}/gi;

export function expandLanguagePlaceholders(text, localeLabel) {
    const input = String(text ?? '');
    const replacement = String(localeLabel ?? 'English');
    return input.replace(LANG_TOKEN_REGEX, replacement);
}
```

- [ ] **Step 5: Run self-test — expect green phase**

```bash
node --experimental-vm-modules \
  ./statics/dev-plugins/lite-slash-commands/helpers/__selftest__.mjs
```
Expected:
```
language-placeholders.js: 7 assertions passed
locale zh_TW: schema OK
locale zh_CN: schema OK
locale en: schema OK
seed-prompts.json: schema OK

All self-tests passed ✓
```

- [ ] **Step 6: Implement `plugin-i18n.js`**

Create `statics/dev-plugins/lite-slash-commands/helpers/plugin-i18n.js`:

```js
// Plugin-local i18n loader and resolver.
// Wraps locales/<code>.json fetching, t() lookup with $N substitutions,
// and seed command metadata access. Depends on Cerebr's main i18n module
// only for the onLocaleChanged event stream.

import { onLocaleChanged as onCerebrLocaleChanged } from '/src/utils/i18n.js';

const FALLBACK_LOCALE = 'en';
const SUPPORTED_LOCALES = new Set(['en', 'zh_TW', 'zh_CN']);

let activeLocale = FALLBACK_LOCALE;
let activeMap = { ui: {}, seed_commands: {}, language_label: 'English' };
let fallbackMap = activeMap;

function normalizeLocaleCode(code) {
    const raw = String(code ?? '').trim();
    if (!raw) return FALLBACK_LOCALE;
    if (SUPPORTED_LOCALES.has(raw)) return raw;
    const lower = raw.toLowerCase();
    if (lower.startsWith('zh')) {
        if (lower.includes('hant') || lower.endsWith('-tw') || lower.endsWith('_tw')
            || lower.endsWith('-hk') || lower.endsWith('-mo')) {
            return 'zh_TW';
        }
        return 'zh_CN';
    }
    return FALLBACK_LOCALE;
}

function readByDotPath(map, dotKey) {
    return String(dotKey).split('.').reduce(
        (node, segment) => (node && typeof node === 'object' ? node[segment] : undefined),
        map,
    );
}

function applySubstitutions(template, substitutions) {
    const list = Array.isArray(substitutions) ? substitutions : [substitutions];
    if (!list.length) return template;
    let out = template;
    list.forEach((value, index) => {
        out = out.split(`$${index + 1}`).join(String(value ?? ''));
    });
    return out;
}

async function fetchLocaleJson(baseUrl, localeCode, revision) {
    const url = new URL(`../locales/${localeCode}.json`, baseUrl);
    if (revision) url.searchParams.set('cerebr_plugin_rev', revision);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load locale ${localeCode}: ${response.status}`);
    }
    return response.json();
}

export async function loadPluginLocale(rawCode, baseUrl, revision = '') {
    const target = normalizeLocaleCode(rawCode);

    try {
        fallbackMap = await fetchLocaleJson(baseUrl, FALLBACK_LOCALE, revision);
    } catch (error) {
        console.warn('[Lite Slash Commands] fallback locale load failed', error);
        fallbackMap = { ui: {}, seed_commands: {}, language_label: 'English' };
    }

    if (target === FALLBACK_LOCALE) {
        activeMap = fallbackMap;
        activeLocale = FALLBACK_LOCALE;
        return activeMap;
    }

    try {
        activeMap = await fetchLocaleJson(baseUrl, target, revision);
        activeLocale = target;
    } catch (error) {
        console.warn('[Lite Slash Commands] locale load failed, falling back to en', error);
        activeMap = fallbackMap;
        activeLocale = FALLBACK_LOCALE;
    }

    return activeMap;
}

export function t(key, substitutions = []) {
    const activeHit = readByDotPath(activeMap, key);
    const fallbackHit = readByDotPath(fallbackMap, key);
    const template = typeof activeHit === 'string'
        ? activeHit
        : (typeof fallbackHit === 'string' ? fallbackHit : key);
    return applySubstitutions(template, substitutions);
}

export function getLocaleLabel() {
    return typeof activeMap?.language_label === 'string'
        ? activeMap.language_label
        : 'English';
}

export function getSeedCommandMeta(seedKey) {
    const meta = activeMap?.seed_commands?.[seedKey];
    if (meta && typeof meta === 'object') return meta;
    const fallback = fallbackMap?.seed_commands?.[seedKey];
    return fallback && typeof fallback === 'object' ? fallback : null;
}

export function getActiveLocale() {
    return activeLocale;
}

export function onLocaleChanged(handler) {
    if (typeof handler !== 'function') return () => {};
    return onCerebrLocaleChanged(handler);
}
```

- [ ] **Step 7: Re-run self-test — should still pass**

```bash
node --experimental-vm-modules \
  ./statics/dev-plugins/lite-slash-commands/helpers/__selftest__.mjs
```
Expected: same green output as Step 5 (the self-test does not exercise `plugin-i18n.js` directly because it needs browser `fetch` + the `/src/utils/i18n.js` module).

- [ ] **Step 8: Commit**

```bash
git add statics/dev-plugins/lite-slash-commands/helpers/
git commit -m "feat(lite-slash): add language-placeholders + plugin-i18n helpers with Node self-test"
```

---

## Task 3: Wire i18n + seed slim + {{lang}} expansion into `shell.js`

**Files:**
- Modify: `statics/dev-plugins/lite-slash-commands/shell.js`

This is the first substantive `shell.js` refactor. Grep-anchors are provided so you can find each edit site precisely.

- [ ] **Step 1: Add new imports at the top**

Locate the existing line `import { definePlugin } from '../../../src/plugin/shared/define-plugin.js';` (should be line 1). Immediately after it, add:

```js
import {
    loadPluginLocale,
    t,
    getLocaleLabel,
    getSeedCommandMeta,
    getActiveLocale as getPluginActiveLocale,
    onLocaleChanged,
} from './helpers/plugin-i18n.js';
import { expandLanguagePlaceholders } from './helpers/language-placeholders.js';
import { getActiveLocale as getCerebrLocale } from '/src/utils/i18n.js';
```

- [ ] **Step 2: Bump seed constants and add SEED_ORDER**

Locate:
```js
const DEFAULT_SEED_VERSION = '2026-04-08-backup-seed-1';
```
Replace with:
```js
const DEFAULT_SEED_VERSION = '2026-04-17-minimal-seed-1';
const SEED_ORDER = ['explain', 'translate', 'summarize', 'code_explain'];
```

- [ ] **Step 3: Extend `normalizeStoredCommandEntry` to carry `seedKey`**

Grep anchor: `function normalizeStoredCommandEntry(entry) {`. Replace the entire function body with:

```js
function normalizeStoredCommandEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const name = normalizeString(entry.name);
    const prompt = String(entry.prompt ?? '').trim();

    if (!name || !prompt) {
        return null;
    }

    const now = Date.now();
    const seedKey = normalizeString(entry.seedKey);

    return decorateCommand({
        id: normalizeString(entry.id, createCommandId()),
        name,
        label: normalizeString(entry.label, name),
        prompt,
        description: normalizeString(entry.description),
        aliases: normalizeAliasList(entry.aliases),
        createdAt: normalizeTimestamp(entry.createdAt, now),
        updatedAt: normalizeTimestamp(entry.updatedAt, now),
        seedKey: seedKey || undefined,
    });
}
```

- [ ] **Step 4: Extend `serializeEnvelope` to write `seedKey` only when present**

Grep anchor: `function serializeEnvelope(envelope) {`. Replace its `commands` map block with:

```js
        commands: Array.isArray(envelope?.commands)
            ? envelope.commands.map((command) => {
                const out = {
                    id: command.id,
                    name: command.name,
                    label: command.label,
                    prompt: command.prompt,
                    description: command.description,
                    aliases: [...normalizeAliasList(command.aliases)],
                    createdAt: command.createdAt,
                    updatedAt: command.updatedAt,
                };
                if (command.seedKey) out.seedKey = command.seedKey;
                return out;
            })
            : [],
```

- [ ] **Step 5: Delete `createSeedEnvelope` and `normalizeLegacyCommandEntry`**

Grep anchors: `function createSeedEnvelope(` and `function normalizeLegacyCommandEntry(`. Delete both entire function definitions — they are replaced in the next step.

- [ ] **Step 6: Replace `loadDefaultLegacyCommands` with `loadSeedPrompts` + seed builder**

Grep anchor: `async function loadDefaultLegacyCommands() {`. Replace the entire function (including its doc comment if any) with:

```js
async function loadSeedPrompts() {
    const moduleUrl = new URL(import.meta.url);
    const revision = normalizeString(moduleUrl.searchParams.get('cerebr_plugin_rev'));
    const seedUrl = new URL('./seed-prompts.json', import.meta.url);
    if (revision) seedUrl.searchParams.set('cerebr_plugin_rev', revision);

    const response = await fetch(seedUrl, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load seed prompts: ${response.status}`);
    }
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
        throw new Error('seed-prompts.json must be a JSON object');
    }
    return payload;
}

function buildSeedEnvelopeFromLocale(seedPrompts, currentEnvelope = null) {
    const initializedAt = currentEnvelope?.meta?.initializedAt
        ? normalizeTimestamp(currentEnvelope.meta.initializedAt, Date.now())
        : Date.now();
    const now = Date.now();

    const commands = SEED_ORDER.map((seedKey) => {
        const meta = getSeedCommandMeta(seedKey);
        const prompt = String(seedPrompts?.[seedKey] ?? '').trim();
        if (!meta || !prompt) return null;
        return decorateCommand({
            id: createCommandId(),
            name: meta.name,
            label: meta.label || meta.name,
            prompt,
            description: meta.description || '',
            aliases: [],
            createdAt: now,
            updatedAt: now,
            seedKey,
        });
    }).filter(Boolean);

    if (!commands.length) {
        throw new Error('Seed generation produced zero commands — check locale JSON integrity');
    }

    return {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        seedVersion: DEFAULT_SEED_VERSION,
        commands,
        meta: { initializedAt, lastResetAt: now },
    };
}
```

- [ ] **Step 7: Rewrite `loadInitialEnvelope` to use the new seed pipeline**

Grep anchor: `async function loadInitialEnvelope() {`. Replace the entire function with:

```js
async function loadInitialEnvelope() {
    const storedEnvelope = await readStoredEnvelope();
    if (storedEnvelope && typeof storedEnvelope === 'object' && Array.isArray(storedEnvelope.commands)) {
        return normalizeEnvelope(storedEnvelope, {
            fallbackInitializedAt: Date.now(),
        });
    }

    const seedPrompts = await loadSeedPrompts();
    const seededEnvelope = buildSeedEnvelopeFromLocale(seedPrompts);
    await writeStoredEnvelope(seededEnvelope);
    return seededEnvelope;
}
```

- [ ] **Step 8: Rewrite `buildExpandedDraft` to expand `{{lang}}`**

Grep anchor: `function buildExpandedDraft(command, trailingText) {`. Replace with:

```js
function buildExpandedDraft(command, trailingText) {
    const localeLabel = getLocaleLabel();
    const prompt = expandLanguagePlaceholders(String(command?.prompt ?? '').trimEnd(), localeLabel);
    const tail = String(trailingText ?? '').trimStart();

    if (!tail) {
        return prompt;
    }

    return `${prompt}\n\n${tail}`;
}
```

- [ ] **Step 9: Add `refreshSeedCommandsForLocale` helper after `buildExpandedDraft`**

Immediately after `buildExpandedDraft` insert:

```js
// Re-applies the current locale's seed_commands metadata to any commands
// that still carry a seedKey (i.e. unmodified by the user). Returns true
// when at least one command was updated.
function refreshSeedCommandsForLocale(envelope) {
    if (!envelope?.commands?.length) return false;
    let changed = false;
    const nextCommands = envelope.commands.map((command) => {
        if (!command.seedKey) return command;
        const meta = getSeedCommandMeta(command.seedKey);
        if (!meta) return command;
        if (command.name === meta.name
            && command.label === (meta.label || meta.name)
            && command.description === (meta.description || '')) {
            return command;
        }
        changed = true;
        return decorateCommand({
            ...command,
            name: meta.name,
            label: meta.label || meta.name,
            description: meta.description || '',
            updatedAt: Date.now(),
        });
    });
    envelope.commands = nextCommands;
    return changed;
}
```

- [ ] **Step 10: Update `resetDefaults` to use the new seed**

Grep anchor: `async function resetDefaults() {`. Replace with:

```js
async function resetDefaults() {
    const seedPrompts = await loadSeedPrompts();
    const nextEnvelope = buildSeedEnvelopeFromLocale(seedPrompts, runtimeState.commandEnvelope);
    runtimeState.selectedCommandId = nextEnvelope.commands[0]?.id || '';

    await persistEnvelope(nextEnvelope);
    if (runtimeState.chrome?.transfer) {
        runtimeState.chrome.transfer.value = '';
    }
    renderModal();
    refreshSlashStateFromEditor();
    setStatus(t('ui.status_reset_done'), 'success');
}
```

- [ ] **Step 11: Update `saveCurrentCommand` to clear `seedKey` on user edits**

Grep anchor: `async function saveCurrentCommand() {`. Locate the block that builds `updatedCommand` via `decorateCommand({ ...selected, ... })` and make sure the spread explicitly drops seedKey. Replace the `updatedCommand` construction with:

```js
    const now = Date.now();
    const updatedCommand = decorateCommand({
        ...selected,
        seedKey: undefined,  // user edits opt out of seed locale sync
        name,
        label: normalizeString(chrome.label.value, name),
        aliases: normalizeAliasList(chrome.aliases.value),
        description: normalizeString(chrome.description.value),
        prompt,
        updatedAt: now,
    });
```

Also replace the status message line:
```js
    setStatus(t('ui.status_saved', [updatedCommand.name]), 'success');
```

- [ ] **Step 12: Bootstrap i18n in `setup` and subscribe to locale changes**

Grep anchor: `async setup(api) {`. Inside `setup`, replace the block from `runtimeState.editor = api.editor;` down through `runtimeState.commandEnvelope = await loadInitialEnvelope();` with:

```js
        runtimeState.editor = api.editor;
        runtimeState.messageInput = messageInput;
        runtimeState.inputContainer = inputContainer;

        // 1. Load plugin locale so seed generation has seed_commands meta.
        const moduleUrl = new URL(import.meta.url);
        const revision = normalizeString(moduleUrl.searchParams.get('cerebr_plugin_rev'));
        await loadPluginLocale(getCerebrLocale?.() || 'en', import.meta.url, revision);

        // 2. Subscribe to Cerebr locale changes to keep UI and seed commands in sync.
        const unsubscribeLocale = onLocaleChanged(async ({ locale } = {}) => {
            await loadPluginLocale(locale || 'en', import.meta.url, revision);
            const changed = refreshSeedCommandsForLocale(runtimeState.commandEnvelope);
            if (changed) {
                await writeStoredEnvelope(runtimeState.commandEnvelope);
            }
            applyLocaleToDom();
            renderModal();
            refreshSlashStateFromEditor();
        });
        runtimeState.eventCleanups.push(unsubscribeLocale);

        // 3. Load envelope (seeds if absent).
        runtimeState.commandEnvelope = await loadInitialEnvelope();
```

Note: `applyLocaleToDom` is declared in Task 4 — it's forward-referenced here. If you run the plugin between Task 3 and Task 4, comment out the `applyLocaleToDom();` call temporarily.

- [ ] **Step 13: Update `picker` empty-state string to use `t()`**

Grep anchor: `empty.textContent = '目前沒有符合的斜線命令，請點右側 / 按鈕管理命令。';`. Replace with:

```js
        empty.textContent = t('ui.picker_empty');
```

- [ ] **Step 14: Manual smoke test**

1. Open Cerebr in a Chrome profile where the plugin has **never** run before (clean `chrome.storage.local`).
2. Reload Cerebr; open DevTools console to confirm no errors from the plugin.
3. Focus the message input, type `/`. Verify the picker lists exactly 4 commands in order: `/解釋`, `/翻譯`, `/摘要`, `/程式碼解釋` (assuming zh_TW locale).
4. Select `/翻譯` + press Enter. Verify draft contains "...into 台灣正體中文..." (no literal `{{lang}}` visible).
5. In Cerebr settings, switch language to English. Reload. Verify picker now shows `/explain`, `/translate`, `/summarize`, `/code-explain`. Select `/translate` and confirm draft contains "...into English...".
6. Click **Reset defaults** in the modal — confirm the command list refreshes to 4 entries matching current locale.

- [ ] **Step 15: Commit**

```bash
git add statics/dev-plugins/lite-slash-commands/shell.js
git commit -m "feat(lite-slash): slim seed to four commands with i18n-aware loading and {{lang}} expansion"
```

---

## Task 4: Replace hardcoded UI strings in `shell.js` with `t()` calls

**Files:**
- Modify: `statics/dev-plugins/lite-slash-commands/shell.js`

All user-visible strings in `shell.js` move to `t('ui.xxx')`. Add a small `applyLocaleToDom()` helper that re-applies text to static modal chrome after a locale change.

- [ ] **Step 1: Replace static Modal HTML strings with data-i18n anchors**

Grep anchor: `function createSettingsModal(documentRef) {`. Inside the returned `innerHTML` template, replace hardcoded Chinese strings with `data-i18n` markers so `applyLocaleToDom` can refresh them. Update the template exactly to:

```html
<div class="cerebr-lite-slash-modal__backdrop" data-modal-close="true"></div>
<section class="cerebr-lite-slash-modal__panel" role="dialog" aria-modal="true" aria-label="Lite slash command editor">
    <header class="cerebr-lite-slash-modal__header">
        <div>
            <div class="cerebr-lite-slash-modal__title" data-i18n="ui.settings_title">Lite Slash Commands</div>
            <div class="cerebr-lite-slash-modal__subtitle" data-i18n="ui.settings_subtitle"></div>
        </div>
        <button type="button" class="cerebr-lite-slash-modal__close" data-modal-close="true" data-i18n-attr="aria-label:ui.close" aria-label="Close slash command editor">✕</button>
    </header>
    <div class="cerebr-lite-slash-modal__body">
        <aside class="cerebr-lite-slash-modal__sidebar">
            <div class="cerebr-lite-slash-modal__toolbar">
                <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--primary" data-action="create" data-i18n="ui.create_command"></button>
                <button type="button" class="cerebr-lite-slash-modal__button" data-action="reset" data-i18n="ui.reset_defaults"></button>
            </div>
            <div class="cerebr-lite-slash-modal__command-list" data-command-list></div>
            <div class="cerebr-lite-slash-modal__empty" data-empty-state hidden data-i18n="ui.list_empty"></div>
        </aside>
        <main class="cerebr-lite-slash-modal__editor">
            <div class="cerebr-lite-slash-modal__status" data-status></div>
            <div class="cerebr-lite-slash-modal__field-grid">
                <div class="cerebr-lite-slash-modal__field-group">
                    <label for="cerebr-lite-slash-name" data-i18n="ui.field_name_label"></label>
                    <input id="cerebr-lite-slash-name" type="text" data-field="name" data-i18n-attr="placeholder:ui.field_name_placeholder">
                </div>
                <div class="cerebr-lite-slash-modal__field-group">
                    <label for="cerebr-lite-slash-label" data-i18n="ui.field_label_label"></label>
                    <input id="cerebr-lite-slash-label" type="text" data-field="label" data-i18n-attr="placeholder:ui.field_label_placeholder">
                </div>
                <div class="cerebr-lite-slash-modal__field-group">
                    <label for="cerebr-lite-slash-aliases" data-i18n="ui.field_aliases_label"></label>
                    <textarea id="cerebr-lite-slash-aliases" data-field="aliases" rows="2" data-i18n-attr="placeholder:ui.field_aliases_placeholder"></textarea>
                    <div class="cerebr-lite-slash-modal__field-note" data-i18n="ui.field_aliases_note"></div>
                </div>
                <div class="cerebr-lite-slash-modal__field-group">
                    <label for="cerebr-lite-slash-description" data-i18n="ui.field_description_label"></label>
                    <textarea id="cerebr-lite-slash-description" data-field="description" rows="2" data-i18n-attr="placeholder:ui.field_description_placeholder"></textarea>
                </div>
                <div class="cerebr-lite-slash-modal__field-group">
                    <label for="cerebr-lite-slash-prompt" data-i18n="ui.field_prompt_label"></label>
                    <textarea id="cerebr-lite-slash-prompt" data-field="prompt" rows="9" data-i18n-attr="placeholder:ui.field_prompt_placeholder"></textarea>
                </div>
                <div class="cerebr-lite-slash-modal__meta" data-meta></div>
                <div class="cerebr-lite-slash-modal__actions">
                    <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--primary" data-action="save" data-i18n="ui.save_changes"></button>
                    <button type="button" class="cerebr-lite-slash-modal__button" data-action="move-up" data-i18n="ui.move_up"></button>
                    <button type="button" class="cerebr-lite-slash-modal__button" data-action="move-down" data-i18n="ui.move_down"></button>
                    <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--danger" data-action="delete" data-i18n="ui.delete_command"></button>
                    <button type="button" class="cerebr-lite-slash-modal__button" data-modal-close="true" data-i18n="ui.close"></button>
                </div>
            </div>
            <section class="cerebr-lite-slash-modal__section">
                <div class="cerebr-lite-slash-modal__section-title" data-i18n="ui.import_json"></div>
                <div class="cerebr-lite-slash-modal__field-note" data-i18n="ui.import_note"></div>
                <div class="cerebr-lite-slash-modal__transfer-actions">
                    <button type="button" class="cerebr-lite-slash-modal__button" data-action="export" data-i18n="ui.export_json"></button>
                    <button type="button" class="cerebr-lite-slash-modal__button" data-action="import" data-i18n="ui.import_json"></button>
                </div>
                <textarea class="cerebr-lite-slash-modal__transfer" data-transfer rows="8"></textarea>
            </section>
        </main>
    </div>
</section>
```

This keeps the existing DOM skeleton — Task 5 will restructure the layout.

- [ ] **Step 2: Add `applyLocaleToDom` helper**

Insert this helper right after `function buildCommandPreview(command) {` block:

```js
// Re-applies current locale strings to static modal chrome.
// Called once after modal creation and again on every locale change.
function applyLocaleToDom() {
    const modal = runtimeState.chrome?.modal;
    if (!modal) return;

    modal.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        el.textContent = t(key);
    });

    modal.querySelectorAll('[data-i18n-attr]').forEach((el) => {
        const bindings = String(el.getAttribute('data-i18n-attr') || '')
            .split(';')
            .map((pair) => pair.trim())
            .filter(Boolean)
            .map((pair) => {
                const idx = pair.indexOf(':');
                if (idx === -1) return null;
                return { attr: pair.slice(0, idx).trim(), key: pair.slice(idx + 1).trim() };
            })
            .filter(Boolean);
        bindings.forEach(({ attr, key }) => {
            const value = t(key);
            if (value) el.setAttribute(attr, value);
        });
    });

    if (runtimeState.settingsButton) {
        runtimeState.settingsButton.setAttribute('aria-label', t('ui.button_aria_label'));
        runtimeState.settingsButton.title = t('ui.button_aria_label');
    }
}
```

- [ ] **Step 3: Call `applyLocaleToDom` after modal creation in `setup`**

Grep anchor: `runtimeState.chrome = createSettingsModal(documentRef);`. Immediately after this line add:

```js
        applyLocaleToDom();
```

- [ ] **Step 4: Replace remaining hardcoded strings in non-HTML code paths**

Search `shell.js` for every `'` or `"`-quoted Chinese literal and replace with the matching `t('ui.xxx')` key. The complete mapping table is:

| Existing literal (search verbatim) | Replacement |
|---|---|
| `'目前沒有可編輯的斜線命令。'` | `t('ui.list_empty')` |
| `'目前沒有符合的斜線命令，請點右側 / 按鈕管理命令。'` | `t('ui.picker_empty')` |
| ``\`ID: ${selected.id}  ·  建立於 ${formatTimestamp(selected.createdAt)}  ·  更新於 ${formatTimestamp(selected.updatedAt)}\``` | keep template literal but replace the fixed Chinese with English terms, OR introduce a new i18n key `ui.command_meta` shaped like `"ID: $1  ·  Created $2  ·  Updated $3"` and use `t('ui.command_meta', [selected.id, formatTimestamp(selected.createdAt), formatTimestamp(selected.updatedAt)])`. Prefer the key-based approach and add `ui.command_meta` to all three locale JSONs (`"ID: $1  ·  建立於 $2  ·  更新於 $3"` for zh_TW, `"ID: $1  ·  创建于 $2  ·  更新于 $3"` for zh_CN, `"ID: $1  ·  Created $2  ·  Updated $3"` for en). |
| `` `目前共有 ${getCommands().length} 筆斜線命令。` `` | `t('ui.status_count', [getCommands().length])` |
| `'命令名稱不能留白。'` | `t('ui.error_name_required')` |
| `'提示詞內容不能留白。'` | `t('ui.error_prompt_required')` |
| `` `已儲存 /${updatedCommand.name}。` `` | `t('ui.status_saved', [updatedCommand.name])` |
| `` `已新增 /${nextCommand.name}。` `` | Remove — Task 5 replaces createCommand with draft-mode flow. |
| `'目前沒有可刪除的命令。'` | `t('ui.error_nothing_to_delete')` |
| `` `已刪除 /${selected.name}。` `` | `t('ui.status_deleted', [selected.name])` |
| `'目前沒有可移動的命令。'` | `t('ui.error_nothing_to_delete')` (reuse) |
| `'這筆命令不能再移動了。'` | `t('ui.status_no_move')` |
| `` `已更新 /${item.name} 的排序。` `` | `t('ui.status_reordered', [item.name])` |
| `'已重設為備份預設值。'` | already replaced with `t('ui.status_reset_done')` in Task 3 |
| `'已匯出目前 JSON，並複製到剪貼簿。'` | extend `en.json` etc. with `ui.status_exported_copied` `"Exported JSON and copied to clipboard."` (add matching zh_TW / zh_CN) |
| `'已匯出目前 JSON 到文字框。'` | add `ui.status_exported_textarea` `"Exported JSON to the text area."` |
| `'請先在文字框貼上 JSON。'` | `t('ui.error_json_required')` |
| `` `已匯入 ${nextEnvelope.commands.length} 筆斜線命令。` `` | `t('ui.status_imported', [nextEnvelope.commands.length])` |
| `'JSON 解析失敗。'` literal inside `catch` | `t('ui.error_json_parse', [error?.message || 'unknown'])` |
| `` `新命令 ${nextIndex}` `` in `createBlankCommand` | `t('ui.blank_command_name', [nextIndex])` |
| `'請在這裡輸入提示詞。'` in `createBlankCommand` | `t('ui.blank_command_prompt')` |

For each added i18n key (`ui.command_meta`, `ui.status_exported_copied`, `ui.status_exported_textarea`), also extend all three locale JSONs.

- [ ] **Step 5: Extend locale JSONs with the three new keys**

In `locales/zh_TW.json` `ui` block, append (preserve alphabetical or logical order as you prefer):

```json
"command_meta": "ID: $1  ·  建立於 $2  ·  更新於 $3",
"status_exported_copied": "已匯出目前 JSON，並複製到剪貼簿。",
"status_exported_textarea": "已匯出目前 JSON 到文字框。"
```

In `locales/zh_CN.json` `ui` block:

```json
"command_meta": "ID: $1  ·  创建于 $2  ·  更新于 $3",
"status_exported_copied": "已导出当前 JSON，并复制到剪贴板。",
"status_exported_textarea": "已导出当前 JSON 到文本框。"
```

In `locales/en.json` `ui` block:

```json
"command_meta": "ID: $1  ·  Created $2  ·  Updated $3",
"status_exported_copied": "Exported JSON and copied to clipboard.",
"status_exported_textarea": "Exported JSON to the text area."
```

- [ ] **Step 6: Run self-test to confirm locale JSONs still parse**

```bash
node --experimental-vm-modules \
  ./statics/dev-plugins/lite-slash-commands/helpers/__selftest__.mjs
```
Expected: all-green output.

- [ ] **Step 7: Manual smoke test**

1. Reload Cerebr extension.
2. Open the Settings modal (`/` button). Verify all buttons/labels render in zh_TW.
3. Switch language to English in Cerebr preferences. Observe modal labels update **without reloading Cerebr** (courtesy of the locale subscription from Task 3). Close and re-open modal if needed.
4. Switch language to zh_CN. Verify labels update again.

- [ ] **Step 8: Commit**

```bash
git add statics/dev-plugins/lite-slash-commands/shell.js \
        statics/dev-plugins/lite-slash-commands/locales/
git commit -m "feat(lite-slash): localize all UI strings via plugin-local i18n"
```

---

## Task 5: Two-view Modal DOM/CSS refactor + draft state + overflow menu + focus/Esc + button margin fix

**Files:**
- Modify: `statics/dev-plugins/lite-slash-commands/shell.js`

The biggest refactor in the plan. It touches the modal DOM, CSS, interaction handlers, and introduces the draft-state machine for new commands. Break it into small steps and commit after each logical milestone.

- [ ] **Step 1: Extend `runtimeState` with editor/view fields**

Grep anchor: `const runtimeState = {`. Add these fields inside the object literal (and mirror them in `resetRuntimeState`):

```js
    view: 'list',               // 'list' | 'edit'
    editorDraft: null,          // { isNewDraft, command, hasUnsavedChanges }
    menuOpen: false,            // overflow (⋯) menu visibility
    lastFocusedCardId: null,    // which card was selected before entering edit view
```

Example merged block (replace the existing `const runtimeState = {...}` literal with):

```js
const runtimeState = {
    started: false,
    commandEnvelope: null,
    pickerRoot: null,
    chrome: null,
    settingsButton: null,
    settingsSlotHandle: null,
    styleEl: null,
    messageInput: null,
    inputContainer: null,
    isComposing: false,
    isModalOpen: false,
    activeIndex: 0,
    currentSlashState: null,
    selectedCommandId: '',
    editor: null,
    eventCleanups: [],
    view: 'list',
    editorDraft: null,
    menuOpen: false,
    lastFocusedCardId: null,
};
```

Apply the same shape to `resetRuntimeState`.

- [ ] **Step 2: Rewrite the modal DOM template with two views and overflow menu**

Grep anchor: `modal.innerHTML = \``. Replace the entire backticked template with:

```html
        <div class="cerebr-lite-slash-modal__backdrop" data-modal-close="true"></div>
        <section class="cerebr-lite-slash-modal__panel" role="dialog" aria-modal="true" aria-labelledby="cerebr-lite-slash-modal-title">
            <header class="cerebr-lite-slash-modal__header" data-header-list>
                <div>
                    <div id="cerebr-lite-slash-modal-title" class="cerebr-lite-slash-modal__title" data-i18n="ui.settings_title">Lite Slash Commands</div>
                    <div class="cerebr-lite-slash-modal__subtitle" data-i18n="ui.settings_subtitle"></div>
                </div>
                <button type="button" class="cerebr-lite-slash-modal__close" data-modal-close="true" data-i18n-attr="aria-label:ui.close">✕</button>
            </header>
            <header class="cerebr-lite-slash-modal__header" data-header-edit>
                <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__back" data-action="back-to-list" data-i18n="ui.back_to_list" data-i18n-attr="aria-label:ui.back_to_list"></button>
                <div class="cerebr-lite-slash-modal__edit-title" data-edit-title>
                    <span data-edit-token>/</span>
                    <span class="cerebr-lite-slash-modal__dirty-dot" data-dirty-dot hidden></span>
                </div>
                <button type="button" class="cerebr-lite-slash-modal__close" data-modal-close="true" data-i18n-attr="aria-label:ui.close">✕</button>
            </header>
            <div class="cerebr-lite-slash-modal__body" data-view="list">
                <section class="cerebr-lite-slash-modal__list-view">
                    <div class="cerebr-lite-slash-modal__toolbar">
                        <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--primary" data-action="create" data-i18n="ui.create_command"></button>
                        <div class="cerebr-lite-slash-modal__menu-wrapper" data-menu-wrapper>
                            <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__menu-trigger" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="false" data-i18n="ui.more_menu"></button>
                            <div class="cerebr-lite-slash-modal__menu" role="menu" data-menu hidden>
                                <button type="button" class="cerebr-lite-slash-modal__menu-item" data-action="reset" role="menuitem" data-i18n="ui.reset_defaults"></button>
                                <button type="button" class="cerebr-lite-slash-modal__menu-item" data-action="open-export" role="menuitem" data-i18n="ui.export_json"></button>
                                <button type="button" class="cerebr-lite-slash-modal__menu-item" data-action="open-import" role="menuitem" data-i18n="ui.import_json"></button>
                            </div>
                        </div>
                    </div>
                    <div class="cerebr-lite-slash-modal__command-list" data-command-list role="list"></div>
                    <div class="cerebr-lite-slash-modal__empty" data-empty-state hidden data-i18n="ui.list_empty"></div>
                    <div class="cerebr-lite-slash-modal__transfer-panel" data-transfer-panel hidden>
                        <div class="cerebr-lite-slash-modal__field-note" data-i18n="ui.import_note"></div>
                        <textarea class="cerebr-lite-slash-modal__transfer" data-transfer rows="7"></textarea>
                        <div class="cerebr-lite-slash-modal__transfer-actions">
                            <button type="button" class="cerebr-lite-slash-modal__button" data-action="export" data-i18n="ui.export_action"></button>
                            <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--primary" data-action="import" data-i18n="ui.import_action"></button>
                        </div>
                    </div>
                    <div class="cerebr-lite-slash-modal__status" data-status></div>
                </section>
                <section class="cerebr-lite-slash-modal__edit-view">
                    <div class="cerebr-lite-slash-modal__field-grid">
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-name" data-i18n="ui.field_name_label"></label>
                            <input id="cerebr-lite-slash-name" type="text" data-field="name" data-i18n-attr="placeholder:ui.field_name_placeholder">
                        </div>
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-label" data-i18n="ui.field_label_label"></label>
                            <input id="cerebr-lite-slash-label" type="text" data-field="label" data-i18n-attr="placeholder:ui.field_label_placeholder">
                        </div>
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-aliases" data-i18n="ui.field_aliases_label"></label>
                            <textarea id="cerebr-lite-slash-aliases" data-field="aliases" rows="2" data-i18n-attr="placeholder:ui.field_aliases_placeholder"></textarea>
                            <div class="cerebr-lite-slash-modal__field-note" data-i18n="ui.field_aliases_note"></div>
                        </div>
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-description" data-i18n="ui.field_description_label"></label>
                            <textarea id="cerebr-lite-slash-description" data-field="description" rows="2" data-i18n-attr="placeholder:ui.field_description_placeholder"></textarea>
                        </div>
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-prompt" data-i18n="ui.field_prompt_label"></label>
                            <textarea id="cerebr-lite-slash-prompt" data-field="prompt" rows="9" data-i18n-attr="placeholder:ui.field_prompt_placeholder"></textarea>
                        </div>
                        <div class="cerebr-lite-slash-modal__meta" data-meta></div>
                        <div class="cerebr-lite-slash-modal__actions">
                            <button type="button" class="cerebr-lite-slash-modal__button" data-action="move-up" data-i18n="ui.move_up"></button>
                            <button type="button" class="cerebr-lite-slash-modal__button" data-action="move-down" data-i18n="ui.move_down"></button>
                            <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--danger" data-action="delete" data-i18n="ui.delete_command"></button>
                            <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--primary" data-action="save" data-i18n="ui.save_changes"></button>
                        </div>
                    </div>
                    <div class="cerebr-lite-slash-modal__status" data-status-edit></div>
                </section>
            </div>
        </section>
```

- [ ] **Step 3: Extend the handle returned by `createSettingsModal`**

Grep anchor: `return {` inside `createSettingsModal`. Replace the handle object with:

```js
    return {
        modal,
        body: modal.querySelector('.cerebr-lite-slash-modal__body'),
        listView: modal.querySelector('.cerebr-lite-slash-modal__list-view'),
        editView: modal.querySelector('.cerebr-lite-slash-modal__edit-view'),
        headerList: modal.querySelector('[data-header-list]'),
        headerEdit: modal.querySelector('[data-header-edit]'),
        editToken: modal.querySelector('[data-edit-token]'),
        dirtyDot: modal.querySelector('[data-dirty-dot]'),
        list: modal.querySelector('[data-command-list]'),
        emptyState: modal.querySelector('[data-empty-state]'),
        status: modal.querySelector('[data-status]'),
        statusEdit: modal.querySelector('[data-status-edit]'),
        meta: modal.querySelector('[data-meta]'),
        transfer: modal.querySelector('[data-transfer]'),
        transferPanel: modal.querySelector('[data-transfer-panel]'),
        menu: modal.querySelector('[data-menu]'),
        menuWrapper: modal.querySelector('[data-menu-wrapper]'),
        name: modal.querySelector('[data-field="name"]'),
        label: modal.querySelector('[data-field="label"]'),
        aliases: modal.querySelector('[data-field="aliases"]'),
        description: modal.querySelector('[data-field="description"]'),
        prompt: modal.querySelector('[data-field="prompt"]'),
    };
```

- [ ] **Step 4: Rewrite CSS inside `injectPluginStyles`**

Grep anchor: `style.textContent = \``. Replace the entire CSS string with:

```css
        .cerebr-lite-slash-settings-button {
            width: 34px;
            height: 34px;
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.16)) 82%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 84%, rgba(96,165,250,0.12));
            color: var(--cerebr-text-color, #f8fafc);
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 15px;
            font-weight: 700;
            transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
            flex: 0 0 auto;
            margin-left: 8px;
            margin-right: 8px;
            align-self: center;
        }
        .cerebr-lite-slash-settings-button:hover,
        .cerebr-lite-slash-settings-button:focus-visible {
            outline: none;
            transform: translateY(-1px);
            border-color: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 55%, transparent);
            background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 14%, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)));
        }
        .cerebr-lite-slash-picker {
            position: absolute;
            left: 56px;
            right: 56px;
            bottom: calc(100% + 10px);
            display: none;
            flex-direction: column;
            gap: 6px;
            max-height: min(320px, 48vh);
            overflow-y: auto;
            padding: 10px;
            border-radius: 16px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 78%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 92%, rgba(15, 23, 42, 0.96));
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            z-index: 120;
        }
        #input-container .cerebr-lite-slash-picker {
            bottom: calc(100% - 12px);
        }
        .cerebr-lite-slash-picker[data-open="true"] { display: flex; }
        .cerebr-lite-slash-picker__item {
            display: grid; gap: 4px; padding: 10px 12px;
            border: 1px solid transparent; border-radius: 12px;
            background: transparent; color: inherit; cursor: pointer; text-align: left;
        }
        .cerebr-lite-slash-picker__item:hover,
        .cerebr-lite-slash-picker__item[data-active="true"] {
            border-color: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 55%, transparent);
            background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 12%, transparent);
        }
        .cerebr-lite-slash-picker__token-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .cerebr-lite-slash-picker__token { font-family: 'Menlo','Monaco','Courier New',monospace; font-size: 12px; color: var(--cerebr-link-color, #60a5fa); }
        .cerebr-lite-slash-picker__label { font-size: 13px; font-weight: 600; color: var(--cerebr-text-color, #f8fafc); }
        .cerebr-lite-slash-picker__description { font-size: 12px; line-height: 1.5; color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72)); }
        .cerebr-lite-slash-picker__empty { padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 8%, transparent); color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.78)); font-size: 12px; line-height: 1.5; }

        .cerebr-lite-slash-modal {
            position: fixed; inset: 0; display: none; align-items: flex-end; justify-content: center;
            padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); z-index: 160;
        }
        .cerebr-lite-slash-modal[data-open="true"] { display: flex; }
        .cerebr-lite-slash-modal__backdrop {
            position: absolute; inset: 0;
            background: rgba(15, 23, 42, 0.52);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .cerebr-lite-slash-modal__panel {
            position: relative;
            width: min(480px, calc(100vw - 24px));
            max-height: min(88vh, 720px);
            border-radius: 24px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 78%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 94%, rgba(15, 23, 42, 0.98));
            box-shadow: 0 30px 80px rgba(15, 23, 42, 0.35);
            display: grid;
            grid-template-rows: auto 1fr;
            overflow: hidden;
        }
        .cerebr-lite-slash-modal__header {
            display: flex; align-items: center; justify-content: space-between;
            gap: 16px; padding: 16px 18px;
            border-bottom: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.12)) 80%, transparent);
        }
        .cerebr-lite-slash-modal__title { font-size: 16px; font-weight: 700; color: var(--cerebr-text-color, #f8fafc); }
        .cerebr-lite-slash-modal__subtitle { margin-top: 4px; font-size: 12px; color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72)); line-height: 1.5; }
        .cerebr-lite-slash-modal__edit-title {
            display: flex; align-items: center; gap: 6px;
            font-family: 'Menlo','Monaco','Courier New',monospace;
            font-size: 14px; font-weight: 600; color: var(--cerebr-link-color, #60a5fa);
        }
        .cerebr-lite-slash-modal__dirty-dot {
            display: inline-block; width: 8px; height: 8px; border-radius: 999px;
            background: #fb7185; vertical-align: middle;
        }
        .cerebr-lite-slash-modal__back {
            padding: 4px 10px; min-height: 28px; font-size: 12px;
        }
        .cerebr-lite-slash-modal__close {
            width: 34px; height: 34px; border-radius: 10px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 82%, transparent);
            background: transparent; color: inherit; cursor: pointer; font-size: 16px;
        }
        .cerebr-lite-slash-modal__body { min-height: 0; overflow: hidden; }
        .cerebr-lite-slash-modal__list-view,
        .cerebr-lite-slash-modal__edit-view {
            display: none; flex-direction: column; min-height: 0;
            height: 100%; overflow-y: auto; padding: 16px 18px 20px;
        }
        .cerebr-lite-slash-modal__body[data-view="list"] .cerebr-lite-slash-modal__list-view { display: flex; }
        .cerebr-lite-slash-modal__body[data-view="edit"] .cerebr-lite-slash-modal__edit-view { display: flex; }
        .cerebr-lite-slash-modal[data-view-mode="list"] [data-header-edit],
        .cerebr-lite-slash-modal[data-view-mode="edit"] [data-header-list] { display: none; }

        .cerebr-lite-slash-modal__toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
        .cerebr-lite-slash-modal__menu-wrapper { position: relative; margin-left: auto; }
        .cerebr-lite-slash-modal__menu {
            position: absolute; right: 0; top: calc(100% + 6px);
            min-width: 180px; padding: 6px; display: grid; gap: 2px;
            border-radius: 12px; border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 82%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 96%, rgba(15,23,42,0.98));
            box-shadow: 0 16px 40px rgba(15,23,42,0.35);
            z-index: 4;
        }
        .cerebr-lite-slash-modal__menu[hidden] { display: none; }
        .cerebr-lite-slash-modal__menu-item {
            text-align: left; padding: 8px 10px; border-radius: 8px;
            background: transparent; border: none; color: inherit; font-size: 13px; cursor: pointer;
        }
        .cerebr-lite-slash-modal__menu-item:hover,
        .cerebr-lite-slash-modal__menu-item:focus-visible {
            outline: none;
            background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 12%, transparent);
        }
        .cerebr-lite-slash-modal__command-list { flex: 1; overflow-y: auto; display: grid; gap: 8px; }
        .cerebr-lite-slash-modal__command {
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.12)) 80%, transparent);
            border-radius: 14px; background: transparent; color: inherit;
            text-align: left; cursor: pointer; padding: 12px; display: grid; gap: 4px;
        }
        .cerebr-lite-slash-modal__command:hover,
        .cerebr-lite-slash-modal__command[data-active="true"] {
            border-color: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 55%, transparent);
            background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 12%, transparent);
        }
        .cerebr-lite-slash-modal__command-token { font-family: 'Menlo','Monaco','Courier New',monospace; font-size: 12px; color: var(--cerebr-link-color, #60a5fa); }
        .cerebr-lite-slash-modal__command-label { font-size: 13px; font-weight: 600; color: var(--cerebr-text-color, #f8fafc); }
        .cerebr-lite-slash-modal__command-snippet { font-size: 12px; line-height: 1.5; color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72)); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .cerebr-lite-slash-modal__empty {
            margin-top: 8px; padding: 16px; border-radius: 14px;
            border: 1px dashed color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.18)) 80%, transparent);
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72));
            font-size: 12px; line-height: 1.6;
        }
        .cerebr-lite-slash-modal__transfer-panel {
            margin-top: 10px; padding: 12px; border-radius: 14px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.12)) 80%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 82%, rgba(148,163,184,0.05));
            display: grid; gap: 8px;
        }
        .cerebr-lite-slash-modal__transfer-panel[hidden] { display: none; }
        .cerebr-lite-slash-modal__transfer {
            width: 100%; min-height: 110px; box-sizing: border-box;
            border-radius: 10px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 82%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 78%, rgba(15,23,42,0.92));
            color: var(--cerebr-text-color, #f8fafc);
            padding: 10px; font-family: 'Menlo','Monaco','Courier New',monospace; font-size: 12px; resize: vertical;
        }
        .cerebr-lite-slash-modal__transfer-actions { display: flex; gap: 8px; justify-content: flex-end; }

        .cerebr-lite-slash-modal__field-grid { display: grid; gap: 14px; }
        .cerebr-lite-slash-modal__field-group { display: grid; gap: 6px; }
        .cerebr-lite-slash-modal__field-group label {
            font-size: 12px; font-weight: 600;
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.8));
        }
        .cerebr-lite-slash-modal__field-group input,
        .cerebr-lite-slash-modal__field-group textarea {
            width: 100%; box-sizing: border-box; border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 82%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 78%, rgba(15,23,42,0.92));
            color: var(--cerebr-text-color, #f8fafc);
            padding: 10px 12px; font-size: 13px; line-height: 1.6;
            outline: none; resize: vertical;
        }
        .cerebr-lite-slash-modal__field-group input:focus,
        .cerebr-lite-slash-modal__field-group textarea:focus {
            border-color: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 55%, transparent);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 18%, transparent);
        }
        .cerebr-lite-slash-modal__field-note,
        .cerebr-lite-slash-modal__meta { font-size: 12px; line-height: 1.6; color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72)); }
        .cerebr-lite-slash-modal__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
        .cerebr-lite-slash-modal__button {
            min-height: 34px; padding: 0 12px; border-radius: 10px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 82%, transparent);
            background: transparent; color: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
            transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
        }
        .cerebr-lite-slash-modal__button:hover,
        .cerebr-lite-slash-modal__button:focus-visible {
            outline: none; transform: translateY(-1px);
            border-color: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 55%, transparent);
            background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 12%, transparent);
        }
        .cerebr-lite-slash-modal__button--primary {
            background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 18%, transparent);
            border-color: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 45%, transparent);
        }
        .cerebr-lite-slash-modal__button--danger:hover,
        .cerebr-lite-slash-modal__button--danger:focus-visible {
            border-color: rgba(248, 113, 113, 0.58);
            background: rgba(248, 113, 113, 0.12);
        }
        .cerebr-lite-slash-modal__button:disabled { opacity: 0.48; cursor: not-allowed; transform: none; }
        .cerebr-lite-slash-modal__status {
            min-height: 18px; font-size: 12px; margin-top: 8px;
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72));
        }
        .cerebr-lite-slash-modal__status[data-tone="error"] { color: #fda4af; }
        .cerebr-lite-slash-modal__status[data-tone="success"] { color: #86efac; }

        @media (max-width: 480px) {
            .cerebr-lite-slash-modal__panel {
                width: 100vw; max-height: 100vh; border-radius: 0;
            }
            .cerebr-lite-slash-picker { left: 12px; right: 12px; }
        }
```

- [ ] **Step 5: Implement `switchView` helper**

Insert after `function formatTimestamp(timestamp) { ... }`:

```js
function switchView(nextView) {
    if (!runtimeState.chrome?.body) return;
    runtimeState.view = nextView === 'edit' ? 'edit' : 'list';
    runtimeState.chrome.body.dataset.view = runtimeState.view;
    runtimeState.chrome.modal.dataset.viewMode = runtimeState.view;

    // Hide overflow menu on every view switch.
    hideOverflowMenu();
}

function hideOverflowMenu() {
    if (!runtimeState.chrome?.menu) return;
    runtimeState.chrome.menu.hidden = true;
    runtimeState.menuOpen = false;
    const trigger = runtimeState.chrome.menu
        .closest('[data-menu-wrapper]')
        ?.querySelector('[data-action="toggle-menu"]');
    trigger?.setAttribute('aria-expanded', 'false');
}

function showOverflowMenu() {
    if (!runtimeState.chrome?.menu) return;
    runtimeState.chrome.menu.hidden = false;
    runtimeState.menuOpen = true;
    const trigger = runtimeState.chrome.menu
        .closest('[data-menu-wrapper]')
        ?.querySelector('[data-action="toggle-menu"]');
    trigger?.setAttribute('aria-expanded', 'true');
}

function openTransferPanel(mode) {
    const panel = runtimeState.chrome?.transferPanel;
    if (!panel) return;
    panel.hidden = false;
    panel.dataset.mode = mode; // 'export' | 'import'
    hideOverflowMenu();
    runtimeState.chrome.transfer?.focus();
}

function closeTransferPanel() {
    const panel = runtimeState.chrome?.transferPanel;
    if (!panel) return;
    panel.hidden = true;
    delete panel.dataset.mode;
}
```

- [ ] **Step 6: Rewrite `renderEditorFields` to use `editorDraft`**

Grep anchor: `function renderEditorFields() {`. Replace with:

```js
function renderEditorFields() {
    const chrome = runtimeState.chrome;
    if (!chrome) return;

    const draft = runtimeState.editorDraft;
    const inputs = [chrome.name, chrome.label, chrome.aliases, chrome.description, chrome.prompt];

    if (!draft) {
        inputs.forEach((input) => { input.value = ''; input.disabled = true; });
        chrome.meta.textContent = t('ui.list_empty');
        chrome.editToken.textContent = '/';
        chrome.dirtyDot.hidden = true;
        return;
    }

    inputs.forEach((input) => { input.disabled = false; });

    chrome.name.value = draft.command.name || '';
    chrome.label.value = draft.command.label || '';
    chrome.aliases.value = Array.isArray(draft.command.aliases) ? draft.command.aliases.join(', ') : '';
    chrome.description.value = draft.command.description || '';
    chrome.prompt.value = draft.command.prompt || '';

    chrome.editToken.textContent = `/${draft.command.name || ''}`;
    chrome.dirtyDot.hidden = !draft.hasUnsavedChanges;

    if (draft.isNewDraft) {
        chrome.meta.textContent = '';
    } else {
        chrome.meta.textContent = t('ui.command_meta', [
            draft.command.id,
            formatTimestamp(draft.command.createdAt),
            formatTimestamp(draft.command.updatedAt),
        ]);
    }
}
```

- [ ] **Step 7: Rewrite `renderCommandList` to populate the list view**

Grep anchor: `function renderCommandList() {`. Replace with:

```js
function renderCommandList() {
    const chrome = runtimeState.chrome;
    if (!chrome) return;

    const commands = getCommands();
    chrome.list.replaceChildren();
    chrome.emptyState.hidden = commands.length > 0;

    const fragment = document.createDocumentFragment();

    commands.forEach((command) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'cerebr-lite-slash-modal__command';
        item.dataset.commandId = command.id;
        item.setAttribute('role', 'listitem');
        item.innerHTML = `
            <div class="cerebr-lite-slash-modal__command-token"></div>
            <div class="cerebr-lite-slash-modal__command-label"></div>
            <div class="cerebr-lite-slash-modal__command-snippet"></div>
        `;
        item.querySelector('.cerebr-lite-slash-modal__command-token').textContent = `/${command.name}`;
        item.querySelector('.cerebr-lite-slash-modal__command-label').textContent = command.label || '';
        item.querySelector('.cerebr-lite-slash-modal__command-snippet').textContent = buildCommandPreview(command);
        fragment.appendChild(item);
    });

    chrome.list.appendChild(fragment);
}
```

Note: this removes the `data-active` highlight since we no longer keep a persistent selected index in list view.

- [ ] **Step 8: Rewrite `openModal` / `closeModal` to respect views**

Grep anchor: `function openModal() {`. Replace both functions with:

```js
function openModal() {
    runtimeState.isModalOpen = true;
    hidePicker();
    runtimeState.chrome.modal.hidden = false;
    runtimeState.chrome.modal.dataset.open = 'true';
    switchView('list');
    renderModal();
    setStatus(t('ui.status_count', [getCommands().length]));
}

function closeModal() {
    runtimeState.isModalOpen = false;
    runtimeState.editorDraft = null;
    runtimeState.lastFocusedCardId = null;
    closeTransferPanel();
    hideOverflowMenu();
    if (!runtimeState.chrome?.modal) return;
    runtimeState.chrome.modal.dataset.open = 'false';
    runtimeState.chrome.modal.hidden = true;
}
```

- [ ] **Step 9: Replace the old `createCommand` with a draft-mode flow**

Grep anchor: `async function createCommand() {`. Replace with:

```js
function enterEditViewForCommand(command) {
    const cloned = JSON.parse(JSON.stringify(command));
    runtimeState.editorDraft = {
        isNewDraft: false,
        command: cloned,
        hasUnsavedChanges: false,
    };
    runtimeState.selectedCommandId = command.id;
    runtimeState.lastFocusedCardId = command.id;
    switchView('edit');
    renderEditorFields();
    requestAnimationFrame(() => runtimeState.chrome.name?.focus());
}

function enterEditViewForNewDraft() {
    const nextIndex = getCommands().length + 1;
    const draftCommand = decorateCommand({
        id: createCommandId(),
        name: t('ui.blank_command_name', [nextIndex]),
        label: t('ui.blank_command_name', [nextIndex]),
        prompt: t('ui.blank_command_prompt'),
        description: '',
        aliases: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    runtimeState.editorDraft = {
        isNewDraft: true,
        command: draftCommand,
        hasUnsavedChanges: true,
    };
    runtimeState.selectedCommandId = '';
    switchView('edit');
    renderEditorFields();
    requestAnimationFrame(() => {
        const el = runtimeState.chrome.name;
        el?.focus();
        el?.select?.();
    });
}
```

- [ ] **Step 10: Rewrite `saveCurrentCommand` to handle both new drafts and existing edits**

Grep anchor: `async function saveCurrentCommand() {`. Replace with:

```js
async function saveCurrentCommand() {
    const chrome = runtimeState.chrome;
    const draft = runtimeState.editorDraft;
    if (!draft) {
        setStatus(t('ui.error_nothing_to_save'), 'error');
        return;
    }

    const name = normalizeString(chrome.name.value);
    const prompt = String(chrome.prompt.value ?? '').trim();

    if (!name) {
        setStatus(t('ui.error_name_required'), 'error');
        chrome.name.focus();
        return;
    }
    if (!prompt) {
        setStatus(t('ui.error_prompt_required'), 'error');
        chrome.prompt.focus();
        return;
    }

    const now = Date.now();
    const updatedCommand = decorateCommand({
        ...draft.command,
        seedKey: undefined,
        name,
        label: normalizeString(chrome.label.value, name),
        aliases: normalizeAliasList(chrome.aliases.value),
        description: normalizeString(chrome.description.value),
        prompt,
        updatedAt: now,
        createdAt: draft.command.createdAt || now,
    });

    const current = getCommands();
    const nextCommands = draft.isNewDraft
        ? [...current, updatedCommand]
        : current.map((cmd) => (cmd.id === updatedCommand.id ? updatedCommand : cmd));

    await persistEnvelope({ ...runtimeState.commandEnvelope, commands: nextCommands });

    // Draft is now saved — refresh editor state so dirty flag resets and meta shows timestamps.
    runtimeState.editorDraft = {
        isNewDraft: false,
        command: JSON.parse(JSON.stringify(updatedCommand)),
        hasUnsavedChanges: false,
    };
    runtimeState.selectedCommandId = updatedCommand.id;
    runtimeState.lastFocusedCardId = updatedCommand.id;

    renderModal();
    refreshSlashStateFromEditor();
    setStatus(t('ui.status_saved', [updatedCommand.name]), 'success');
}
```

- [ ] **Step 11: Rewrite `deleteCommand` to bounce back to list view**

Grep anchor: `async function deleteCommand() {`. Replace with:

```js
async function deleteCommand() {
    const draft = runtimeState.editorDraft;
    if (!draft || draft.isNewDraft) {
        // For a new draft, "delete" is equivalent to going back.
        discardDraftAndReturnToList();
        return;
    }

    const commands = getCommands().filter((cmd) => cmd.id !== draft.command.id);
    await persistEnvelope({ ...runtimeState.commandEnvelope, commands });
    setStatus(t('ui.status_deleted', [draft.command.name]), 'success');
    runtimeState.editorDraft = null;
    runtimeState.selectedCommandId = commands[0]?.id || '';
    runtimeState.lastFocusedCardId = null;
    switchView('list');
    renderModal();
    refreshSlashStateFromEditor();
}

function discardDraftAndReturnToList() {
    runtimeState.editorDraft = null;
    switchView('list');
    renderModal();
    const card = runtimeState.chrome?.list?.querySelector(
        `[data-command-id="${runtimeState.lastFocusedCardId}"]`,
    );
    if (card) {
        card.focus();
    } else {
        runtimeState.chrome?.list?.querySelector('[data-command-id]')?.focus();
    }
}
```

- [ ] **Step 12: Rewrite `moveSelectedCommand` to act on editorDraft**

Grep anchor: `async function moveSelectedCommand(direction) {`. Replace with:

```js
async function moveSelectedCommand(direction) {
    const draft = runtimeState.editorDraft;
    if (!draft || draft.isNewDraft) {
        setStatus(t('ui.error_nothing_to_delete'), 'error');
        return;
    }

    const commands = [...getCommands()];
    const currentIndex = commands.findIndex((cmd) => cmd.id === draft.command.id);
    if (currentIndex === -1) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= commands.length) {
        setStatus(t('ui.status_no_move'));
        return;
    }

    const [item] = commands.splice(currentIndex, 1);
    commands.splice(targetIndex, 0, item);

    await persistEnvelope({ ...runtimeState.commandEnvelope, commands });
    setStatus(t('ui.status_reordered', [item.name]), 'success');
    renderModal();
    refreshSlashStateFromEditor();
}
```

- [ ] **Step 13: Rewrite export/import handlers to use the transfer panel**

Grep anchor: `async function exportCommands() {`. Replace both `exportCommands` and `importCommands` with:

```js
async function exportCommands() {
    openTransferPanel('export');
    const payload = JSON.stringify(serializeEnvelope(runtimeState.commandEnvelope), null, 2);
    if (runtimeState.chrome?.transfer) runtimeState.chrome.transfer.value = payload;

    let copied = false;
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(payload);
            copied = true;
        } catch (error) {
            console.warn('[Lite Slash Commands] Failed to copy JSON to clipboard', error);
        }
    }
    setStatus(
        copied ? t('ui.status_exported_copied') : t('ui.status_exported_textarea'),
        'success',
    );
}

async function importCommands() {
    openTransferPanel('import');
    const chrome = runtimeState.chrome;
    const rawText = String(chrome?.transfer?.value ?? '').trim();
    if (!rawText) {
        setStatus(t('ui.error_json_required'), 'error');
        chrome?.transfer?.focus();
        return;
    }
    let nextEnvelope = null;
    try {
        nextEnvelope = parseImportedEnvelope(rawText, runtimeState.commandEnvelope);
    } catch (error) {
        setStatus(t('ui.error_json_parse', [error?.message || 'unknown']), 'error');
        return;
    }
    runtimeState.selectedCommandId = nextEnvelope.commands[0]?.id || '';
    await persistEnvelope(nextEnvelope);
    renderModal();
    refreshSlashStateFromEditor();
    setStatus(t('ui.status_imported', [nextEnvelope.commands.length]), 'success');
}
```

- [ ] **Step 14: Install dirty-flag listeners inside the edit view**

Insert new function after `renderEditorFields`:

```js
function installEditorDirtyTracking() {
    const chrome = runtimeState.chrome;
    if (!chrome || chrome.__dirtyInstalled) return;
    chrome.__dirtyInstalled = true;

    const fields = [chrome.name, chrome.label, chrome.aliases, chrome.description, chrome.prompt];
    fields.forEach((field) => {
        if (!field) return;
        field.addEventListener('input', () => {
            const draft = runtimeState.editorDraft;
            if (!draft) return;
            draft.hasUnsavedChanges = true;
            chrome.dirtyDot.hidden = false;
            // Keep /name token preview in sync with live input.
            if (field === chrome.name) {
                chrome.editToken.textContent = `/${field.value || ''}`;
            }
        });
    });
}
```

Call `installEditorDirtyTracking()` once at the end of `setup`, right after `bindEventHandlers()`.

- [ ] **Step 15: Extend the modal click delegation to handle new actions**

Grep anchor: `addListener(chrome.modal, 'click', async (event) => {`. Replace the entire handler with:

```js
    addListener(chrome.modal, 'click', async (event) => {
        const closeTarget = event.target.closest?.('[data-modal-close="true"]');
        if (closeTarget) {
            event.preventDefault();
            closeModal();
            return;
        }

        const commandButton = event.target.closest?.('[data-command-id]');
        if (commandButton) {
            event.preventDefault();
            const command = getCommands().find((cmd) => cmd.id === commandButton.dataset.commandId);
            if (command) enterEditViewForCommand(command);
            return;
        }

        const actionButton = event.target.closest?.('[data-action]');
        if (!(actionButton instanceof HTMLButtonElement)) return;

        event.preventDefault();
        const action = actionButton.dataset.action;

        try {
            if (action === 'create') return enterEditViewForNewDraft();
            if (action === 'back-to-list') return discardDraftAndReturnToList();
            if (action === 'save') return void (await saveCurrentCommand());
            if (action === 'delete') return void (await deleteCommand());
            if (action === 'move-up') return void (await moveSelectedCommand(-1));
            if (action === 'move-down') return void (await moveSelectedCommand(1));
            if (action === 'reset') {
                hideOverflowMenu();
                return void (await resetDefaults());
            }
            if (action === 'toggle-menu') {
                return void (runtimeState.menuOpen ? hideOverflowMenu() : showOverflowMenu());
            }
            if (action === 'open-export') {
                hideOverflowMenu();
                openTransferPanel('export');
                return void (await exportCommands());
            }
            if (action === 'open-import') {
                hideOverflowMenu();
                openTransferPanel('import');
                return;
            }
            if (action === 'export') return void (await exportCommands());
            if (action === 'import') return void (await importCommands());
        } catch (error) {
            console.error('[Lite Slash Commands] Modal action failed', error);
            setStatus(error?.message || 'Unknown error', 'error');
        }
    });
```

- [ ] **Step 16: Extend the Esc keydown handler**

Grep anchor: `if (runtimeState.isModalOpen) {`. Replace the `if (event.key === 'Escape')` branch with:

```js
        if (runtimeState.isModalOpen) {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (runtimeState.menuOpen) {
                hideOverflowMenu();
                return;
            }
            if (runtimeState.view === 'edit') {
                discardDraftAndReturnToList();
                return;
            }
            closeModal();
            return;
        }
```

- [ ] **Step 17: Close overflow menu on outside click**

At the end of `bindEventHandlers`, add:

```js
    addListener(documentRef, 'pointerdown', (event) => {
        if (!runtimeState.menuOpen) return;
        const wrapper = runtimeState.chrome?.menuWrapper;
        if (wrapper && !wrapper.contains(event.target)) {
            hideOverflowMenu();
        }
    }, true);
```

- [ ] **Step 18: Manual smoke test**

1. Reload the extension.
2. Check `/` button — confirm it is no longer clipped on the right edge.
3. Click `/` to open modal. Expect list view with 4 seed commands (or existing user commands).
4. Click a command card → enters edit view, cursor lands on the name input, meta shows ID + timestamps.
5. Type in any field → red dot appears next to the `/name` token in the edit header.
6. Press `Esc` or click **← 回清單** → returns to list view, draft discarded, original card refocused.
7. Click **➕ 新增命令** → edit view with default placeholder text, dirty dot already showing.
8. Modify, press **儲存變更** → new card appears in list, edit view now shows saved state (no dirty dot), meta populated with created/updated timestamps.
9. Click ⋯ → menu appears with 3 items. Click **重設預設值** → confirm list resets.
10. Click ⋯ → **匯出 JSON** → transfer panel appears with JSON, clipboard copy confirmed via status message.
11. Click ⋯ → **匯入 JSON** → transfer panel appears empty, paste the JSON from step 10, click **匯入** → confirm import success.
12. At narrow viewport (<480px), modal fills full screen with no horizontal scroll.
13. Switch Cerebr language to English → modal labels update, seed commands rename to `/explain`, etc., user-edited commands remain untouched.

- [ ] **Step 19: Commit**

```bash
git add statics/dev-plugins/lite-slash-commands/shell.js
git commit -m "refactor(lite-slash): split modal into list/edit views with draft state and overflow menu"
```

---

## Task 6: Cleanup, version bump, docs

**Files:**
- Delete: `statics/dev-plugins/lite-slash-commands/default-commands.legacy.json`
- Modify: `statics/dev-plugins/lite-slash-commands/plugin.json`
- Modify: `docs/lite-slash-command-plugin-test-guide.md`

- [ ] **Step 1: Delete the legacy JSON**

```bash
git rm statics/dev-plugins/lite-slash-commands/default-commands.legacy.json
```

Sanity-grep for stale references:
```bash
grep -rn "default-commands.legacy.json" statics/dev-plugins/lite-slash-commands/ docs/ || echo "No references left."
```
Expected: `No references left.` (If anything prints, fix those call sites before proceeding.)

- [ ] **Step 2: Bump version in plugin.json**

Replace `"version": "0.3.0",` with `"version": "0.4.0",` in:
`statics/dev-plugins/lite-slash-commands/plugin.json`

Also update the `description` field to reflect the new behavior:
```json
"description": "在 Cerebr 輸入框啟用可自訂的斜線命令 picker，內建 4 個核心範本、{{lang}} 佔位符與多語系管理介面。"
```

- [ ] **Step 3: Extend the manual test guide**

Append the following sections to `docs/lite-slash-command-plugin-test-guide.md` (place after section 10 "Normal send uses the visible expanded draft", before the "Optional Regression Checks" section):

````markdown
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
````

- [ ] **Step 4: Final self-test + parse check**

```bash
node --experimental-vm-modules \
  ./statics/dev-plugins/lite-slash-commands/helpers/__selftest__.mjs
```
Expected: all-green output.

- [ ] **Step 5: Commit**

```bash
git add statics/dev-plugins/lite-slash-commands/plugin.json \
        docs/lite-slash-command-plugin-test-guide.md
git commit -m "chore(lite-slash): bump to v0.4.0 and extend manual verification guide"
git add -u statics/dev-plugins/lite-slash-commands/default-commands.legacy.json
git commit -m "chore(lite-slash): drop legacy seed file (content migrated to example-library.json)"
```

---

## Task 7: Final verification + PR preparation

**Files:** no code changes — runtime verification and branch hygiene only.

- [ ] **Step 1: Execute the entire manual test guide**

Walk through sections 1–10 of `docs/lite-slash-command-plugin-test-guide.md` plus the new A–E sections. Any failure → stop and fix.

- [ ] **Step 2: Review commit history**

```bash
git log --oneline main..HEAD
```

Expected 6 commits:
1. `feat(lite-slash): add example library, seed prompts, and plugin-local locale JSON`
2. `feat(lite-slash): add language-placeholders + plugin-i18n helpers with Node self-test`
3. `feat(lite-slash): slim seed to four commands with i18n-aware loading and {{lang}} expansion`
4. `feat(lite-slash): localize all UI strings via plugin-local i18n`
5. `refactor(lite-slash): split modal into list/edit views with draft state and overflow menu`
6. `chore(lite-slash): bump to v0.4.0 and extend manual verification guide`
7. `chore(lite-slash): drop legacy seed file (content migrated to example-library.json)`

If any commit did something unrelated or left stale code, amend or reorder as needed (interactive rebase is fine as long as no one else has pulled the branch).

- [ ] **Step 3: Confirm branch is isolated from main**

```bash
git status
git branch --show-current
```
Expected: `clean` working tree, current branch `feat/lite-slash-commands-v0.4.0`.

- [ ] **Step 4: (Optional) Push and draft PR**

```bash
git push -u origin feat/lite-slash-commands-v0.4.0
```

Then draft the PR via `gh pr create` with the title **"feat(lite-slash): v0.4.0 — slim seed, {{lang}} placeholder, two-view modal"**. Body should reference the spec at `docs/superpowers/specs/2026-04-17-lite-slash-commands-optimization-design.md`.

---

## Self-Review Checklist

**Spec coverage.** Every spec section has at least one task:

- §3 Seed Slimming → Tasks 1, 3 (step 2–7), 6 (step 1)
- §4 i18n + `{{lang}}` → Tasks 1 (locales), 2 (helpers), 3 (integration), 4 (UI strings)
- §5 Two-view Modal → Task 5 (full), Task 3 (button margin baseline in CSS overhaul)
- §6 Verification → Tasks 2 (self-test), 6 (test guide), 7 (final walk-through)

**Placeholder scan.** No `TODO`, `TBD`, `fill in later`, `similar to Task N`, or unreferenced identifiers remain.

**Type consistency.** Names used consistently across tasks: `editorDraft`, `seedKey`, `SEED_ORDER`, `refreshSeedCommandsForLocale`, `applyLocaleToDom`, `enterEditViewForCommand`, `enterEditViewForNewDraft`, `discardDraftAndReturnToList`, `switchView`, `openTransferPanel`, `closeTransferPanel`, `hideOverflowMenu`, `showOverflowMenu`. Same symbols used identically in later tasks as defined earlier.

**Granularity.** Each step is a single action that fits within 2–5 minutes (creating a file, applying a diff, running a command, committing).
