# Cerebr Plugin Template Starter

This is a copy-as-is starter template for building Cerebr developer-mode script plugins.

## What This Folder Includes

```text
statics/dev-plugins/plugin-template-starter/
  README.md
  README.zh-TW.md
  plugin.json
  shell.js
```

- `plugin.json` ships as a shell-plugin manifest, which is the fastest path to a working plugin.
- `shell.js` is a minimal `definePlugin(...)` starter with editor-focused examples.

## Recommended Use

1. Copy this folder to a new plugin id, for example `statics/dev-plugins/local.my-plugin/`.
2. Update `plugin.json`:
   - change `id`
   - change `displayName`
   - change `description`
   - adjust `permissions`
   - choose the right `scope`
   - point `script.entry` at the file you actually want to run
3. Customize `shell.js`.
4. Import the copied manifest path from the developer plugin page.

## Starter Defaults

The included manifest uses:

- `kind: "script"`
- `scope: "shell"`
- `defaultEnabled: false`
- `compatibility.versionRange: ">=2.4.69 <3.0.0"`

Update the version range to match the Cerebr build you tested against.

## Shell vs Page

### Start with `shell`

Choose the default shell starter when your plugin mostly needs:

- `api.editor.focus()`
- `api.editor.setDraft(text)`
- `api.editor.insertText(text, options)`
- `api.editor.importText(text, { focus })`

Typical use cases:

- draft rewriting
- prompt helpers
- input-side pickers
- lightweight authoring tools

### Switch to `page`

Use the existing `statics/dev-plugins/explain-selection/` sample when your plugin needs in-page UI or selection access.

Change `plugin.json` like this:

```json
{
  "scope": "page",
  "requiresExtension": true,
  "permissions": ["page:selection", "shell:input"],
  "script": {
    "entry": "./page.js"
  }
}
```

Then start from:

- `statics/dev-plugins/explain-selection/plugin.json`
- `statics/dev-plugins/explain-selection/page.js`

Typical use cases:

- selection actions
- webpage overlays
- page observation
- sending extracted content into Cerebr

## Install Flow

UI labels below are shown exactly as they appear in the current app localization.

1. Enable `偏好设置 -> 开发者模式`.
2. Open `设置 -> 插件 -> 开发者`.
3. Enter the copied manifest path, for example `/statics/dev-plugins/local.my-plugin/plugin.json`.
4. Click `导入本地插件`.
5. After editing local files, use the plugin page refresh action to reload the plugin.

## Refresh Behavior

- The local plugin manifest is re-fetched with `cache: no-store`.
- The script entry is reloaded with a cache-busting revision token.
- Keep package-local resources on the same origin as the manifest.

## Design Checklist

- Keep the package self-contained.
- Use the runtime APIs before touching private DOM.
- Add `requiresExtension: true` only when the plugin truly depends on the extension host.
- Keep comments in English so future contributors can reuse the starter.
- Document any packaged resources the plugin expects beside the manifest.

## Related Repo Docs

- [`docs/plugin-template-build-flow.md`](../../../docs/plugin-template-build-flow.md)
- [`docs/plugin-system-rfc.md`](../../../docs/plugin-system-rfc.md)
- [`docs/plugin-market-spec.md`](../../../docs/plugin-market-spec.md)
- [`docs/local-script-plugin-dev.md`](../../../docs/local-script-plugin-dev.md)
- `statics/dev-plugins/explain-selection/`
