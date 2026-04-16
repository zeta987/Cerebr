import { definePlugin } from '../../../src/plugin/shared/define-plugin.js';
import {
    loadPluginLocale,
    t,
    getLocaleLabel,
    getSeedCommandMeta,
    onLocaleChanged,
} from './helpers/plugin-i18n.js';
import { expandLanguagePlaceholders } from './helpers/language-placeholders.js';
import { getActiveLocale as getCerebrLocale } from '/src/utils/i18n.js';

// ---------------------------------------------------------------------------
// Constants & pure helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'cerebr_plugin_lite_slash_commands_v1';
const STORAGE_SCHEMA_VERSION = 1;
const DEFAULT_SEED_VERSION = '2026-04-17-minimal-seed-1';
const SEED_ORDER = ['explain', 'translate', 'summarize', 'code_explain'];

function normalizeString(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function normalizeTimestamp(value, fallback = Date.now()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeAliasList(value) {
    const items = Array.isArray(value)
        ? value
        : String(value ?? '').split(/[\n,]+/g);
    const aliases = [];
    const unique = new Set();

    items.forEach((item) => {
        const alias = normalizeString(item);
        if (!alias) return;

        const lookup = alias.toLowerCase();
        if (unique.has(lookup)) return;

        unique.add(lookup);
        aliases.push(alias);
    });

    return aliases;
}

function createCommandId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `slash-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildSearchText(command) {
    return [
        normalizeString(command.name).toLowerCase(),
        normalizeString(command.label).toLowerCase(),
        normalizeString(command.description).toLowerCase(),
        ...normalizeAliasList(command.aliases).map((alias) => alias.toLowerCase()),
    ].filter(Boolean).join('\n');
}

function decorateCommand(command) {
    return {
        ...command,
        aliases: normalizeAliasList(command.aliases),
        searchText: buildSearchText(command),
    };
}

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

function normalizeEnvelope(rawEnvelope, { fallbackInitializedAt = Date.now() } = {}) {
    const commandsSource = Array.isArray(rawEnvelope?.commands)
        ? rawEnvelope.commands
        : Array.isArray(rawEnvelope)
            ? rawEnvelope
            : [];

    return {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        seedVersion: normalizeString(rawEnvelope?.seedVersion, DEFAULT_SEED_VERSION),
        commands: commandsSource
            .map((entry) => normalizeStoredCommandEntry(entry))
            .filter(Boolean),
        meta: {
            initializedAt: normalizeTimestamp(rawEnvelope?.meta?.initializedAt, fallbackInitializedAt),
            lastResetAt: rawEnvelope?.meta?.lastResetAt
                ? normalizeTimestamp(rawEnvelope.meta.lastResetAt, fallbackInitializedAt)
                : null,
        },
    };
}

function serializeEnvelope(envelope) {
    return {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        seedVersion: normalizeString(envelope?.seedVersion, DEFAULT_SEED_VERSION),
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
        meta: {
            initializedAt: normalizeTimestamp(envelope?.meta?.initializedAt, Date.now()),
            lastResetAt: envelope?.meta?.lastResetAt
                ? normalizeTimestamp(envelope.meta.lastResetAt, Date.now())
                : null,
        },
    };
}

function createBlankCommand(existingCommands = []) {
    const now = Date.now();
    const nextIndex = existingCommands.length + 1;
    const name = `新命令 ${nextIndex}`;

    return decorateCommand({
        id: createCommandId(),
        name,
        label: name,
        prompt: '請在這裡輸入提示詞。',
        description: '',
        aliases: [],
        createdAt: now,
        updatedAt: now,
    });
}

function parseImportedEnvelope(rawText, existingEnvelope = null) {
    const payload = JSON.parse(rawText);
    const fallbackInitializedAt = existingEnvelope?.meta?.initializedAt || Date.now();

    if (Array.isArray(payload)) {
        return normalizeEnvelope({
            schemaVersion: STORAGE_SCHEMA_VERSION,
            seedVersion: existingEnvelope?.seedVersion || DEFAULT_SEED_VERSION,
            commands: payload,
            meta: {
                initializedAt: fallbackInitializedAt,
                lastResetAt: existingEnvelope?.meta?.lastResetAt || null,
            },
        }, {
            fallbackInitializedAt,
        });
    }

    if (payload && typeof payload === 'object' && Array.isArray(payload.commands)) {
        return normalizeEnvelope(payload, {
            fallbackInitializedAt,
        });
    }

    throw new Error('Imported JSON must be an array or an object with a commands array');
}

// ---------------------------------------------------------------------------
// Storage layer (chrome.storage.local with localStorage fallback)
// ---------------------------------------------------------------------------

function isChromeStorageAvailable() {
    return !!(typeof chrome !== 'undefined' && chrome?.storage?.local);
}

function readChromeStorageValue(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, (result) => {
            const runtimeError = chrome.runtime?.lastError;
            if (runtimeError) {
                reject(new Error(runtimeError.message));
                return;
            }

            resolve(result?.[key]);
        });
    });
}

function writeChromeStorageValue(key, value) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
            const runtimeError = chrome.runtime?.lastError;
            if (runtimeError) {
                reject(new Error(runtimeError.message));
                return;
            }

            resolve();
        });
    });
}

async function readStoredEnvelope() {
    if (isChromeStorageAvailable()) {
        return readChromeStorageValue(STORAGE_KEY);
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error('[Lite Slash Commands] Failed to parse localStorage state', error);
        return null;
    }
}

async function writeStoredEnvelope(envelope) {
    const serialized = serializeEnvelope(envelope);

    if (isChromeStorageAvailable()) {
        await writeChromeStorageValue(STORAGE_KEY, serialized);
        return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
}

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

// ---------------------------------------------------------------------------
// Slash-state parser (snapshot-based, no direct DOM read)
// ---------------------------------------------------------------------------

function normalizeDraftTextFromSnapshot(text) {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/\u200b/g, '');
}

function parseSlashStateFromSnapshot(snapshot, commands) {
    if (!snapshot) return null;
    if (Array.isArray(snapshot.imageTags) && snapshot.imageTags.length > 0) return null;

    const draftText = normalizeDraftTextFromSnapshot(snapshot.text);
    if (!draftText.startsWith('/')) return null;

    const withoutSlash = draftText.slice(1);
    const firstWhitespace = withoutSlash.search(/\s/);
    const query = (firstWhitespace === -1
        ? withoutSlash
        : withoutSlash.slice(0, firstWhitespace)
    ).trim().toLowerCase();
    const trailingText = firstWhitespace === -1
        ? ''
        : withoutSlash.slice(firstWhitespace).trimStart();
    const matches = (commands || []).filter((command) => {
        if (!query) return true;
        return command.searchText.includes(query);
    });

    return {
        draftText,
        query,
        trailingText,
        matches,
    };
}

function buildExpandedDraft(command, trailingText) {
    const localeLabel = getLocaleLabel();
    const prompt = expandLanguagePlaceholders(String(command?.prompt ?? '').trimEnd(), localeLabel);
    const tail = String(trailingText ?? '').trimStart();

    if (!tail) {
        return prompt;
    }

    return `${prompt}\n\n${tail}`;
}

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

// ---------------------------------------------------------------------------
// DOM builders (styles, picker, settings chrome)
// ---------------------------------------------------------------------------

function injectPluginStyles(documentRef) {
    const style = documentRef.createElement('style');
    style.dataset.cerebrLiteSlashStyle = 'true';
    style.textContent = `
        .cerebr-lite-slash-settings-button {
            width: 36px;
            height: 36px;
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

        .cerebr-lite-slash-picker[data-open="true"] {
            display: flex;
        }

        .cerebr-lite-slash-picker__item {
            display: grid;
            gap: 4px;
            padding: 10px 12px;
            border: 1px solid transparent;
            border-radius: 12px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            text-align: left;
        }

        .cerebr-lite-slash-picker__item:hover,
        .cerebr-lite-slash-picker__item[data-active="true"] {
            border-color: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 55%, transparent);
            background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 12%, transparent);
        }

        .cerebr-lite-slash-picker__token-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        .cerebr-lite-slash-picker__token {
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            color: var(--cerebr-link-color, #60a5fa);
        }

        .cerebr-lite-slash-picker__label {
            font-size: 13px;
            font-weight: 600;
            color: var(--cerebr-text-color, #f8fafc);
        }

        .cerebr-lite-slash-picker__description {
            font-size: 12px;
            line-height: 1.5;
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72));
        }

        .cerebr-lite-slash-picker__empty {
            padding: 10px 12px;
            border-radius: 12px;
            background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 8%, transparent);
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.78));
            font-size: 12px;
            line-height: 1.5;
        }

        .cerebr-lite-slash-modal {
            position: fixed;
            inset: 0;
            display: none;
            align-items: flex-end;
            justify-content: center;
            padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
            z-index: 160;
        }

        .cerebr-lite-slash-modal[data-open="true"] {
            display: flex;
        }

        .cerebr-lite-slash-modal__backdrop {
            position: absolute;
            inset: 0;
            background: rgba(15, 23, 42, 0.52);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
        }

        .cerebr-lite-slash-modal__panel {
            position: relative;
            width: min(940px, calc(100vw - 24px));
            max-height: min(78vh, 860px);
            border-radius: 24px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 78%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 94%, rgba(15, 23, 42, 0.98));
            box-shadow: 0 30px 80px rgba(15, 23, 42, 0.35);
            display: grid;
            grid-template-rows: auto 1fr;
            overflow: hidden;
        }

        .cerebr-lite-slash-modal__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 18px 20px;
            border-bottom: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.12)) 80%, transparent);
        }

        .cerebr-lite-slash-modal__title {
            font-size: 16px;
            font-weight: 700;
            color: var(--cerebr-text-color, #f8fafc);
        }

        .cerebr-lite-slash-modal__subtitle {
            margin-top: 4px;
            font-size: 12px;
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72));
            line-height: 1.5;
        }

        .cerebr-lite-slash-modal__close {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 82%, transparent);
            background: transparent;
            color: inherit;
            cursor: pointer;
            font-size: 16px;
        }

        .cerebr-lite-slash-modal__body {
            display: grid;
            grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
            min-height: 0;
        }

        .cerebr-lite-slash-modal__sidebar,
        .cerebr-lite-slash-modal__editor {
            min-height: 0;
            display: flex;
            flex-direction: column;
        }

        .cerebr-lite-slash-modal__sidebar {
            border-right: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.12)) 80%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 82%, rgba(148, 163, 184, 0.04));
        }

        .cerebr-lite-slash-modal__toolbar,
        .cerebr-lite-slash-modal__actions,
        .cerebr-lite-slash-modal__transfer-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .cerebr-lite-slash-modal__toolbar {
            padding: 16px;
            border-bottom: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.12)) 80%, transparent);
        }

        .cerebr-lite-slash-modal__command-list {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: grid;
            gap: 8px;
        }

        .cerebr-lite-slash-modal__command {
            border: 1px solid transparent;
            border-radius: 14px;
            background: transparent;
            color: inherit;
            text-align: left;
            cursor: pointer;
            padding: 12px;
            display: grid;
            gap: 4px;
        }

        .cerebr-lite-slash-modal__command:hover,
        .cerebr-lite-slash-modal__command[data-active="true"] {
            border-color: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 55%, transparent);
            background: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 12%, transparent);
        }

        .cerebr-lite-slash-modal__command-token {
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            color: var(--cerebr-link-color, #60a5fa);
        }

        .cerebr-lite-slash-modal__command-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--cerebr-text-color, #f8fafc);
        }

        .cerebr-lite-slash-modal__command-snippet {
            font-size: 12px;
            line-height: 1.5;
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72));
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }

        .cerebr-lite-slash-modal__empty {
            margin: 12px;
            padding: 16px;
            border-radius: 14px;
            border: 1px dashed color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.18)) 80%, transparent);
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72));
            font-size: 12px;
            line-height: 1.6;
        }

        .cerebr-lite-slash-modal__editor {
            padding: 18px 20px 20px;
            overflow-y: auto;
            gap: 18px;
        }

        .cerebr-lite-slash-modal__status {
            min-height: 18px;
            font-size: 12px;
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72));
        }

        .cerebr-lite-slash-modal__status[data-tone="error"] {
            color: #fda4af;
        }

        .cerebr-lite-slash-modal__status[data-tone="success"] {
            color: #86efac;
        }

        .cerebr-lite-slash-modal__field-grid {
            display: grid;
            gap: 14px;
        }

        .cerebr-lite-slash-modal__field-group {
            display: grid;
            gap: 6px;
        }

        .cerebr-lite-slash-modal__field-group label {
            font-size: 12px;
            font-weight: 600;
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.8));
        }

        .cerebr-lite-slash-modal__field-group input,
        .cerebr-lite-slash-modal__field-group textarea {
            width: 100%;
            box-sizing: border-box;
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 82%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 78%, rgba(15,23,42,0.92));
            color: var(--cerebr-text-color, #f8fafc);
            padding: 10px 12px;
            font-size: 13px;
            line-height: 1.6;
            outline: none;
            resize: vertical;
        }

        .cerebr-lite-slash-modal__field-group input:focus,
        .cerebr-lite-slash-modal__field-group textarea:focus {
            border-color: color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 55%, transparent);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--cerebr-link-color, #60a5fa) 18%, transparent);
        }

        .cerebr-lite-slash-modal__field-note,
        .cerebr-lite-slash-modal__meta {
            font-size: 12px;
            line-height: 1.6;
            color: var(--cerebr-text-secondary-color, rgba(248,250,252,0.72));
        }

        .cerebr-lite-slash-modal__section {
            display: grid;
            gap: 10px;
            padding: 14px;
            border-radius: 16px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.12)) 80%, transparent);
            background: color-mix(in srgb, var(--cerebr-input-bar-bg, rgba(17,24,39,0.96)) 82%, rgba(148, 163, 184, 0.05));
        }

        .cerebr-lite-slash-modal__section-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--cerebr-text-color, #f8fafc);
        }

        .cerebr-lite-slash-modal__transfer {
            min-height: 132px;
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
        }

        .cerebr-lite-slash-modal__button {
            min-height: 34px;
            padding: 0 12px;
            border-radius: 10px;
            border: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.14)) 82%, transparent);
            background: transparent;
            color: inherit;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
        }

        .cerebr-lite-slash-modal__button:hover,
        .cerebr-lite-slash-modal__button:focus-visible {
            outline: none;
            transform: translateY(-1px);
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

        .cerebr-lite-slash-modal__button:disabled {
            opacity: 0.48;
            cursor: not-allowed;
            transform: none;
        }

        @media (max-width: 860px) {
            .cerebr-lite-slash-picker {
                left: 12px;
                right: 12px;
            }

            .cerebr-lite-slash-modal__body {
                grid-template-columns: 1fr;
            }

            .cerebr-lite-slash-modal__sidebar {
                border-right: none;
                border-bottom: 1px solid color-mix(in srgb, var(--cerebr-border-color, rgba(255,255,255,0.12)) 80%, transparent);
                max-height: 240px;
            }
        }
    `;
    documentRef.head.appendChild(style);
    return style;
}

function createPickerRoot(documentRef, inputContainer) {
    const root = documentRef.createElement('div');
    root.className = 'cerebr-lite-slash-picker';
    root.setAttribute('role', 'listbox');
    root.setAttribute('aria-label', 'Lite slash command picker');
    root.dataset.open = 'false';
    inputContainer.appendChild(root);
    return root;
}

function renderPicker(root, slashState, activeIndex, onPick) {
    root.replaceChildren();
    const matches = slashState?.matches || [];
    root.dataset.open = slashState ? 'true' : 'false';

    if (!slashState) {
        return;
    }

    if (!matches.length) {
        const empty = document.createElement('div');
        empty.className = 'cerebr-lite-slash-picker__empty';
        empty.textContent = t('ui.picker_empty');
        root.appendChild(empty);
        return;
    }

    matches.forEach((command, index) => {
        const item = document.createElement('div');
        item.className = 'cerebr-lite-slash-picker__item';
        item.dataset.active = String(index === activeIndex);
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(index === activeIndex));

        const tokenRow = document.createElement('div');
        tokenRow.className = 'cerebr-lite-slash-picker__token-row';

        const token = document.createElement('div');
        token.className = 'cerebr-lite-slash-picker__token';
        token.textContent = `/${command.name}`;

        const label = document.createElement('div');
        label.className = 'cerebr-lite-slash-picker__label';
        label.textContent = command.label;

        tokenRow.append(token, label);
        item.appendChild(tokenRow);

        const description = document.createElement('div');
        description.className = 'cerebr-lite-slash-picker__description';
        description.textContent = command.description || command.prompt;
        item.appendChild(description);

        item.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        item.addEventListener('mouseenter', () => {
            onPick({ type: 'preview', index });
        });
        item.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onPick({ type: 'commit', index });
        });

        root.appendChild(item);
    });
}

function createSettingsButton(documentRef) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'cerebr-lite-slash-settings-button';
    button.setAttribute('aria-label', 'Manage slash commands');
    button.title = 'Manage slash commands';
    button.textContent = '/';
    return button;
}

function createSettingsModal(documentRef) {
    const modal = documentRef.createElement('div');
    modal.className = 'cerebr-lite-slash-modal';
    modal.dataset.open = 'false';
    modal.hidden = true;
    modal.innerHTML = `
        <div class="cerebr-lite-slash-modal__backdrop" data-modal-close="true"></div>
        <section class="cerebr-lite-slash-modal__panel" role="dialog" aria-modal="true" aria-label="Lite slash command editor">
            <header class="cerebr-lite-slash-modal__header">
                <div>
                    <div class="cerebr-lite-slash-modal__title">Lite Slash Commands</div>
                    <div class="cerebr-lite-slash-modal__subtitle">備份預設值會首次播種到外掛私有儲存，之後可自由自訂、匯入與重設。</div>
                </div>
                <button type="button" class="cerebr-lite-slash-modal__close" data-modal-close="true" aria-label="Close slash command editor">✕</button>
            </header>
            <div class="cerebr-lite-slash-modal__body">
                <aside class="cerebr-lite-slash-modal__sidebar">
                    <div class="cerebr-lite-slash-modal__toolbar">
                        <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--primary" data-action="create">新增命令</button>
                        <button type="button" class="cerebr-lite-slash-modal__button" data-action="reset">重設預設</button>
                    </div>
                    <div class="cerebr-lite-slash-modal__command-list" data-command-list></div>
                    <div class="cerebr-lite-slash-modal__empty" data-empty-state hidden>目前沒有任何斜線命令，按下「新增命令」就能建立自己的命令。</div>
                </aside>
                <main class="cerebr-lite-slash-modal__editor">
                    <div class="cerebr-lite-slash-modal__status" data-status></div>
                    <div class="cerebr-lite-slash-modal__field-grid">
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-name">命令名稱</label>
                            <input id="cerebr-lite-slash-name" type="text" data-field="name" placeholder="例如：翻譯">
                        </div>
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-label">顯示標題</label>
                            <input id="cerebr-lite-slash-label" type="text" data-field="label" placeholder="例如：翻譯成台灣正體中文">
                        </div>
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-aliases">別名</label>
                            <textarea id="cerebr-lite-slash-aliases" data-field="aliases" rows="2" placeholder="用逗號或換行分隔"></textarea>
                            <div class="cerebr-lite-slash-modal__field-note">別名只用於搜尋與輸入匹配，不會另外顯示成主要命令名。</div>
                        </div>
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-description">描述</label>
                            <textarea id="cerebr-lite-slash-description" data-field="description" rows="2" placeholder="簡短說明這個命令會做什麼"></textarea>
                        </div>
                        <div class="cerebr-lite-slash-modal__field-group">
                            <label for="cerebr-lite-slash-prompt">提示詞內容</label>
                            <textarea id="cerebr-lite-slash-prompt" data-field="prompt" rows="9" placeholder="真正展開到草稿區的提示詞"></textarea>
                        </div>
                        <div class="cerebr-lite-slash-modal__meta" data-meta></div>
                        <div class="cerebr-lite-slash-modal__actions">
                            <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--primary" data-action="save">儲存變更</button>
                            <button type="button" class="cerebr-lite-slash-modal__button" data-action="move-up">上移</button>
                            <button type="button" class="cerebr-lite-slash-modal__button" data-action="move-down">下移</button>
                            <button type="button" class="cerebr-lite-slash-modal__button cerebr-lite-slash-modal__button--danger" data-action="delete">刪除命令</button>
                            <button type="button" class="cerebr-lite-slash-modal__button" data-modal-close="true">關閉</button>
                        </div>
                    </div>
                    <section class="cerebr-lite-slash-modal__section">
                        <div class="cerebr-lite-slash-modal__section-title">JSON 匯入與匯出</div>
                        <div class="cerebr-lite-slash-modal__field-note">匯出格式是外掛私有 envelope；匯入時也接受單純的命令陣列。</div>
                        <div class="cerebr-lite-slash-modal__transfer-actions">
                            <button type="button" class="cerebr-lite-slash-modal__button" data-action="export">匯出目前 JSON</button>
                            <button type="button" class="cerebr-lite-slash-modal__button" data-action="import">從文字框匯入 JSON</button>
                        </div>
                        <textarea class="cerebr-lite-slash-modal__transfer" data-transfer rows="8" placeholder="按下匯出後會把目前設定寫到這裡，也可以把 JSON 貼進來再按匯入。"></textarea>
                    </section>
                </main>
            </div>
        </section>
    `;

    documentRef.body.appendChild(modal);

    return {
        modal,
        list: modal.querySelector('[data-command-list]'),
        emptyState: modal.querySelector('[data-empty-state]'),
        status: modal.querySelector('[data-status]'),
        meta: modal.querySelector('[data-meta]'),
        transfer: modal.querySelector('[data-transfer]'),
        name: modal.querySelector('[data-field="name"]'),
        label: modal.querySelector('[data-field="label"]'),
        aliases: modal.querySelector('[data-field="aliases"]'),
        description: modal.querySelector('[data-field="description"]'),
        prompt: modal.querySelector('[data-field="prompt"]'),
    };
}

function formatTimestamp(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return '未設定';
    }

    try {
        return new Date(numeric).toLocaleString();
    } catch {
        return String(timestamp);
    }
}

function buildCommandPreview(command) {
    const summary = normalizeString(command.description) || normalizeString(command.prompt);
    return summary.length > 96 ? `${summary.slice(0, 96)}…` : summary;
}

// ---------------------------------------------------------------------------
// Module-level runtime state (shared between setup and onInputChanged hook)
//
// Why module-level? Hook methods on a definePlugin object are called by the
// runtime as plain functions (see hook-runner: `hook(...args)`), so `this` is
// useless and a closure around `setup` is the simplest way to share state.
// ---------------------------------------------------------------------------

const runtimeState = {
    started: false,
    commandEnvelope: null,
    pickerRoot: null,
    chrome: null,            // settings modal refs
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
    editor: null,            // api.editor reference
    eventCleanups: [],
};

function resetRuntimeState() {
    Object.assign(runtimeState, {
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
    });
}

// ---------------------------------------------------------------------------
// Plugin setup & hook implementations
// ---------------------------------------------------------------------------

export default definePlugin({
    id: 'local.lite-slash-commands',

    async setup(api) {
        const documentRef = window.document;
        const messageInput = documentRef.getElementById('message-input');
        const inputContainer = documentRef.getElementById('input-container');

        if (!messageInput || !inputContainer) {
            throw new Error('Lite Slash Commands requires #message-input and #input-container in the shell');
        }

        runtimeState.editor = api.editor;
        runtimeState.messageInput = messageInput;
        runtimeState.inputContainer = inputContainer;

        // 1. Load plugin locale so seed generation has seed_commands meta.
        const moduleUrl = new URL(import.meta.url);
        const revision = normalizeString(moduleUrl.searchParams.get('cerebr_plugin_rev'));
        await loadPluginLocale(getCerebrLocale?.() || 'en', import.meta.url, revision);

        // 2. Subscribe to Cerebr locale changes to keep UI and seed commands in sync.
        //    NOTE: applyLocaleToDom is declared in Task 4. Until Task 4 lands,
        //    leave the call commented or use a defensive typeof guard.
        const unsubscribeLocale = onLocaleChanged(async ({ locale } = {}) => {
            try {
                await loadPluginLocale(locale || 'en', import.meta.url, revision);
            } catch (err) {
                console.warn('[Lite Slash Commands] locale reload failed, keeping previous locale', err);
                return;
            }
            const changed = refreshSeedCommandsForLocale(runtimeState.commandEnvelope);
            if (changed) {
                await writeStoredEnvelope(runtimeState.commandEnvelope);
            }
            if (typeof applyLocaleToDom === 'function') {
                applyLocaleToDom();
            }
            renderModal();
            refreshSlashStateFromEditor();
        });
        runtimeState.eventCleanups.push(unsubscribeLocale);

        // 3. Load envelope (seeds if absent).
        runtimeState.commandEnvelope = await loadInitialEnvelope();
        runtimeState.selectedCommandId = runtimeState.commandEnvelope.commands[0]?.id || '';

        // 2. Inject styles
        runtimeState.styleEl = injectPluginStyles(documentRef);

        // 3. Build picker & modal (both need DOM attachment)
        runtimeState.pickerRoot = createPickerRoot(documentRef, inputContainer);
        runtimeState.chrome = createSettingsModal(documentRef);
        runtimeState.settingsButton = createSettingsButton(documentRef);

        // 4. Mount settings button – prefer slot when available, otherwise append
        //    directly to #input-container as fallback. Slot renderer returns the
        //    Node itself (registry handles appendChild on a wrapper).
        const availableSlots = new Set(api.ui?.getAvailableSlots?.() || []);
        if (availableSlots.has('shell.input.after')) {
            runtimeState.settingsSlotHandle = api.ui.mountSlot(
                'shell.input.after',
                () => runtimeState.settingsButton,
            );
        } else {
            inputContainer.appendChild(runtimeState.settingsButton);
        }

        // 5. Wire up event handlers
        bindEventHandlers();

        // 6. Initial picker paint – user may already have draft text
        refreshSlashStateFromEditor();

        runtimeState.started = true;

        // 7. Cleanup function (runtime auto-invokes on unload / reload / disable)
        return () => {
            teardown();
        };
    },

    // NOTE: hook context `ctx` is unreliable here — shell-plugin-runtime's
    // scheduleInputHook calls createHookContext without an entry, so touching
    // `ctx.chat.*` / `ctx.prompt.*` would throw "Plugin '' requires permission".
    // We only read `snapshot`; do not add ctx-dependent logic.
    onInputChanged(snapshot) {
        if (!runtimeState.started) return;
        if (runtimeState.isComposing || runtimeState.isModalOpen) return;
        updateSlashState(snapshot);
    },
});

// ---------------------------------------------------------------------------
// Runtime behaviour (closed over runtimeState)
// ---------------------------------------------------------------------------

function getCommands() {
    return runtimeState.commandEnvelope?.commands || [];
}

function ensureSelection() {
    const commands = getCommands();
    if (commands.some((command) => command.id === runtimeState.selectedCommandId)) {
        return;
    }
    runtimeState.selectedCommandId = commands[0]?.id || '';
}

function getSelectedCommand() {
    ensureSelection();
    return getCommands().find((command) => command.id === runtimeState.selectedCommandId) || null;
}

function setStatus(message = '', tone = 'info') {
    if (!runtimeState.chrome?.status) return;
    runtimeState.chrome.status.textContent = message;
    runtimeState.chrome.status.dataset.tone = tone;
}

function hidePicker() {
    if (!runtimeState.pickerRoot) return;
    runtimeState.currentSlashState = null;
    runtimeState.activeIndex = 0;
    runtimeState.pickerRoot.replaceChildren();
    runtimeState.pickerRoot.dataset.open = 'false';
}

function renderCurrentPicker() {
    if (!runtimeState.pickerRoot) return;
    renderPicker(
        runtimeState.pickerRoot,
        runtimeState.currentSlashState,
        runtimeState.activeIndex,
        ({ type, index }) => {
            const state = runtimeState.currentSlashState;
            if (!state?.matches?.length) return;

            if (type === 'preview') {
                runtimeState.activeIndex = index;
                renderCurrentPicker();
                return;
            }

            const selected = state.matches[index];
            if (!selected) return;

            applyCommandSelection(selected, state.trailingText);
        },
    );
}

function applyCommandSelection(command, trailingText) {
    if (!command) return;
    const nextDraft = buildExpandedDraft(command, trailingText);
    // Hide picker BEFORE setDraft so the input dispatch doesn't redraw us.
    hidePicker();
    runtimeState.editor?.setDraft?.(nextDraft);
    runtimeState.editor?.focus?.();
}

function updateSlashState(snapshot) {
    const nextState = parseSlashStateFromSnapshot(snapshot, getCommands());

    if (!nextState) {
        hidePicker();
        return;
    }

    runtimeState.currentSlashState = nextState;
    const maxIndex = Math.max(nextState.matches.length - 1, 0);
    runtimeState.activeIndex = Math.max(0, Math.min(runtimeState.activeIndex, maxIndex));
    renderCurrentPicker();
}

function refreshSlashStateFromEditor() {
    // Used for initial paint and keydown recomputation — reads live editor state,
    // bypassing onInputChanged's 120ms debounce.
    if (!runtimeState.editor?.getDraftSnapshot) return;
    const snapshot = runtimeState.editor.getDraftSnapshot();
    updateSlashState(snapshot);
}

// ---------------------------------------------------------------------------
// Modal interactions
// ---------------------------------------------------------------------------

async function persistEnvelope(nextEnvelope) {
    runtimeState.commandEnvelope = normalizeEnvelope(nextEnvelope, {
        fallbackInitializedAt: runtimeState.commandEnvelope?.meta?.initializedAt || Date.now(),
    });
    ensureSelection();
    await writeStoredEnvelope(runtimeState.commandEnvelope);
}

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
        item.dataset.active = String(command.id === runtimeState.selectedCommandId);
        item.innerHTML = `
            <div class="cerebr-lite-slash-modal__command-token">/${command.name}</div>
            <div class="cerebr-lite-slash-modal__command-label">${command.label}</div>
            <div class="cerebr-lite-slash-modal__command-snippet">${buildCommandPreview(command)}</div>
        `;
        fragment.appendChild(item);
    });

    chrome.list.appendChild(fragment);
}

function renderEditorFields() {
    const chrome = runtimeState.chrome;
    if (!chrome) return;

    const selected = getSelectedCommand();
    const inputs = [chrome.name, chrome.label, chrome.aliases, chrome.description, chrome.prompt];

    if (!selected) {
        inputs.forEach((input) => {
            input.value = '';
            input.disabled = true;
        });
        chrome.meta.textContent = '目前沒有可編輯的斜線命令。';
        return;
    }

    inputs.forEach((input) => {
        input.disabled = false;
    });

    chrome.name.value = selected.name;
    chrome.label.value = selected.label;
    chrome.aliases.value = selected.aliases.join(', ');
    chrome.description.value = selected.description;
    chrome.prompt.value = selected.prompt;
    chrome.meta.textContent = `ID: ${selected.id}  ·  建立於 ${formatTimestamp(selected.createdAt)}  ·  更新於 ${formatTimestamp(selected.updatedAt)}`;
}

function renderModal() {
    renderCommandList();
    renderEditorFields();
}

function openModal() {
    runtimeState.isModalOpen = true;
    hidePicker();
    ensureSelection();
    runtimeState.chrome.modal.hidden = false;
    runtimeState.chrome.modal.dataset.open = 'true';
    renderModal();
    setStatus(`目前共有 ${getCommands().length} 筆斜線命令。`);
}

function closeModal() {
    runtimeState.isModalOpen = false;
    if (!runtimeState.chrome?.modal) return;
    runtimeState.chrome.modal.dataset.open = 'false';
    runtimeState.chrome.modal.hidden = true;
}

async function saveCurrentCommand() {
    const chrome = runtimeState.chrome;
    const selected = getSelectedCommand();
    if (!selected) {
        setStatus('目前沒有可儲存的命令。', 'error');
        return;
    }

    const name = normalizeString(chrome.name.value);
    const prompt = String(chrome.prompt.value ?? '').trim();

    if (!name) {
        setStatus('命令名稱不能留白。', 'error');
        chrome.name.focus();
        return;
    }

    if (!prompt) {
        setStatus('提示詞內容不能留白。', 'error');
        chrome.prompt.focus();
        return;
    }

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

    const nextEnvelope = {
        ...runtimeState.commandEnvelope,
        commands: getCommands().map((command) => (command.id === selected.id ? updatedCommand : command)),
    };

    await persistEnvelope(nextEnvelope);
    renderModal();
    refreshSlashStateFromEditor();
    setStatus(t('ui.status_saved', [updatedCommand.name]), 'success');
}

async function createCommand() {
    const nextCommand = createBlankCommand(getCommands());
    runtimeState.selectedCommandId = nextCommand.id;

    const nextEnvelope = {
        ...runtimeState.commandEnvelope,
        commands: [...getCommands(), nextCommand],
    };

    await persistEnvelope(nextEnvelope);
    renderModal();
    refreshSlashStateFromEditor();
    setStatus(`已新增 /${nextCommand.name}。`, 'success');
}

async function deleteCommand() {
    const selected = getSelectedCommand();
    if (!selected) {
        setStatus('目前沒有可刪除的命令。', 'error');
        return;
    }

    const nextCommands = getCommands().filter((command) => command.id !== selected.id);
    runtimeState.selectedCommandId = nextCommands[0]?.id || '';

    await persistEnvelope({
        ...runtimeState.commandEnvelope,
        commands: nextCommands,
    });
    renderModal();
    refreshSlashStateFromEditor();
    setStatus(`已刪除 /${selected.name}。`, 'success');
}

async function moveSelectedCommand(direction) {
    const commands = [...getCommands()];
    const currentIndex = commands.findIndex((command) => command.id === runtimeState.selectedCommandId);
    if (currentIndex === -1) {
        setStatus('目前沒有可移動的命令。', 'error');
        return;
    }

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= commands.length) {
        setStatus('這筆命令不能再移動了。');
        return;
    }

    const [item] = commands.splice(currentIndex, 1);
    commands.splice(targetIndex, 0, item);

    await persistEnvelope({
        ...runtimeState.commandEnvelope,
        commands,
    });
    renderModal();
    refreshSlashStateFromEditor();
    setStatus(`已更新 /${item.name} 的排序。`, 'success');
}

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

async function exportCommands() {
    const payload = JSON.stringify(serializeEnvelope(runtimeState.commandEnvelope), null, 2);
    if (runtimeState.chrome?.transfer) {
        runtimeState.chrome.transfer.value = payload;
    }

    let copied = false;
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(payload);
            copied = true;
        } catch (error) {
            console.warn('[Lite Slash Commands] Failed to copy JSON to clipboard', error);
        }
    }

    setStatus(copied ? '已匯出目前 JSON，並複製到剪貼簿。' : '已匯出目前 JSON 到文字框。', 'success');
}

async function importCommands() {
    const chrome = runtimeState.chrome;
    const rawText = String(chrome?.transfer?.value ?? '').trim();
    if (!rawText) {
        setStatus('請先在文字框貼上 JSON。', 'error');
        chrome?.transfer?.focus();
        return;
    }

    let nextEnvelope = null;
    try {
        nextEnvelope = parseImportedEnvelope(rawText, runtimeState.commandEnvelope);
    } catch (error) {
        setStatus(error?.message || 'JSON 解析失敗。', 'error');
        return;
    }

    runtimeState.selectedCommandId = nextEnvelope.commands[0]?.id || '';
    await persistEnvelope(nextEnvelope);
    renderModal();
    refreshSlashStateFromEditor();
    setStatus(`已匯入 ${nextEnvelope.commands.length} 筆斜線命令。`, 'success');
}

// ---------------------------------------------------------------------------
// Event wiring & teardown
// ---------------------------------------------------------------------------

function bindEventHandlers() {
    const documentRef = window.document;
    const { messageInput, inputContainer, chrome, settingsButton } = runtimeState;

    const addListener = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        runtimeState.eventCleanups.push(() => target.removeEventListener(type, handler, options));
    };

    addListener(messageInput, 'compositionstart', () => {
        runtimeState.isComposing = true;
        hidePicker();
    });

    addListener(messageInput, 'compositionend', () => {
        runtimeState.isComposing = false;
        refreshSlashStateFromEditor();
    });

    // keydown handler uses live snapshot (not debounced state) so Arrow/Enter
    // always see the real current input.
    addListener(messageInput, 'keydown', (event) => {
        if (runtimeState.isModalOpen) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeModal();
            }
            return;
        }

        if (runtimeState.isComposing) return;

        // Recompute state from editor snapshot on every keydown that matters,
        // instead of trusting the 120ms-debounced currentSlashState.
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
            const snapshot = runtimeState.editor?.getDraftSnapshot?.();
            const liveState = parseSlashStateFromSnapshot(snapshot, getCommands());
            if (!liveState || !liveState.matches.length) {
                if (event.key === 'Escape' && runtimeState.currentSlashState) {
                    event.preventDefault();
                    event.stopPropagation();
                    hidePicker();
                }
                return;
            }

            // Sync cached state for renderPicker consumers
            runtimeState.currentSlashState = liveState;
            const maxIndex = Math.max(liveState.matches.length - 1, 0);
            runtimeState.activeIndex = Math.max(0, Math.min(runtimeState.activeIndex, maxIndex));

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                runtimeState.activeIndex = (runtimeState.activeIndex + 1) % liveState.matches.length;
                renderCurrentPicker();
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                runtimeState.activeIndex = (runtimeState.activeIndex - 1 + liveState.matches.length) % liveState.matches.length;
                renderCurrentPicker();
                return;
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                applyCommandSelection(liveState.matches[runtimeState.activeIndex], liveState.trailingText);
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                hidePicker();
            }
        }
    }, true);

    addListener(messageInput, 'blur', () => {
        if (!runtimeState.isModalOpen) {
            hidePicker();
        }
    });

    addListener(documentRef, 'pointerdown', (event) => {
        if (inputContainer.contains(event.target)) return;
        hidePicker();
    });

    // Settings button click toggles modal
    addListener(settingsButton, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (runtimeState.isModalOpen) {
            closeModal();
        } else {
            openModal();
        }
    });

    // Modal delegation
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
            runtimeState.selectedCommandId = commandButton.dataset.commandId || '';
            renderModal();
            setStatus('');
            return;
        }

        const actionButton = event.target.closest?.('[data-action]');
        if (!(actionButton instanceof HTMLButtonElement)) return;

        event.preventDefault();
        const action = actionButton.dataset.action;

        try {
            if (action === 'create') return void (await createCommand());
            if (action === 'save') return void (await saveCurrentCommand());
            if (action === 'delete') return void (await deleteCommand());
            if (action === 'move-up') return void (await moveSelectedCommand(-1));
            if (action === 'move-down') return void (await moveSelectedCommand(1));
            if (action === 'reset') return void (await resetDefaults());
            if (action === 'export') return void (await exportCommands());
            if (action === 'import') return void (await importCommands());
        } catch (error) {
            console.error('[Lite Slash Commands] Modal action failed', error);
            setStatus(error?.message || '操作失敗。', 'error');
        }
    });
}

function teardown() {
    // 1. Detach listeners
    runtimeState.eventCleanups.splice(0).forEach((dispose) => {
        try {
            dispose();
        } catch (error) {
            console.error('[Lite Slash Commands] Failed to dispose listener', error);
        }
    });

    // 2. Close modal & remove DOM
    closeModal();

    runtimeState.pickerRoot?.remove();
    runtimeState.chrome?.modal?.remove();
    runtimeState.styleEl?.remove();

    // 3. Settings button: slot handle is auto-disposed by runtime; fallback path
    //    requires manual removal.
    if (runtimeState.settingsSlotHandle) {
        try {
            runtimeState.settingsSlotHandle.dispose?.();
        } catch (error) {
            console.error('[Lite Slash Commands] Failed to dispose slot handle', error);
        }
    } else {
        runtimeState.settingsButton?.remove();
    }

    // 4. Clear module-level state so re-activation starts fresh
    resetRuntimeState();
}
