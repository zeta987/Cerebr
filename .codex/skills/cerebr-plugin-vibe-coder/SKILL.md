---
name: cerebr-plugin-vibe-coder
description: Create or update Cerebr plugins, plugin starter templates, manifests, and plugin authoring docs in this repo. Use when building a developer-mode local script plugin, deciding between `scope = shell` and `scope = page`, aligning `plugin.json` with Cerebr's runtime and marketplace rules, or packaging a copy-friendly starter for future plugin work.
---

# Cerebr Plugin Vibe Coder

Build Cerebr plugins by starting from the repo starter template, choosing the correct runtime boundary, and keeping manifests plus docs aligned with the current developer-mode contract.

## Workflow Decision Tree

```text
Plugin idea
  |
  +-- Needs editor-side draft or input helpers?
  |      -> start with scope = shell
  |
  +-- Needs page selection, overlay UI, or site-side observation?
         -> start with scope = page
                usually add requiresExtension: true
```

## Core Workflow

1. Read `references/repo-map.md` before changing files.
   Use it to find the real runtime surface, sample plugins, and the docs that define today's contract.

2. Start from `statics/dev-plugins/plugin-template-starter/` unless the user explicitly wants a different structure.
   Copy the folder, rename the plugin id, update `displayName`, `description`, `permissions`, and `script.entry`, then customize the matching entry file.

3. Match the plugin to the correct runtime.
   For `scope = shell`, prefer `api.editor.*` for writes and only read the live editor DOM when no hook exists.
   For `scope = page`, prefer `api.page.*`, `api.ui.showAnchoredAction(...)`, and `api.shell.*` instead of inventing a private bridge.

4. Keep the package self-contained.
   Put plugin-owned configuration beside `plugin.json`.
   Keep `plugin.json` and `script.entry` on the current Cerebr origin.
   Do not design a reviewed marketplace install flow for `kind = script`.

5. Document the authoring and install loop.
   Reusable starters should keep both `README.md` and `README.zh-TW.md`.
   Explain the manifest path, developer-mode import flow, refresh behavior, and any package-local resources.

6. Validate the plugin with the checklist in `references/authoring-checklist.md`.
   At minimum, confirm the manifest shape is correct, the script entry imports as ESM, and any packaged JSON/config files parse cleanly.

## Guardrails

- Keep comments in English.
- Use `requiresExtension: true` only when the plugin truly depends on the extension host.
- Do not assume shell plugins have page APIs.
- Do not assume page plugins can touch the shell editor DOM directly.
- Use the runtime APIs before depending on private DOM structure.
- If a plugin must read undocumented DOM, write that fragility down in the README.

## When To Read More

- Read `references/repo-map.md` when choosing scope, permissions, starter files, or runtime APIs.
- Read `references/authoring-checklist.md` when polishing the manifest, docs, validation, or reuse story.

## Example Requests

- `Use $cerebr-plugin-vibe-coder to turn this idea into a Cerebr shell plugin starter.`
- `Use $cerebr-plugin-vibe-coder to switch this local plugin from shell scope to page scope.`
- `Use $cerebr-plugin-vibe-coder to create a reusable plugin template with dual-language README files.`
