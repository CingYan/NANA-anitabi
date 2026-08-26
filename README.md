# NANA 朝聖地圖

授權：**CC BY-NC-ND 4.0**

你可以分享連結與轉載，但必須標示出處、不得商用、不得改作。

一個先從你自己的朝聖紀錄長出來的靜態小站原型。

## 怎麼用

1. 用瀏覽器打開 `index.html`，或在這個資料夾開個簡單 HTTP server。
2. 改 `data/locations.json`：
   - 放作品場景或你心中的「NANA 感」點位
   - 每筆需要 `id`、`title`、`area`、`lat`、`lng`
3. 改 `data/visits.json`：
   - 用 `locationId` 對到上面的地點
   - 填 `visited`、`visitDate`、`notes`、`photos`
4. 也可以直接在頁面右側編輯，資料會先存到瀏覽器 `localStorage`
5. 編完按「匯出我的紀錄」就能下載一份新的 `visits` JSON

## 資料設計

`locations.json` 放相對穩定的作品/地點資料，`visits.json` 放你自己的到訪紀錄。這樣之後你想：

- 補更多 NANA 場景
- 換成別的作品
- 分享朋友的不同朝聖版本

都比較不會卡死在同一個檔案。

## 建議下一步

- 把每筆加上 `episode` / `chapter` 欄位
- 照片改成縮圖牆
- 加 `day` 欄位，把同一天路線做成 itinerary
- 若你要上線，我可以下一步幫你改成 Vite/React 版再部署

## GitHub 建議

這個資料夾本身已經是乾淨可拆出去的靜態站內容，適合單獨放進一個公開 repo。

- 建議 repo 名稱：`nana-pilgrimage-map`
- 若要 GitHub Pages，根目錄直接放這些檔案就能用
- 你自己的資料可先放在 `data/visits.json`
- 若之後擔心別人直接 fork 搬運，可以再加 watermark、圖片簽名、以及更明顯的來源標記
