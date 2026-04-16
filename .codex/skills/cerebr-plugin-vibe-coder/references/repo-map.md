# Cerebr Plugin Repo Map

## Contract Docs

- `docs/plugin-system-rfc.md`
  Use for long-term architecture intent, runtime separation, and what the plugin model is trying to become.
- `docs/plugin-market-spec.md`
  Use for `plugin.json`, registry semantics, compatibility, and the rule that marketplace install must not execute `kind = script`.
- `docs/local-script-plugin-dev.md`
  Use for the current local sideload contract, manifest path expectations, and the recommended folder layout.
- `docs/plugin-template-build-flow.md`
  Use for the condensed workflow learned from the lite slash plugin implementation.

## Runtime Files

- `src/plugin/shell/shell-plugin-runtime.js`
  Read when building `scope = shell` plugins. Current write surface is `api.editor.focus/setDraft/insertText/importText`.
- `src/plugin/page/page-plugin-runtime.js`
  Read when building `scope = page` plugins. Current surfaces include `api.page.watchSelection(...)`, `api.ui.showAnchoredAction(...)`, and `api.shell.*`.
- `src/plugin/dev/local-plugin-service.js`
  Read when a task depends on developer-mode installation, refresh, or same-origin manifest rules.
- `src/plugin/dev/script-plugin-loader.js`
  Read when packaged resources need refresh-aware loading or cache-busting behavior.
- `src/plugin/market/plugin-schema.js`
  Read when checking manifest normalization rules against the runtime implementation.
- `docs/schemas/plugin.schema.json`
  Read when doing a light manifest-shape validation without invoking browser-only helpers.

## Sample Packages

- `statics/dev-plugins/explain-selection/`
  Minimal page plugin example using selection watching and an anchored action.
- `statics/dev-plugins/lite-slash-commands/`
  Larger shell plugin example with packaged JSON data, DOM observation, picker UI, and refresh-aware local resources.
- `statics/dev-plugins/plugin-template-starter/`
  Copy-friendly starter for future shell or page plugins.

## Practical Defaults

- Default to a local developer-mode script plugin when the user wants executable plugin code now.
- Default to `scope = shell` for draft helpers, prompt tools, and editor-side UI.
- Default to `scope = page` for selection tools, overlays, or page observation.
- Default to package-local resources instead of host-owned storage unless the repo already exposes a supported API for that feature.
