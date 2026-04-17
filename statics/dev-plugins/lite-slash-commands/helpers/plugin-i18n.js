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
    // baseUrl is shell.js's import.meta.url (plugin root + '/shell.js').
    // Use './locales/' relative to it so the URL resolves under plugin root.
    const url = new URL(`./locales/${localeCode}.json`, baseUrl);
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
