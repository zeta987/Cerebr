# Plugin Template Build Flow

This note summarizes the workflow used to turn the recent lite slash command experiment into a reusable Cerebr plugin starter.

## Inputs We Used

- `docs/plugin-system-rfc.md` for runtime direction and long-term plugin boundaries.
- `docs/plugin-market-spec.md` for package format, compatibility, and developer-mode policy.
- `docs/local-script-plugin-dev.md` for the current sideload contract and expected folder layout.
- `src/plugin/**` for the actual runtime APIs that shell and page plugins can use today.
- `statics/dev-plugins/explain-selection/` as the smallest working page-plugin example.
- `statics/dev-plugins/lite-slash-commands/` as the first larger shell-plugin example.

## Decisions We Reused

- Keep the starter inside `statics/dev-plugins/<plugin-id>/` so it matches the developer-mode import flow.
- Treat `plugin.json` as the stable contract and keep starter manifests aligned with `docs/schemas/plugin.schema.json`.
- Prefer same-origin local script plugins over marketplace install for executable code.
- Keep the template honest about current limits: no hidden prompt injection, no private DOM assumptions beyond the documented local script flow, and no cross-origin script loading.

## Workflow We Followed

1. Map the runtime boundary before writing the plugin package.
   - Confirm whether the feature belongs to `scope = shell` or `scope = page`.
   - Inspect the corresponding runtime (`src/plugin/shell/shell-plugin-runtime.js` or `src/plugin/page/page-plugin-runtime.js`) to see the real APIs.
2. Choose the smallest viable package layout.
   - Start with `plugin.json`.
   - Add exactly one entry file for the default path (`shell.js` here).
   - Add an optional second example file (`page.js`) only when it helps future authors switch scope faster.
3. Keep package-owned resources local.
   - Put reusable configuration beside the plugin package instead of depending on host-owned storage or settings screens.
4. Document the install and refresh loop.
   - Developer mode must be enabled.
   - The manifest path must stay on the current origin.
   - Refresh is the supported way to pick up local file updates.
5. Validate with lightweight checks.
   - Confirm the manifest shape matches the schema contract.
   - Confirm the script entry imports as an ES module.
   - Confirm package-local JSON resources parse cleanly.

## What Made The Lite Slash Plugin Work

- A shell plugin can read the live editor DOM but should write back through `api.editor.*`.
- A page plugin can rely on `api.page.watchSelection(...)` and `api.ui.showAnchoredAction(...)` instead of building its own bridge.
- Local script plugins reload through a cache-busting revision token, so packaged resources can be re-fetched on refresh.

## Pitfalls To Avoid

- Do not design a starter around marketplace execution for `kind = script`; the marketplace spec explicitly blocks that.
- Do not assume shell plugins have page APIs or page plugins have direct editor DOM access.
- Do not hide important setup details in code comments only; the README must explain install, scope choice, and refresh behavior.
- Do not rely on undocumented host internals when an existing runtime API already exists.
