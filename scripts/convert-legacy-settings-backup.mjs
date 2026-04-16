#!/usr/bin/env node

import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const BACKUP_FORMAT = 'cerebr-backup';
const BACKUP_VERSION = 1;
const LEGACY_FORMAT = 'cerebr-settings';
const LEGACY_SOURCE_NAME = 'Cerebr';
const SLASH_COMMANDS_STORAGE_KEY = 'cerebr_slash_commands_v1';
const SYSTEM_PROMPT_KEY_PREFIX = 'apiConfigSystemPrompt_';
const SYSTEM_PROMPT_LOCAL_ONLY_KEY_PREFIX = 'apiConfigSystemPromptLocalOnly_';
const SYSTEM_PROMPT_SYNC_THRESHOLD_BYTES = 6000;

function printUsage() {
    console.log([
        'Usage:',
        '  node scripts/convert-legacy-settings-backup.mjs <input.json> [output.json] [--env extension|web]',
        '',
        'Examples:',
        '  node scripts/convert-legacy-settings-backup.mjs cerebr-settings-2026-04-08_131704.json',
        '  node scripts/convert-legacy-settings-backup.mjs legacy.json converted.json --env web',
    ].join('\n'));
}

function fail(message) {
    console.error(`Error: ${message}`);
    process.exitCode = 1;
}

function cloneJson(value) {
    return typeof value === 'undefined' ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
    return typeof value === 'string' ? value : '';
}

function normalizeSlashCommandName(value) {
    return normalizeText(value).trim().replace(/^\/+/, '');
}

function normalizeSlashCommand(command = {}, index = 0) {
    const now = Date.now();
    const raw = isPlainObject(command) ? { ...command } : {};
    const fallbackId = `legacy_slash_${index + 1}`;
    const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : now;
    const updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;

    return {
        ...raw,
        id: normalizeText(raw.id).trim() || fallbackId,
        name: normalizeSlashCommandName(raw.name),
        label: normalizeText(raw.label),
        prompt: normalizeText(raw.prompt),
        createdAt,
        updatedAt,
    };
}

function normalizeSlashCommands(commands) {
    if (!Array.isArray(commands)) return [];
    return commands.map((command, index) => normalizeSlashCommand(command, index));
}

function getUtf8ByteLength(value) {
    return Buffer.byteLength(String(value || ''), 'utf8');
}

function normalizeApiConfig(config = {}, index = 0) {
    const raw = isPlainObject(config) ? { ...config } : {};
    const advancedSettings = isPlainObject(raw.advancedSettings)
        ? { ...raw.advancedSettings }
        : {};

    return {
        ...raw,
        id: normalizeText(raw.id).trim() || `legacy_api_${index + 1}`,
        apiKey: normalizeText(raw.apiKey),
        baseUrl: normalizeText(raw.baseUrl),
        modelName: normalizeText(raw.modelName),
        advancedSettings: {
            ...advancedSettings,
            systemPrompt: normalizeText(advancedSettings.systemPrompt),
            isExpanded: advancedSettings.isExpanded ?? false,
            systemPromptLocalOnly: Boolean(advancedSettings.systemPromptLocalOnly),
        },
    };
}

function stripApiConfigForSync(config = {}) {
    const advancedSettings = {
        ...(isPlainObject(config.advancedSettings) ? config.advancedSettings : {}),
    };
    delete advancedSettings.systemPrompt;

    return {
        ...config,
        advancedSettings,
    };
}

function getDefaultOutputPath(inputPath) {
    const parsedPath = path.parse(inputPath);
    return path.join(parsedPath.dir, `${parsedPath.name}.cerebr-backup${parsedPath.ext || '.json'}`);
}

function parseCliArgs(argv) {
    const positional = [];
    let env = 'extension';

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help' || arg === '-h') {
            return { help: true };
        }

        if (arg === '--env') {
            const nextValue = argv[index + 1];
            if (!nextValue) {
                throw new Error('Missing value after --env');
            }
            env = nextValue;
            index += 1;
            continue;
        }

        positional.push(arg);
    }

    if (positional.length === 0) {
        return { help: true };
    }

    if (env !== 'extension' && env !== 'web') {
        throw new Error(`Unsupported environment "${env}". Use "extension" or "web".`);
    }

    const [inputPath, outputPath = getDefaultOutputPath(positional[0])] = positional;
    return { inputPath, outputPath, env, help: false };
}

function isRecognizedLegacySettingsExport(payload) {
    if (!isPlainObject(payload)) return false;
    if (payload.format === BACKUP_FORMAT) return false;

    return Array.isArray(payload.apiConfigs)
        || Array.isArray(payload.slashCommands)
        || isPlainObject(payload.preferences)
        || Object.prototype.hasOwnProperty.call(payload, 'selectedConfigIndex');
}

function buildConvertedBackup(rawSnapshot, env) {
    if (!isRecognizedLegacySettingsExport(rawSnapshot)) {
        throw new Error('Input JSON is not a recognized legacy Cerebr settings export');
    }

    const indexedDb = {};
    const local = {};
    const sync = {};

    const pushLocalValue = (key, value) => {
        if (env === 'extension') {
            local[key] = value;
            return;
        }
        indexedDb[key] = value;
    };

    const normalizedApiConfigs = Array.isArray(rawSnapshot.apiConfigs)
        ? rawSnapshot.apiConfigs.map((config, index) => normalizeApiConfig(config, index))
        : [];

    if (normalizedApiConfigs.length > 0) {
        sync.apiConfigs = normalizedApiConfigs.map((config) => {
            const systemPrompt = normalizeText(config.advancedSettings?.systemPrompt);
            const localOnly = getUtf8ByteLength(systemPrompt) > SYSTEM_PROMPT_SYNC_THRESHOLD_BYTES;
            const stripped = stripApiConfigForSync(config);

            stripped.advancedSettings = {
                ...(isPlainObject(stripped.advancedSettings) ? stripped.advancedSettings : {}),
                systemPromptLocalOnly: localOnly,
            };

            const promptKey = `${SYSTEM_PROMPT_KEY_PREFIX}${config.id}`;
            const localOnlyKey = `${SYSTEM_PROMPT_LOCAL_ONLY_KEY_PREFIX}${config.id}`;

            pushLocalValue(promptKey, systemPrompt);
            sync[promptKey] = localOnly ? '' : systemPrompt;
            sync[localOnlyKey] = localOnly;

            return stripped;
        });
    }

    if (Object.prototype.hasOwnProperty.call(rawSnapshot, 'selectedConfigIndex')) {
        sync.selectedConfigIndex = cloneJson(rawSnapshot.selectedConfigIndex);
    }

    if (isPlainObject(rawSnapshot.preferences)) {
        Object.entries(rawSnapshot.preferences).forEach(([key, value]) => {
            const mappedKey = key === 'panelSiteOverrides' ? 'panelSiteOverridesV1' : key;
            sync[mappedKey] = cloneJson(value);
        });
    }

    if (Array.isArray(rawSnapshot.slashCommands)) {
        pushLocalValue(
            SLASH_COMMANDS_STORAGE_KEY,
            normalizeSlashCommands(rawSnapshot.slashCommands),
        );
    }

    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: typeof rawSnapshot.exportedAt === 'string'
            ? rawSnapshot.exportedAt
            : new Date().toISOString(),
        source: {
            environment: env,
            appVersion: '',
            convertedFrom: LEGACY_FORMAT,
            convertedBy: 'scripts/convert-legacy-settings-backup.mjs',
            legacyVersion: Number.isFinite(rawSnapshot.version) ? rawSnapshot.version : null,
            legacySource: typeof rawSnapshot.source === 'string'
                ? rawSnapshot.source
                : LEGACY_SOURCE_NAME,
        },
        storage: {
            indexedDb,
            local,
            sync,
        },
    };
}

function summarizeBackup(snapshot) {
    return {
        indexedDbKeys: Object.keys(snapshot.storage.indexedDb || {}).length,
        localKeys: Object.keys(snapshot.storage.local || {}).length,
        syncKeys: Object.keys(snapshot.storage.sync || {}).length,
        slashCommands: Array.isArray(snapshot.storage.local?.[SLASH_COMMANDS_STORAGE_KEY])
            ? snapshot.storage.local[SLASH_COMMANDS_STORAGE_KEY].length
            : Array.isArray(snapshot.storage.indexedDb?.[SLASH_COMMANDS_STORAGE_KEY])
                ? snapshot.storage.indexedDb[SLASH_COMMANDS_STORAGE_KEY].length
                : 0,
        apiConfigs: Array.isArray(snapshot.storage.sync?.apiConfigs)
            ? snapshot.storage.sync.apiConfigs.length
            : 0,
    };
}

async function main() {
    let cli;
    try {
        cli = parseCliArgs(process.argv.slice(2));
    } catch (error) {
        fail(error.message);
        printUsage();
        return;
    }

    if (cli.help) {
        printUsage();
        return;
    }

    const inputPath = path.resolve(cli.inputPath);
    const outputPath = path.resolve(cli.outputPath);

    let rawText = '';
    try {
        rawText = await readFile(inputPath, 'utf8');
    } catch (error) {
        fail(`Failed to read "${inputPath}": ${error.message}`);
        return;
    }

    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch (error) {
        fail(`Input file is not valid JSON: ${error.message}`);
        return;
    }

    let converted;
    try {
        converted = buildConvertedBackup(parsed, cli.env);
    } catch (error) {
        fail(error.message);
        return;
    }

    try {
        await writeFile(outputPath, `${JSON.stringify(converted, null, 2)}\n`, 'utf8');
    } catch (error) {
        fail(`Failed to write "${outputPath}": ${error.message}`);
        return;
    }

    console.log(`Converted "${inputPath}" -> "${outputPath}"`);
    console.log(JSON.stringify({
        environment: cli.env,
        output: outputPath,
        summary: summarizeBackup(converted),
    }, null, 2));
}

await main();
