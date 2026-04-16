# Cerebr 外掛範本

這份範本是給 Cerebr 開發者模式 script plugin 用的「直接複製後再修改」基礎範本。

## 這個資料夾包含什麼

```text
statics/dev-plugins/plugin-template-starter/
  README.md
  README.zh-TW.md
  plugin.json
  shell.js
```

- `plugin.json` 預設採用 shell plugin manifest，是最快上手的做法。
- `shell.js` 是最小可用的 `definePlugin(...)` 範例，示範 editor 相關 API。

## 建議使用方式

1. 先把這個資料夾複製成新的 plugin 目錄，例如 `statics/dev-plugins/local.my-plugin/`。
2. 修改清單檔（manifest）`plugin.json`：
   - 換掉 `id`
   - 換掉 `displayName`
   - 換掉 `description`
   - 調整 `permissions`
   - 挑選合適的 `scope`
   - 把 `script.entry` 指到你真正要執行的檔案
3. 依需求修改 `shell.js`。
4. 到 `設定 -> 外掛 -> 開發者` 頁面匯入複製後的 manifest 路徑。

## 預設起手設定

內附的 manifest 目前設定是：

- `kind: "script"`
- `scope: "shell"`
- `defaultEnabled: false`
- `compatibility.versionRange: ">=2.4.69 <3.0.0"`

請把 version range 調整成你實際測試過的 Cerebr 版本。

## Shell 與 Page 怎麼選

### 先從 `shell` 開始

如果你的 plugin 主要需要下面這些能力，直接使用 shell 範本就好：

- `api.editor.focus()`
- `api.editor.setDraft(text)`
- `api.editor.insertText(text, options)`
- `api.editor.importText(text, { focus })`

適合場景：

- 草稿改寫
- prompt helper
- 輸入框附近的小工具
- 輕量寫作輔助

### 需要頁面能力時切到 `page`

如果 plugin 需要網站上的 UI 或選取內容能力，就直接參考 repo 內現成的 `statics/dev-plugins/explain-selection/` page 範例。

`plugin.json` 至少要改成這樣：

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

接著從下面這兩個檔案開始改：

- `statics/dev-plugins/explain-selection/plugin.json`
- `statics/dev-plugins/explain-selection/page.js`

適合場景：

- 選取文字操作
- 網頁浮層
- 頁面觀察
- 把網頁內容送回 Cerebr

## 安裝流程

下面的 UI 文字沿用 app 目前實際顯示的標籤。

1. 開啟 `偏好設定 -> 開發者模式`。
2. 進入 `設定 -> 外掛 -> 開發者`。
3. 輸入複製後的 manifest 路徑，例如 `/statics/dev-plugins/local.my-plugin/plugin.json`。
4. 點選 `匯入本機外掛`。
5. 修改本地檔案後，到開發者頁面點選 `重新載入程式碼` 重新載入外掛。

## Refresh 行為

- 本地 plugin manifest 會用 `cache: no-store` 重新抓取。
- script entry 會帶 cache-busting revision token 重新 import。
- plugin 資料夾裡的所有資源，都要跟 manifest 放在同一個來源底下。

## 設計檢查清單

- 盡量把 plugin 需要的檔案和設定都放在自己的資料夾裡。
- 能用 runtime API 的地方，就先不要碰私有 DOM。
- 只有真的依賴 extension host 時才加 `requiresExtension: true`。
- 程式碼註解保持英文，方便後續重複使用。
- 如果 plugin 需要額外資源，記得在 manifest 同一層的檔案裡寫清楚。

## 相關文件

- [`docs/plugin-template-build-flow.md`](../../../docs/plugin-template-build-flow.md)
- [`docs/plugin-system-rfc.md`](../../../docs/plugin-system-rfc.md)
- [`docs/plugin-market-spec.md`](../../../docs/plugin-market-spec.md)
- [`docs/local-script-plugin-dev.md`](../../../docs/local-script-plugin-dev.md)
- `statics/dev-plugins/explain-selection/`
