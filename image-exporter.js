(function () {
    "use strict";

    /**
     * 匯出指定容器為 PNG 圖片
     * @param {HTMLElement} sourceElement 要截圖的目標根節點 (如 .result-page)
     * @param {string} fileName 下載的檔案名稱 (不含副檔名)
     */
    async function exportToImage(sourceElement, fileName) {
        if (!window.html2canvas) {
            throw new Error("html2canvas 套件載入失敗，無法產出圖片");
        }
        if (!sourceElement) {
            throw new Error("找不到可截圖的結果內容");
        }

        // 1. 建立離屏容器，將節點深度複製一份
        const clone = sourceElement.cloneNode(true);

        // 移除複製節點中不需要截進圖片的元素（如過期提示、操作按鈕）
        const staleNotice = clone.querySelector("#stale-result-notice");
        if (staleNotice) staleNotice.remove();
        const exportBtnArea = clone.querySelector(".result-actions");
        if (exportBtnArea) exportBtnArea.remove();

        // 2. 設定離屏樣式：固定為適合手機與平板閱讀的 750px 寬度，並確保完整展開
        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.top = "0";
        container.style.left = "-9999px";
        container.style.width = "750px";
        container.style.zIndex = "-1000";
        container.style.background = "#ffffff";
        container.style.padding = "24px";
        container.style.boxSizing = "border-box";

        // 強制解開捲軸限制，讓 1人/分組 的表格完整依內容長度撐開
        const scrollContainers = clone.querySelectorAll(
            ".split-result, .result-pane, .solo-result",
        );
        scrollContainers.forEach((el) => {
            el.style.height = "auto";
            el.style.maxHeight = "none";
            el.style.overflow = "visible";
        });

        // 讓分組結果的分割比例在固定 750px 下保持最佳排版
        const splitResult = clone.querySelector(".split-result");
        if (splitResult) {
            splitResult.style.display = "grid";
            splitResult.style.gridTemplateColumns = "280px 1fr";
            splitResult.style.gap = "16px";
        }

        container.appendChild(clone);
        document.body.appendChild(container);

        try {
            // 3. 執行 Canvas 轉換 (scale: 2 相當於 Retina 2x 高解析度輸出)
            const canvas = await window.html2canvas(container, {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                logging: false,
                windowWidth: 750,
            });

            // 4. 觸發下載
            const dataUrl = canvas.toDataURL("image/png");
            const downloadLink = document.createElement("a");
            downloadLink.href = dataUrl;
            downloadLink.download = `${fileName || "排球分隊結果"}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            downloadLink.remove();
        } finally {
            // 5. 確保移除臨時 DOM
            container.remove();
        }
    }

    window.VolyImageExporter = {
        exportToImage,
    };
})();
