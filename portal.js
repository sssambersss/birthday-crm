const portalState = {
  package: null,
  currentStore: null,
  currentRows: [],
};

const els = {
  dataStatus: document.querySelector("#dataStatus"),
  storeSelect: document.querySelector("#storeSelect"),
  passwordInput: document.querySelector("#passwordInput"),
  loginBtn: document.querySelector("#loginBtn"),
  loginForm: document.querySelector("#loginForm"),
  loadNotice: document.querySelector("#loadNotice"),
  dashboard: document.querySelector("#dashboard"),
  currentStoreName: document.querySelector("#currentStoreName"),
  currentStoreCode: document.querySelector("#currentStoreCode"),
  logoutBtn: document.querySelector("#logoutBtn"),
  metricMembers: document.querySelector("#metricMembers"),
  metricThisMonth: document.querySelector("#metricThisMonth"),
  metricSales: document.querySelector("#metricSales"),
  metricAvg: document.querySelector("#metricAvg"),
  levelFilter: document.querySelector("#levelFilter"),
  monthFilter: document.querySelector("#monthFilter"),
  searchInput: document.querySelector("#searchInput"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCount: document.querySelector("#resultCount"),
  monthGroups: document.querySelector("#monthGroups"),
  monthChart: document.querySelector("#monthChart"),
  levelChart: document.querySelector("#levelChart"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
};

els.loginForm.addEventListener("submit", handleLogin);
els.logoutBtn.addEventListener("click", logout);
els.levelFilter.addEventListener("change", renderFiltered);
els.monthFilter.addEventListener("change", renderFiltered);
els.searchInput.addEventListener("input", renderFiltered);
els.exportCsvBtn.addEventListener("click", exportCurrentCsv);

seedMonthFilter();
loadEncryptedPackage();

async function loadEncryptedPackage() {
  try {
    if (window.SSTC_ENCRYPTED_DATA) {
      portalState.package = window.SSTC_ENCRYPTED_DATA;
      finishPackageLoad();
      return;
    }
    const response = await fetch("data/encrypted-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("找不到 encrypted-data.json");
    portalState.package = await response.json();
    finishPackageLoad();
  } catch (error) {
    els.dataStatus.textContent = "尚未載入資料";
    els.loadNotice.textContent = "目前找不到加密資料包。請先由管理端產生 encrypted-data.js，並放到 data 資料夾。";
  }
}

function finishPackageLoad() {
  populateStoreSelect();
  els.dataStatus.textContent = `資料更新時間：${new Date(portalState.package.generatedAt).toLocaleString("zh-TW", { hour12: false })}`;
  els.loadNotice.classList.add("hidden");
}

function populateStoreSelect() {
  const stores = [...portalState.package.stores].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  els.storeSelect.innerHTML = stores.map((store) => (
    `<option value="${SstcCRM.escapeHtml(store.id)}">${SstcCRM.escapeHtml(store.name)} (${SstcCRM.formatNumber(store.count)})</option>`
  )).join("");
  els.storeSelect.disabled = false;
  els.passwordInput.disabled = false;
  els.loginBtn.disabled = false;
}

async function handleLogin(event) {
  event.preventDefault();
  const selected = portalState.package?.stores.find((store) => store.id === els.storeSelect.value);
  const password = els.passwordInput.value.trim();
  if (!selected || !password) return;

  els.loginBtn.disabled = true;
  els.loginBtn.textContent = "登入中";
  try {
    const dataKey = await resolveLoginKey(selected, password);
    let decrypted;
    try {
      decrypted = await SstcCRM.decryptJson(selected, dataKey);
    } catch {
      throw new Error("decrypt_failed");
    }
    portalState.currentStore = selected;
    portalState.currentRows = decrypted.members || [];
    renderDashboard();
  } catch (error) {
    alert(error.message === "decrypt_failed"
      ? "密碼驗證成功，但資料包還不是用目前鑰匙產生。請到後台重新產生加密資料並更新 GitHub。"
      : "密碼錯誤，或這不是該門市的密碼。");
  } finally {
    els.loginBtn.disabled = false;
    els.loginBtn.textContent = "進入";
  }
}

async function resolveLoginKey(store, password) {
  const apiUrl = window.SSTC_CONFIG?.authApiUrl?.trim();
  if (!apiUrl) return password;
  const result = await authWithJsonp(apiUrl, {
    store: store.name,
    storeId: store.id,
    password,
  });
  if (!result?.ok || !result.dataKey) {
    throw new Error(result?.error || "invalid_password");
  }
  return result.dataKey;
}

function authWithJsonp(apiUrl, params) {
  const callback = `sstcAuthCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const url = new URL(apiUrl);
  Object.entries({ ...params, callback }).forEach(([key, value]) => url.searchParams.set(key, value));

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("auth_timeout"));
    }, 15000);

    window[callback] = (payload) => {
      cleanup();
      resolve(payload);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("auth_failed"));
    };
    script.src = url.toString();
    document.body.appendChild(script);

    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }
  });
}

function logout() {
  portalState.currentStore = null;
  portalState.currentRows = [];
  els.dashboard.classList.add("hidden");
  els.passwordInput.value = "";
}

function renderDashboard() {
  const rows = portalState.currentRows;
  const nowMonth = new Date().getMonth() + 1;
  const totalSales = SstcCRM.sum(rows, "sales");
  const avgSales = rows.length ? totalSales / rows.length : 0;

  els.currentStoreName.textContent = portalState.currentStore.name;
  els.currentStoreCode.textContent = portalState.currentStore.code ? `店櫃代號 ${portalState.currentStore.code}` : "門市加密資料已解鎖";
  els.metricMembers.textContent = SstcCRM.formatNumber(rows.length);
  els.metricThisMonth.textContent = SstcCRM.formatNumber(rows.filter((row) => row.birthdayMonth === nowMonth).length);
  els.metricSales.textContent = SstcCRM.money(totalSales);
  els.metricAvg.textContent = SstcCRM.money(avgSales);
  els.dashboard.classList.remove("hidden");

  seedLevelFilter(rows);
  els.monthFilter.value = "all";
  els.searchInput.value = "";
  drawCharts(rows);
  renderFiltered();
}

function seedLevelFilter(rows) {
  const levels = [...new Set(rows.map((row) => row.level))].sort(SstcCRM.levelSorter);
  els.levelFilter.innerHTML = `<option value="all">全部卡別</option>` + levels.map((level) => (
    `<option value="${SstcCRM.escapeHtml(level)}">${SstcCRM.escapeHtml(level)}</option>`
  )).join("");
}

function seedMonthFilter() {
  els.monthFilter.innerHTML = `<option value="all">全部月份</option>` + SstcCRM.monthNames.map((name, i) => (
    `<option value="${i + 1}">${name}</option>`
  )).join("");
}

function renderFiltered() {
  const level = els.levelFilter.value;
  const month = els.monthFilter.value;
  const keyword = SstcCRM.clean(els.searchInput.value).toLowerCase();
  let rows = portalState.currentRows.filter((row) => {
    if (level !== "all" && row.level !== level) return false;
    if (month !== "all" && row.birthdayMonth !== Number(month)) return false;
    if (!keyword) return true;
    return [row.name, row.phone, row.email, row.brandId, row.onlineId].some((value) => String(value).toLowerCase().includes(keyword));
  });

  rows = rows.sort((a, b) => (a.birthdayMonth || 99) - (b.birthdayMonth || 99) || (a.birthdayDay || 99) - (b.birthdayDay || 99) || b.sales - a.sales);
  const levelText = level === "all" ? "全部卡別" : level;
  const monthText = month === "all" ? "全部月份" : `${month}月`;
  els.resultTitle.textContent = `${levelText}｜${monthText}`;
  els.resultCount.textContent = `${SstcCRM.formatNumber(rows.length)} 筆`;
  renderMonthGroups(rows, month);
}

function renderMonthGroups(rows, selectedMonth) {
  const months = selectedMonth === "all" ? Array.from({ length: 12 }, (_, i) => i + 1) : [Number(selectedMonth)];
  els.monthGroups.innerHTML = months.map((month) => {
    const monthRows = rows.filter((row) => row.birthdayMonth === month);
    if (!monthRows.length) {
      return `<section class="month-section"><div class="month-title"><span>${month}月</span><span>0 筆</span></div><div class="empty">目前沒有符合條件的會員。</div></section>`;
    }
    return `
      <section class="month-section">
        <div class="month-title"><span>${month}月生日</span><span>${SstcCRM.formatNumber(monthRows.length)} 筆</span></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>生日</th>
                <th>卡別</th>
                <th>姓名</th>
                <th>手機</th>
                <th>Email</th>
                <th>消費</th>
                <th>訂單</th>
                <th>點數</th>
                <th>地區</th>
                <th>註記</th>
              </tr>
            </thead>
            <tbody>${monthRows.map(SstcCRM.renderMemberRow).join("")}</tbody>
          </table>
        </div>
      </section>
    `;
  }).join("");
}

function drawCharts(rows) {
  const months = Array(12).fill(0);
  const levels = new Map();
  for (const row of rows) {
    if (row.birthdayMonth) months[row.birthdayMonth - 1] += 1;
    levels.set(row.level, (levels.get(row.level) || 0) + 1);
  }
  SstcCRM.drawBarChart(els.monthChart, months.map((value, i) => ({ label: `${i + 1}月`, value })), "#c98f95");
  SstcCRM.drawBarChart(els.levelChart, [...levels].sort((a, b) => SstcCRM.levelSorter(a[0], b[0])).map(([label, value]) => ({ label, value })), "#7e7a80");
}

function exportCurrentCsv() {
  const rows = [...document.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.innerText.replace(/\n/g, " ")));
  if (!rows.length) return;
  const header = ["生日", "卡別", "姓名", "手機", "Email", "消費", "訂單", "點數", "地區", "註記"];
  const exportedAt = new Date().toLocaleString("zh-TW", { hour12: false });
  const levelText = els.levelFilter.value === "all" ? "全部卡別" : els.levelFilter.value;
  const monthText = els.monthFilter.value === "all" ? "全部月份" : `${els.monthFilter.value}月`;
  const keywordText = SstcCRM.clean(els.searchInput.value) || "無";
  const metaRows = [
    ["匯出時間", exportedAt],
    ["店家", portalState.currentStore?.name || "未選擇"],
    ["卡別條件", levelText],
    ["生日月份條件", monthText],
    ["搜尋條件", keywordText],
    ["資料筆數", rows.length],
    [],
  ];
  const csv = [...metaRows, header, ...rows].map((row) => row.map(SstcCRM.csvCell).join(",")).join("\n");
  const fileParts = [
    portalState.currentStore?.name || "生日名單",
    levelText,
    monthText,
    `${rows.length}筆`,
    SstcCRM.dateStamp(),
  ].map(SstcCRM.safeFileName).filter(Boolean);
  SstcCRM.downloadText(`${fileParts.join("_")}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}
