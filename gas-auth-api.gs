const SHEET_ID = "1pmvL0Z6W0u-L71JTsgGQMdbQDwW9MhSveD6CeOSqs28";
const SHEET_NAME = "";

function doGet(e) {
  const callback = (e.parameter.callback || "").replace(/[^\w.$]/g, "");
  const result = authenticate_(e.parameter.store || "", e.parameter.storeId || "", e.parameter.password || "");
  const body = callback
    ? `${callback}(${JSON.stringify(result)});`
    : JSON.stringify(result);
  return ContentService
    .createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function authenticate_(storeName, storeId, password) {
  if (!password) return { ok: false, error: "missing_password" };

  const sheet = SHEET_NAME
    ? SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME)
    : SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { ok: false, error: "empty_sheet" };

  const headers = values[0].map(v => String(v).trim());
  const rows = values.slice(1).map(row => objectFromRow_(headers, row));
  const normalizedStore = normalizeStore_(storeName);
  const match = rows.find(row => {
    const enabled = pick_(row, ["啟用", "是否啟用", "active"]);
    if (enabled && !["是", "yes", "true", "1", "啟用"].includes(String(enabled).toLowerCase())) return false;
    const rowStore = pick_(row, ["門市", "門市名稱", "店名", "店家"]);
    const rowStoreId = pick_(row, ["storeId", "Store ID", "資料ID"]);
    const sameId = storeId && rowStoreId && storeId === rowStoreId;
    const sameName = rowStore && namesMatch_(normalizedStore, normalizeStore_(rowStore));
    return sameId || sameName;
  });

  if (!match) return { ok: false, error: "store_not_found" };
  const sheetPassword = pick_(match, ["密碼", "門市密碼", "password"]);
  if (String(sheetPassword).trim() !== String(password).trim()) {
    return { ok: false, error: "invalid_password" };
  }

  const dataKey = pick_(match, ["資料鑰匙", "資料金鑰", "解密鑰匙", "dataKey", "key"]);
  if (!dataKey) return { ok: false, error: "missing_data_key" };

  return {
    ok: true,
    store: pick_(match, ["門市", "門市名稱", "店名", "店家"]),
    dataKey,
  };
}

function objectFromRow_(headers, row) {
  const out = {};
  headers.forEach((header, index) => out[header] = row[index] || "");
  return out;
}

function pick_(row, names) {
  for (const name of names) {
    if (row[name]) return String(row[name]).trim();
  }
  return "";
}

function namesMatch_(a, b) {
  return a && b && (a.includes(b) || b.includes(a));
}

function normalizeStore_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/lalaport/g, "laport")
    .replace(/[()（）／/\\-]/g, "")
    .replace(/門市|專櫃|outlet|店|正櫃|男女裝|男裝|女裝|混合/g, "")
    .replace(/a1館|a館|sogo|park/g, "");
}
