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
    `;

    documentRef.body.appendChild(modal);

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

function buildCommandPreview(command) {
    const summary = normalizeString(command.description) || normalizeString(command.prompt);
    return summary.length > 96 ? `${summary.slice(0, 96)}…` : summary;
}

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
    view: 'list',               // 'list' | 'edit'
    editorDraft: null,          // { isNewDraft, command, hasUnsavedChanges }
    menuOpen: false,            // overflow (⋯) menu visibility
    lastFocusedCardId: null,    // which card was selected before entering edit view
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
        view: 'list',
        editorDraft: null,
        menuOpen: false,
        lastFocusedCardId: null,
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
            applyLocaleToDom();
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
        applyLocaleToDom();

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
        installEditorDirtyTracking();

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
        item.setAttribute('role', 'listitem');

        const tokenEl = document.createElement('div');
        tokenEl.className = 'cerebr-lite-slash-modal__command-token';
        tokenEl.textContent = `/${command.name}`;

        const labelEl = document.createElement('div');
        labelEl.className = 'cerebr-lite-slash-modal__command-label';
        labelEl.textContent = command.label || '';

        const snippetEl = document.createElement('div');
        snippetEl.className = 'cerebr-lite-slash-modal__command-snippet';
        snippetEl.textContent = buildCommandPreview(command);

        item.append(tokenEl, labelEl, snippetEl);
        fragment.appendChild(item);
    });

    chrome.list.appendChild(fragment);
}

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

function renderModal() {
    renderCommandList();
    renderEditorFields();
}

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

async function moveSelectedCommand(direction) {
    const draft = runtimeState.editorDraft;
    if (!draft || draft.isNewDraft) {
        setStatus(t('ui.error_nothing_to_save'), 'error');
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

    addListener(documentRef, 'pointerdown', (event) => {
        if (!runtimeState.menuOpen) return;
        const wrapper = runtimeState.chrome?.menuWrapper;
        if (wrapper && !wrapper.contains(event.target)) {
            hideOverflowMenu();
        }
    }, true);
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
