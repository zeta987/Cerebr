import { definePlugin } from '../../../src/plugin/shared/define-plugin.js';

export default definePlugin({
    id: 'local.plugin-template-starter',
    setup(api) {
        console.info('[Cerebr][plugin-template-starter] Shell plugin loaded. Copy this folder and customize it before shipping.');

        const example = {
            focusEditor() {
                api.editor.focus();
            },
            replaceDraft(text) {
                api.editor.setDraft(String(text ?? '').trim());
            },
            appendDraft(text) {
                api.editor.insertText(String(text ?? ''), { separator: '\n\n' });
            },
            importBlock(text) {
                api.editor.importText(String(text ?? ''), { focus: true });
            },
        };

        void example;

        return () => {
            console.info('[Cerebr][plugin-template-starter] Shell plugin unloaded.');
        };
    },
});
