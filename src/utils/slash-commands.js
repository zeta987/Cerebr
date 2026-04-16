import { storageAdapter } from './storage-adapter.js';

export const SLASH_COMMANDS_STORAGE_KEY = 'cerebr_slash_commands_v1';

function createSlashCommandId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `slash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value) {
    return typeof value === 'string' ? value : '';
}

export function normalizeSlashCommandName(value) {
    return normalizeText(value).trim().replace(/^\/+/, '');
}

export function getSlashCommandDisplayLabel(command = {}) {
    const name = normalizeSlashCommandName(command.name);
    if (name) return name;

    const label = normalizeText(command.label).trim();
    if (label) return label;

    return normalizeText(command.id).trim();
}

export function matchesSlashCommand(command = {}, query = '') {
    const normalizedQuery = normalizeText(query).trim().toLowerCase();
    if (!normalizedQuery) return true;

    const haystacks = [
        normalizeSlashCommandName(command.name),
        normalizeText(command.label).trim(),
    ];

    return haystacks.some((value) => value && value.toLowerCase().includes(normalizedQuery));
}

export function normalizeSlashCommand(command = {}, { fallbackId } = {}) {
    const now = Date.now();
    const raw = command && typeof command === 'object' && !Array.isArray(command)
        ? { ...command }
        : {};
    const id = normalizeText(raw.id).trim() || fallbackId || createSlashCommandId();
    const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : now;
    const updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;

    return {
        ...raw,
        id,
        name: normalizeSlashCommandName(raw.name),
        label: normalizeText(raw.label),
        prompt: normalizeText(raw.prompt),
        createdAt,
        updatedAt,
    };
}

export function normalizeSlashCommands(commands) {
    if (!Array.isArray(commands)) return [];
    return commands.map((command) => normalizeSlashCommand(command));
}

export function createEmptySlashCommand() {
    const now = Date.now();
    return {
        id: createSlashCommandId(),
        name: '',
        label: '',
        prompt: '',
        createdAt: now,
        updatedAt: now,
    };
}

export async function readSlashCommands({ storage = storageAdapter } = {}) {
    const stored = await storage.get(SLASH_COMMANDS_STORAGE_KEY);
    return normalizeSlashCommands(stored?.[SLASH_COMMANDS_STORAGE_KEY]);
}

export async function writeSlashCommands(commands, { storage = storageAdapter } = {}) {
    const normalized = normalizeSlashCommands(commands);
    await storage.set({ [SLASH_COMMANDS_STORAGE_KEY]: normalized });
    return normalized;
}
