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
