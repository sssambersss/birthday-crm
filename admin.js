const adminState = {
  members: [],
  stores: [],
  sheetPasswords: [],
  latestPackageText: "",
};

const adminEls = {
  dataStatus: document.querySelector("#dataStatus"),
  memberFiles: document.querySelector("#memberFiles"),
  adminPanel: document.querySelector("#adminPanel"),
  metricMembers: document.querySelector("#metricMembers"),
  metricStores: document.querySelector("#metricStores"),
  metricBirthdays: document.querySelector("#metricBirthdays"),
  metricNoStore: document.querySelector("#metricNoStore"),
  passwordRows: document.querySelector("#passwordRows"),
  storeCountText: document.querySelector("#storeCountText"),
  generateBtn: document.querySelector("#generateBtn"),
  downloadPasswordsBtn: document.querySelector("#downloadPasswordsBtn"),
  githubToken: document.querySelector("#githubToken"),
  githubRepo: document.querySelector("#githubRepo"),
  githubBranch: document.querySelector("#githubBranch"),
  uploadGithubBtn: document.querySelector("#uploadGithubBtn"),
  githubStatus: document.querySelector("#githubStatus"),
  sheetUrl: document.querySelector("#sheetUrl"),
  syncSheetBtn: document.querySelector("#syncSheetBtn"),
  sheetStatus: document.querySelector("#sheetStatus"),
};

adminEls.memberFiles.addEventListener("change", handleMemberFiles);
adminEls.generateBtn.addEventListener("click", generateEncryptedData);
adminEls.downloadPasswordsBtn.addEventListener("click", downloadPasswordList);
adminEls.uploadGithubBtn.addEventListener("click", uploadEncryptedDataToGitHub);
adminEls.syncSheetBtn.addEventListener("click", syncPasswordsFromGoogleSheet);
adminEls.passwordRows.addEventListener("input", markPackageDirty);
adminEls.passwordRows.addEventListener("change", markPackageDirty);

loadPasswordsOnOpen();

function markPackageDirty() {
  adminState.latestPackageText = "";
  if (adminEls.githubStatus.textContent === "已更新 GitHub") {
    adminEls.githubStatus.textContent = "有調整，尚未更新 GitHub";
  }
}

async function handleMemberFiles(event) {
  const files = [...event.target.files].filter((file) => file.name.toLowerCase().endsWith(".csv"));
  if (!files.length) return;

  setStatus("讀取會員資料中...");
  const rows = [];
  for (const file of files) {
    const text = await SstcCRM.readCsvText(file);
    const parsed = SstcCRM.parseCsv(text);
    rows.push(...SstcCRM.normalizeRows(parsed, file.name));
  }

  adminState.members = SstcCRM.dedupeMembers(rows);
  const grouped = SstcCRM.groupByStore(adminState.members);
  adminState.stores = [...grouped.entries()]
    .map(([name, members]) => {
      const rule = findPasswordRule(name);
      return {
        id: SstcCRM.storeId(name),
        name,
        code: rule?.storeCode || "",
        storeCode: rule?.storeCode || "",
        employeeCode: rule?.employeeCode || rule?.code || "",
        phone: rule?.phone || "",
        count: members.length,
        members,
        password: makeDefaultPassword(rule),
        dataKey: makeDataKey(name),
        hidden: false,
        passwordSource: rule ? "店號+電話後五碼" : "未對應，系統隨機",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

  renderAdminPanel();
  setStatus(`已匯入 ${SstcCRM.formatNumber(adminState.members.length)} 位會員，${adminState.stores.length} 個門市`);
}

function renderAdminPanel() {
  const birthdayCount = adminState.members.filter((row) => row.birthdayMonth).length;
  const noStoreCount = adminState.members.filter((row) => row.store === "未歸屬門市").length;
  adminEls.metricMembers.textContent = SstcCRM.formatNumber(adminState.members.length);
  adminEls.metricStores.textContent = SstcCRM.formatNumber(adminState.stores.length);
  adminEls.metricBirthdays.textContent = SstcCRM.formatNumber(birthdayCount);
  adminEls.metricNoStore.textContent = SstcCRM.formatNumber(noStoreCount);
  adminEls.storeCountText.textContent = `${SstcCRM.formatNumber(adminState.stores.length)} 家`;
  adminEls.adminPanel.classList.remove("hidden");
  if (adminState.sheetPasswords.length) applySheetPasswordsToStores();
  renderPasswordRowsOnly();
  if (!adminState.sheetPasswords.length && adminEls.sheetUrl.value.trim()) syncPasswordsFromGoogleSheet({ silent: true });
}

async function generateEncryptedData() {
  if (!adminState.stores.length) return;
  setStatus("加密資料包產生中...");
  adminEls.generateBtn.disabled = true;

  try {
    await ensureLatestSheetPasswords();
    if (!adminState.members.length && window.SSTC_ENCRYPTED_DATA) {
      await buildLatestPackageWithoutDownload();
      SstcCRM.downloadText("encrypted-data.js", adminState.latestPackageText, "application/javascript;charset=utf-8");
      setStatus("已產生 hidden 設定更新檔");
      adminEls.githubStatus.textContent = "已產生，尚未更新 GitHub";
      return;
    }
    const stores = [];
    for (const store of adminState.stores) {
      const encrypted = await SstcCRM.encryptJson({ store: store.name, members: store.members }, store.dataKey || store.password);
      stores.push({
        id: store.id,
        name: store.name,
        code: store.storeCode || store.code || "",
        storeCode: store.storeCode || store.code || "",
        employeeCode: store.employeeCode || "",
        count: store.count,
        hidden: Boolean(store.hidden),
        ...encrypted,
      });
    }

    const packageData = {
      version: 1,
      generatedAt: new Date().toISOString(),
      storeCount: stores.length,
      memberCount: adminState.members.length,
      stores,
    };

    const jsonText = JSON.stringify(packageData);
    const jsText = `window.SSTC_ENCRYPTED_DATA = ${jsonText};\n`;
    adminState.latestPackageText = jsText;
    SstcCRM.downloadText("encrypted-data.js", jsText, "application/javascript;charset=utf-8");
    setStatus("已產生 encrypted-data.js");
    adminEls.githubStatus.textContent = "已產生，尚未更新 GitHub";
  } catch (error) {
    alert(`產生失敗：${error.message}`);
    setStatus("產生失敗");
  } finally {
    adminEls.generateBtn.disabled = false;
  }
}

function downloadPasswordList() {
  if (!adminState.stores.length && !adminState.sheetPasswords.length) return;
  syncPasswordsFromTable();
  const sourceRows = adminState.stores.length
    ? adminState.stores.map((store) => [store.name, store.storeCode || store.code, store.employeeCode, store.phone, store.count, store.password, store.dataKey, store.hidden ? "是" : "", store.passwordSource])
    : adminState.sheetPasswords.map((row) => [row.name, row.storeCode || row.code, row.employeeCode, row.phone, "", row.password, row.dataKey, row.hidden ? "是" : "", "Google Sheet"]);
  const rows = [["門市", "店號", "員編", "電話", "會員數", "密碼", "資料鑰匙", "是否隱藏", "來源"], ...sourceRows];
  const csv = rows.map((row) => row.map(SstcCRM.csvCell).join(",")).join("\n");
  SstcCRM.downloadText(`門市密碼清單_${SstcCRM.dateStamp()}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function syncPasswordsFromTable() {
  if (!adminState.stores.length) return;
  document.querySelectorAll(".password-cell").forEach((input) => {
    const store = adminState.stores.find((item) => item.id === input.dataset.storeId);
    if (store) store.password = input.value.trim() || store.password;
  });
  document.querySelectorAll(".hidden-cell").forEach((input) => {
    const store = adminState.stores.find((item) => item.id === input.dataset.storeId);
    if (store) store.hidden = input.checked;
  });
}

async function syncPasswordsFromGoogleSheet(options = {}) {
  const url = adminEls.sheetUrl.value.trim();
  if (!url) {
    if (!options.silent) alert("請貼上 Google Sheet 連結。");
    return;
  }

  adminEls.syncSheetBtn.disabled = true;
  adminEls.sheetStatus.textContent = "同步中...";
  try {
    const rows = await loadGoogleSheetRows(url);
    adminState.sheetPasswords = buildSheetPasswordMap(rows);
    const matched = applySheetPasswordsToStores();
    adminState.latestPackageText = "";
    renderPasswordRowsOnly();
    adminEls.adminPanel.classList.remove("hidden");
    adminEls.sheetStatus.textContent = adminState.stores.length
      ? `已同步 ${matched} / ${adminState.sheetPasswords.length} 家`
      : `已讀取 ${adminState.sheetPasswords.length} 家密碼`;
  } catch (error) {
    adminEls.sheetStatus.textContent = "同步失敗";
    if (!options.silent) alert(error.message);
  } finally {
    adminEls.syncSheetBtn.disabled = false;
  }
}

function renderPasswordRowsOnly() {
  const rows = adminState.stores.length
    ? adminState.stores.map((store) => ({
      id: store.id,
      name: store.name,
      storeCode: store.storeCode || store.code,
      employeeCode: store.employeeCode || "",
      count: store.count,
      password: store.password,
      dataKey: store.dataKey,
      hidden: Boolean(store.hidden),
      source: store.passwordSource,
      passwordEditable: Boolean(store.members),
      hiddenEditable: true,
    }))
    : adminState.sheetPasswords.map((row) => ({
      id: SstcCRM.storeId(row.name),
      name: row.name,
      storeCode: row.storeCode || row.code,
      employeeCode: row.employeeCode || "",
      count: "",
      password: row.password,
      dataKey: row.dataKey || makeDataKey(row.name),
      hidden: Boolean(row.hidden),
      source: "Google Sheet",
      passwordEditable: false,
      hiddenEditable: false,
    }));
  adminEls.storeCountText.textContent = `${SstcCRM.formatNumber(rows.length)} 家`;
  adminEls.passwordRows.innerHTML = rows.map((store) => `
    <tr>
      <td>${SstcCRM.escapeHtml(store.name)}</td>
      <td>${SstcCRM.escapeHtml(store.storeCode || "-")}</td>
      <td>${SstcCRM.escapeHtml(store.employeeCode || "-")}</td>
      <td class="orders">${store.count === "" ? "-" : SstcCRM.formatNumber(store.count)}</td>
      <td>
        <input class="password-cell" data-store-id="${SstcCRM.escapeHtml(store.id)}" type="text" value="${SstcCRM.escapeHtml(store.password)}" ${store.passwordEditable ? "" : "readonly"}>
      </td>
      <td><code>${SstcCRM.escapeHtml(store.dataKey || "")}</code></td>
      <td class="center-cell">
        <input class="hidden-cell" data-store-id="${SstcCRM.escapeHtml(store.id)}" type="checkbox" ${store.hidden ? "checked" : ""} ${store.hiddenEditable ? "" : "disabled"}>
      </td>
      <td>${SstcCRM.escapeHtml(store.source)}</td>
    </tr>
  `).join("");
}

async function loadPasswordsOnOpen() {
  if (!adminEls.sheetUrl.value.trim()) return;
  setStatus("讀取 Google Sheet 密碼表中...");
  await syncPasswordsFromGoogleSheet({ silent: true });
  hydrateStoresFromCurrentPackage();
  if (adminState.sheetPasswords.length) applySheetPasswordsToStores();
  if (adminState.stores.length) renderPasswordRowsOnly();
  if (!adminState.members.length) {
    adminEls.metricMembers.textContent = "0";
    adminEls.metricStores.textContent = SstcCRM.formatNumber(adminState.stores.length);
    adminEls.metricBirthdays.textContent = "0";
    adminEls.metricNoStore.textContent = "0";
    setStatus(adminState.stores.length ? "已載入目前資料包，可調整前台隱藏門市" : "已載入密碼表，尚未匯入會員資料");
  }
}

function hydrateStoresFromCurrentPackage() {
  if (adminState.stores.length || !window.SSTC_ENCRYPTED_DATA?.stores?.length) return;
  adminState.stores = window.SSTC_ENCRYPTED_DATA.stores
    .map((store) => ({
      id: store.id,
      name: store.name,
      code: store.storeCode || store.code || "",
      storeCode: store.storeCode || store.code || "",
      employeeCode: store.employeeCode || "",
      phone: "",
      count: store.count || 0,
      members: null,
      password: "",
      dataKey: "",
      hidden: Boolean(store.hidden),
      passwordSource: "目前資料包",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  adminEls.adminPanel.classList.remove("hidden");
  adminEls.storeCountText.textContent = `${SstcCRM.formatNumber(adminState.stores.length)} 家`;
}

function applySheetPasswordsToStores() {
  if (!adminState.stores.length || !adminState.sheetPasswords.length) return 0;
  let matched = 0;
  for (const store of adminState.stores) {
    const sheetRow = findSheetPasswordRow(store.name, adminState.sheetPasswords);
    if (sheetRow?.password) {
      store.password = sheetRow.password;
      store.dataKey = sheetRow.dataKey || store.dataKey || makeDataKey(store.name);
      store.storeCode = sheetRow.storeCode || sheetRow.code || store.storeCode || store.code || "";
      store.code = store.storeCode;
      store.employeeCode = sheetRow.employeeCode || store.employeeCode || "";
      store.phone = store.phone || sheetRow.phone || "";
      if (sheetRow.hasHiddenSetting) store.hidden = Boolean(sheetRow.hidden);
      store.passwordSource = "Google Sheet";
      matched += 1;
    }
  }
  return matched;
}

function loadGoogleSheetRows(url) {
  const sheetId = extractSheetId(url);
  if (!sheetId) throw new Error("無法辨識 Google Sheet 連結。");
  const callback = `sstcSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callback};out:json`;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet 讀取逾時。請確認分享權限允許讀取。"));
    }, 15000);

    window[callback] = (payload) => {
      cleanup();
      try {
        resolve(gvizToRows(payload));
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("無法讀取 Google Sheet。請確認連結與分享權限。"));
    };
    script.src = src;
    document.body.appendChild(script);

    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }
  });
}

function gvizToRows(payload) {
  const table = payload?.table;
  if (!table?.cols?.length || !table?.rows?.length) throw new Error("Google Sheet 沒有可讀取的表格資料。");
  const headers = table.cols.map((col, index) => SstcCRM.clean(col.label || col.id || `欄位${index + 1}`));
  return table.rows.map((row) => {
    const item = {};
    row.c?.forEach((cell, index) => {
      item[headers[index]] = SstcCRM.clean(cell?.f ?? cell?.v ?? "");
    });
    return item;
  });
}

function buildSheetPasswordMap(rows) {
  return rows
    .map((row) => {
      const hiddenRaw = pickField(row, ["是否隱藏", "隱藏", "前台隱藏", "hide", "hidden"]);
      return {
        name: pickField(row, ["門市", "門市名稱", "店名", "店家"]),
        storeCode: pickField(row, ["店號", "店櫃代號", "代號"]),
        code: pickField(row, ["店號", "店櫃代號", "代號"]),
        employeeCode: pickField(row, ["員編", "員工編號", "櫃員編號"]),
        phone: pickField(row, ["電話", "店櫃電話", "手機"]),
        password: pickField(row, ["密碼", "門市密碼", "password"]),
        dataKey: pickField(row, ["資料鑰匙", "資料金鑰", "解密鑰匙", "dataKey", "key"]),
        hidden: isTruthy(hiddenRaw),
        hasHiddenSetting: hiddenRaw !== "",
      };
    })
    .filter((row) => row.name && row.password);
}

function findSheetPasswordRow(storeName, rows) {
  const strictStore = normalizeStoreName(storeName, true);
  return rows.find((row) => {
    const strictName = normalizeStoreName(row.name, true);
    return strictStore.includes(strictName) || strictName.includes(strictStore);
  }) || rows.find((row) => {
    const looseStore = normalizeStoreName(storeName, false);
    const looseName = normalizeStoreName(row.name, false);
    return looseStore.includes(looseName) || looseName.includes(looseStore);
  });
}

function pickField(row, names) {
  for (const name of names) {
    if (row[name]) return SstcCRM.clean(row[name]);
  }
  return "";
}

function isTruthy(value) {
  return ["是", "yes", "true", "1", "y", "v", "勾選", "隱藏"].includes(String(value || "").trim().toLowerCase());
}

function extractSheetId(url) {
  return String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || "";
}

function setStatus(text) {
  adminEls.dataStatus.textContent = text;
}

async function uploadEncryptedDataToGitHub() {
  await ensureLatestSheetPasswords();
  await buildLatestPackageWithoutDownload();

  const token = adminEls.githubToken.value.trim();
  const repo = adminEls.githubRepo.value.trim();
  const branch = adminEls.githubBranch.value.trim() || "main";
  if (!token || !repo) {
    alert("請先填 GitHub Token 和 Repository。");
    return;
  }

  adminEls.uploadGithubBtn.disabled = true;
  adminEls.githubStatus.textContent = "更新中...";
  try {
    const path = "data/encrypted-data.js";
    const baseUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
    const existing = await fetch(`${baseUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: githubHeaders(token),
    });
    let sha = "";
    if (existing.ok) {
      const info = await existing.json();
      sha = info.sha || "";
    } else if (existing.status !== 404) {
      throw new Error(`讀取 GitHub 目前檔案失敗：${existing.status}`);
    }

    const response = await fetch(baseUrl, {
      method: "PUT",
      headers: githubHeaders(token),
      body: JSON.stringify({
        message: `Update encrypted birthday CRM data ${new Date().toLocaleString("zh-TW", { hour12: false })}`,
        content: base64Utf8(adminState.latestPackageText),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub 更新失敗：${response.status} ${text}`);
    }
    adminEls.githubStatus.textContent = "已更新 GitHub";
    setStatus("已更新 GitHub，Pages 約 1-3 分鐘後生效");
  } catch (error) {
    adminEls.githubStatus.textContent = "更新失敗";
    alert(error.message);
  } finally {
    adminEls.uploadGithubBtn.disabled = false;
  }
}

async function buildLatestPackageWithoutDownload() {
  if (!adminState.stores.length) throw new Error("請先上傳會員 CSV。");
  if (!adminState.members.length && window.SSTC_ENCRYPTED_DATA?.stores?.length) {
    syncPasswordsFromTable();
    const stores = window.SSTC_ENCRYPTED_DATA.stores.map((entry) => {
      const store = adminState.stores.find((item) => item.id === entry.id || item.name === entry.name);
      if (!store) return entry;
      return {
        ...entry,
        code: store.storeCode || store.code || entry.code || "",
        storeCode: store.storeCode || store.code || entry.storeCode || entry.code || "",
        employeeCode: store.employeeCode || entry.employeeCode || "",
        hidden: Boolean(store.hidden),
      };
    });
    const packageData = {
      ...window.SSTC_ENCRYPTED_DATA,
      generatedAt: new Date().toISOString(),
      storeCount: stores.length,
      stores,
    };
    adminState.latestPackageText = `window.SSTC_ENCRYPTED_DATA = ${JSON.stringify(packageData)};\n`;
    return;
  }
  await ensureLatestSheetPasswords();
  const stores = [];
  for (const store of adminState.stores) {
    const encrypted = await SstcCRM.encryptJson({ store: store.name, members: store.members }, store.dataKey || store.password);
    stores.push({
      id: store.id,
      name: store.name,
      code: store.storeCode || store.code || "",
      storeCode: store.storeCode || store.code || "",
      employeeCode: store.employeeCode || "",
      count: store.count,
      hidden: Boolean(store.hidden),
      ...encrypted,
    });
  }
  const packageData = {
    version: 1,
    generatedAt: new Date().toISOString(),
    storeCount: stores.length,
    memberCount: adminState.members.length,
    stores,
  };
  adminState.latestPackageText = `window.SSTC_ENCRYPTED_DATA = ${JSON.stringify(packageData)};\n`;
}

function githubHeaders(token) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function base64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function ensureLatestSheetPasswords() {
  syncPasswordsFromTable();
  const sheetUrl = adminEls.sheetUrl.value.trim();
  if (sheetUrl) {
    await syncPasswordsFromGoogleSheet({ silent: true });
  }
}

function findPasswordRule(storeName) {
  const rules = window.SSTC_STORE_PASSWORD_RULES || [];
  const strictStore = normalizeStoreName(storeName, true);
  const strictMatch = rules.find((rule) => {
    const strictRule = normalizeStoreName(rule.shortName, true);
    return strictStore.includes(strictRule) || strictRule.includes(strictStore);
  });
  if (strictMatch) return strictMatch;

  const looseStore = normalizeStoreName(storeName, false);
  return rules.find((rule) => {
    const looseRule = normalizeStoreName(rule.shortName, false);
    return looseStore.includes(looseRule) || looseRule.includes(looseStore);
  });
}

function normalizeStoreName(value, keepArea) {
  let text = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/lalaport/g, "laport")
    .replace(/[()（）／/\\-]/g, "")
    .replace(/門市|專櫃|outlet|店|正櫃|男女裝|男裝|女裝|混合/g, "")
    .replace(/a1館|a館|sogo|park/g, "");
  if (!keepArea) text = text.replace(/台北|台中|台南|高雄|桃園|新竹|南港|林口/g, "");
  return text;
}

function makeDataKey(storeName) {
  const existing = adminState.sheetPasswords.find((row) => findSheetPasswordRow(storeName, [row]))?.dataKey;
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return `KEY-${[...bytes].map((byte) => chars[byte % chars.length]).join("")}`;
}

function makeDefaultPassword(rule) {
  if (!rule) return SstcCRM.randomPassword();
  if (rule.password) return rule.password;
  const prefix = rule.storeCode || String(rule.employeeCode || rule.code || "").split("/")[0];
  const phoneTail = String(rule.phone || "").replace(/\D/g, "").slice(-5);
  return prefix && phoneTail ? `${prefix}${phoneTail}` : SstcCRM.randomPassword();
}
