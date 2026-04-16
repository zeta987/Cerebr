# Restore Sidebar Debugger Compat Test Guide

This guide documents the verification flow for the OpenSpec change
`restore-sidebar-debugger-compat` on branch
`fix/v2.4.69-chrome-debugger-compat`.

## Scope

This document is only for the debugger/sidebar compatibility fix branch.

- Branch: `fix/v2.4.69-chrome-debugger-compat`
- OpenSpec change: `restore-sidebar-debugger-compat`
- Out of scope: slash commands, slash command UI, slash command storage,
  slash command backup/import bridge, and any other slash-related work

## Core Rules

Use these rules for every verification run.

1. Build the extension with `build-chrome.ps1` before testing.
2. Reload the unpacked extension from `dist/chrome` after each rebuild.
3. Test on a real webpage with the real injected sidebar.
4. Do not use `/index.html` as the acceptance surface for this change.
5. For reconnection tests, keep the target webpage open and do not refresh it
   after reloading the extension. The point is to validate reinjection into an
   already-open page.

## Build And Reload

### Build

Run from the repo root:

```powershell
pwsh -NoProfile -File .\build-chrome.ps1
```

Expected result:

- unpacked build output is written to `dist/chrome`

### Reload In Chrome

1. Open `chrome://extensions/?id=khckodgjpmpgpaohjeafhafmmbjlkfed`
2. Ensure Developer Mode is enabled
3. Click `重新載入`
4. Confirm the source path is the current repo `dist/chrome`

## Test Environment

Recommended real pages:

- `https://zh.wikipedia.org/wiki/Wikipedia:%E9%A6%96%E9%A1%B5`
- additional related Wikipedia tabs for multi-page context checks

Recommended restricted pages:

- `chrome://extensions/`
- other `chrome://*` pages

Useful debug surfaces:

- Cerebr service worker console from `chrome://extensions/?id=...`
- webpage console on the real target page
- webpage network panel on the real target page

## Real Webpage Validation Principle

This change must be validated through the injected sidebar on a real webpage.

Accepted:

- open Cerebr on a real webpage
- hide/show on a real webpage
- use the toolbar or shortcut on a real webpage
- inspect real-page console/network when Cerebr reads webpage context

Rejected as final acceptance:

- testing only inside `chrome-extension://.../index.html`
- testing only by opening the extension page directly
- testing only with a synthetic page that does not exercise content-script
  injection

## Baseline Regression Check

Use this before the task-specific tests.

1. Open the real webpage, for example the Wikipedia homepage.
2. Open the injected Cerebr sidebar on that webpage.
3. Confirm the sidebar is the real injected iframe, not the standalone
   extension page.
4. Send a simple prompt such as `請總結這個網頁`.
5. Confirm Cerebr can still read the current page content.

## Multi-Page Context Validation

This is the recommended regression check for webpage-content injection behavior.

1. Open multiple real webpage tabs.
2. On the real webpage's injected Cerebr sidebar, open `設定`.
3. Go to `網頁內容`.
4. Enable multiple open tabs that should be readable.
5. Send a prompt that forces Cerebr to list which checked pages it actually
   read.

Suggested prompt:

```text
請列出你目前讀到的所有已勾選分頁標題，並各用一句話總結重點。
如果你沒有真的讀到某頁，就直接說沒讀到，不要猜。
```

Then verify:

- the visible answer matches the selected pages
- real-page console does not show repeated timeout or `isConnected: false`
  for pages that should be readable
- the real-page network request contains the expected webpage-context blocks

If a selected tab is missing from the answer, check for:

- `Tab <id> timed out.`
- `isConnected: false`
- missing webpage-context sections in the chat completion request

## OpenSpec 1.3

`Verify disconnected-tab handling on supported extension pages and graceful
failure on restricted pages`

### Supported Page Reinject Flow

Goal: prove that an already-open real webpage with a stale/disconnected
content script can be reconnected before the sidebar command is dispatched.

Steps:

1. Open a real webpage, for example the Wikipedia homepage.
2. Keep that page open.
3. Reload the extension from `chrome://extensions/?id=...`.
4. Do not refresh the webpage.
5. Trigger a sidebar command on that same page.

You can use:

- the toolbar icon
- the keyboard shortcut `Alt+Z`
- an internal verification harness if you are automating

Expected evidence:

- `标签页未连接，尝试重新注入 content script...`
- `已重新注入 content script`
- the sidebar command succeeds on the real webpage

Pass criteria:

- reinjection succeeds on the already-open supported page
- the sidebar toggles correctly after reinjection

### Restricted Page Graceful Failure

Goal: prove that restricted pages fail cleanly instead of crashing the
background flow.

Steps:

1. Open a restricted page such as `chrome://extensions/`
2. Trigger the toolbar command

Expected evidence:

- `标签页未连接，尝试重新注入 content script...`
- `重新注入 content script 失败: Error: Cannot access a chrome:// URL`
- `标签页 <id> 无法接收 TOGGLE_SIDEBAR_onClicked 命令`

Pass criteria:

- the service worker stays healthy
- the failure is explicit and contained
- no uncaught crash replaces the expected graceful failure path

## OpenSpec 3.2

`Verify toolbar and shortcut commands reinject disconnected content scripts
before dispatching sidebar actions`

This task must be validated on a real webpage, not `/index.html`.

### Toolbar Path

1. Open a real webpage and leave it open.
2. Reload the extension.
3. Do not refresh the webpage.
4. Click the Cerebr toolbar icon.

Expected service worker evidence:

- `扩展图标被点击`
- `标签页未连接，尝试重新注入 content script...`
- `已重新注入 content script`

Expected page evidence:

- the sidebar appears on the real webpage

### Shortcut Path

1. Open a real webpage and leave it open.
2. Reload the extension.
3. Do not refresh the webpage.
4. Return focus to the webpage.
5. Press `Alt+Z`

Expected service worker evidence:

- `onCommand: toggle_sidebar`
- `标签页未连接，尝试重新注入 content script...`
- `已重新注入 content script`

Expected page evidence:

- the sidebar appears on the real webpage

Pass criteria:

- the command event is received first
- reinjection happens before the sidebar action is completed
- the sidebar successfully opens on the real webpage after reinjection

## OpenSpec 3.3

`Verify stale pending iframe commands do not leak into a newly created
sidebar instance`

Goal: prove that commands queued before hide/teardown do not replay into the
fresh iframe after reopen.

### Recommended Flow

1. Open the real webpage sidebar.
2. Queue a command while the iframe is not yet ready.
3. A good candidate is `NEW_CHAT`, because it causes an observable state
   change if it leaks.
4. Immediately hide the sidebar so teardown runs.
5. Reopen the sidebar after teardown completes.
6. Compare the current chat state before and after reopen.

Expected pass behavior:

- the queued command was marked deferred before hide
- after reopen, the old queued command does not run on the fresh iframe
- no unexpected new chat is created
- no unexpected input focus jump occurs from stale `FOCUS_INPUT`

Suggested evidence:

- current chat id remains unchanged across the reopen
- no unexpected `NEW_CHAT` effect appears after the fresh iframe becomes ready

## Claude For Chrome Conflict Scenario

This branch exists to protect the Claude for Chrome debugger/JS tool path from
conflicting with Cerebr's sidebar injection lifecycle.

Recommended integrated check:

1. Open a real webpage such as the Wikipedia homepage.
2. Close Cerebr.
3. In Claude for Chrome, run a JS-capable prompt that visibly changes the page.
4. Example:

```text
將頁面內的文字 `海納百川，有容乃大` 用 javascript 替換成 `claude 測試中`
```

5. After Claude for Chrome completes, reopen Cerebr on that same real webpage.
6. Confirm Cerebr can still read the current page content.
7. If multi-page reading is enabled, confirm selected tabs still load into the
   real request context.

Pass criteria:

- Claude for Chrome can use its JS/debugger path when Cerebr is closed
- reopening Cerebr does not break current-page reading
- reopening Cerebr does not break multi-page context reading

## What To Record In A Test Report

For each run, record:

- branch name
- build timestamp
- whether `build-chrome.ps1` completed successfully
- whether `dist/chrome` was reloaded in Chrome
- exact real webpage used
- whether the page was refreshed after extension reload
- relevant service worker logs
- relevant real-page console logs
- relevant real-page network evidence
- final pass/fail judgment for `1.3`, `3.2`, and `3.3`

## Quick Checklist

- built with `build-chrome.ps1`
- reloaded unpacked extension from `dist/chrome`
- validated on a real webpage
- did not use `/index.html` as the acceptance surface
- verified service worker logs for reinjection
- verified real-page behavior after reopen
- verified real-page webpage-content reading still works
