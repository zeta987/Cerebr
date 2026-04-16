# Cerebr Plugin Authoring Checklist

## Manifest

- Use `schemaVersion: 1`.
- Set a unique `id`, usually `local.<plugin-name>` for local script plugins.
- Keep `kind: "script"` for developer-mode executable plugins.
- Use `scope: "shell"` or `scope: "page"` only.
- Set `script.entry` to a same-origin relative file.
- Keep `compatibility.versionRange` aligned with the Cerebr version you tested.
- Add `requiresExtension: true` only when the plugin depends on the extension host.

## Package Layout

- Keep the package under `statics/dev-plugins/<plugin-id>/`.
- Put package-local JSON/config beside the manifest.
- Keep reusable starter docs next to the package with `README.md` and `README.zh-TW.md` when the plugin is meant to be copied by others.

## Implementation

- Use `definePlugin({ id, setup(api) })`.
- Prefer runtime APIs before private DOM hooks.
- For shell plugins, write through `api.editor.*`.
- For page plugins, use `api.page.*`, `api.ui.*`, and `api.shell.*`.
- If the plugin needs refresh-aware resources, load them with the same revision token pattern used by the local script loader.

## Validation

- Parse `plugin.json` and package-local JSON resources successfully.
- Confirm the script entry imports as ESM.
- Check the manifest against `docs/schemas/plugin.schema.json` or the runtime manifest rules.
- Manually verify developer-mode import, enable/disable, and refresh behavior.
- Write down any deliberate limitations or DOM fragility in the README.

## Packaging Notes

- Script plugins are for developer mode right now, not standard marketplace install.
- If the deliverable is a starter or template, keep placeholders obvious so future authors know what must be renamed.
