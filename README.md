# SST&C 生日會員經營系統

這是 GitHub Pages 可用的正式版靜態網站架構。

## 公開網站入口

- `index.html`：門市使用，負責登入並查詢自己的生日會員名單
- `admin.html`：管理者使用，負責更新會員資料與直接寫回 GitHub

## 更新資料流程

1. 打開線上後台 `admin.html`
2. 上傳 91APP 匯出的會員 CSV，可一次選多份
3. 系統會依 CSV 內的「加入門市名稱」自動分店
4. 系統會依內建店櫃通訊錄規則，帶入「店櫃代號 + 店櫃電話後五碼」作為密碼
5. 確認或修改每家門市密碼
6. 先下載「門市密碼清單」並妥善保存
7. 按「產生加密資料檔」
8. 貼上 GitHub Token，按「直接更新 GitHub」

門市網址不需要更換。門市只要重新整理 `index.html` 對應的 GitHub Pages 網址，就會讀到新的加密資料。

## GitHub Token 權限

後台直接更新 GitHub 需要 GitHub fine-grained personal access token。

建議設定：

- Repository access：只選 `birthday-crm`
- Permissions：Contents 設為 `Read and write`
- Expiration：建議設定到期日

Token 只在瀏覽器當次操作使用，不會寫進網站或資料檔。

## 一鍵更新 GitHub

產生新的 `encrypted-data.js` 後，可以直接執行：

```text
update-github.bat
```

它會自動尋找下載資料夾中最新的 `encrypted-data.js`，複製到 `data/encrypted-data.js`，提交並推送到 GitHub。

如果檔案已經放在 `data/encrypted-data.js`，也可以直接執行同一個腳本。

## 門市使用流程

1. 打開 GitHub Pages 網址
2. 選自己的門市
3. 輸入該門市密碼
4. 查看卡別、生日月份、搜尋、儀表板與匯出名單

## 資料安全

正式版不把原始 CSV 放到 GitHub。

GitHub 上只放：

- 網站程式
- `data/encrypted-data.js`

每家門市資料都各自加密。A 店密碼只能解開 A 店資料，不能解開 B 店資料。

密碼清單請不要上傳 GitHub，建議另外保存於公司內部安全位置。
