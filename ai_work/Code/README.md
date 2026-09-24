# Voly 第一版

此目錄是一個不需建置工具的純前端網站，可直接部署到 GitHub Pages。

## 檔案

- `index.html`：頁面結構與無障礙標記。
- `style.css`：手機優先響應式樣式。
- `main.js`：應用狀態、表單與結果呈現。
- `interactions.js`：Modal、Toast 與等待遮罩。
- `scheduler.js`：可重現的分隊演算法。
- `storage.js`：Local Storage 及匯入／匯出格式。
- `tests/`：不需第三方套件的排程與儲存測試。

## 本機預覽

請從 repository 根目錄啟動靜態伺服器，再瀏覽：

`http://127.0.0.1:8766/ai_work/Code/`

從 repository 根目錄提供服務是為了讓 `../../fonts/Iansui-Regular.ttf` 能正常載入。

## 拆組標示

演算法會優先維持小組完整。若因人數、公平性而必須拆組，賽程以 `A·成員名` 顯示實際出賽者；同一小組被分到前、後場時，左側小組卡顯示綠橘雙色。

## 第二階段存圖

目前結果內容集中在 `#result-content`，人數與場名則在同一個 `.result-page` 容器。後續可在此容器建立專用的輸出副本、展開兩側捲動內容，再交由 DOM-to-image 類工具轉成 PNG；不需要改動分隊資料格式或演算法。
