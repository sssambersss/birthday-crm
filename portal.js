const portalState = {
  package: null,
  visibleStores: [],
  currentStore: null,
  currentRows: [],
  filteredRows: [],
};

const salesRanges = [
  { id: "all", label: "全部消費", min: 0, max: Infinity },
  { id: "0", label: "未消費", min: 0, max: 0 },
  { id: "1-3000", label: "1-3,000", min: 1, max: 3000 },
  { id: "3001-10000", label: "3,001-10,000", min: 3001, max: 10000 },
  { id: "10001-30000", label: "10,001-30,000", min: 10001, max: 30000 },
  { id: "30001-100000", label: "30,001-100,000", min: 30001, max: 100000 },
  { id: "100001", label: "100,001 以上", min: 100001, max: Infinity },
];

const orderRanges = [
  { id: "all", label: "全部訂單", min: 0, max: Infinity },
  { id: "0", label: "0 次", min: 0, max: 0 },
  { id: "1", label: "1 次", min: 1, max: 1 },
  { id: "2-3", label: "2-3 次", min: 2, max: 3 },
  { id: "4-6", label: "4-6 次", min: 4, max: 6 },
  { id: "7", label: "7 次以上", min: 7, max: Infinity },
];

const contactOptions = [
  { id: "all", label: "全部狀態" },
  { id: "app", label: "已安裝 App" },
  { id: "push", label: "可推播" },
  { id: "sms", label: "可簡訊" },
  { id: "line", label: "已綁 LINE" },
  { id: "no-phone", label: "缺手機" },
  { id: "no-email", label: "缺 Email" },
];

const rankOptions = [
  { id: "birthday", label: "生日排序" },
  { id: "sales-desc", label: "消費高到低" },
  { id: "orders-desc", label: "訂單多到少" },
  { id: "points-desc", label: "點數多到少" },
  { id: "top10", label: "消費前 10 名" },
  { id: "top20", label: "消費前 20 名" },
  { id: "top50", label: "消費前 50 名" },
];

const els = {
  dataStatus: document.querySelector("#dataStatus"),
  storeSearchInput: document.querySelector("#storeSearchInput"),
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
  metricHighValue: document.querySelector("#metricHighValue"),
  metricArea: document.querySelector("#metricArea"),
  metricApp: document.querySelector("#metricApp"),
  metricSms: document.querySelector("#metricSms"),
  levelFilter: document.querySelector("#levelFilter"),
  monthFilter: document.querySelector("#monthFilter"),
  salesRangeFilter: document.querySelector("#salesRangeFilter"),
  orderRangeFilter: document.querySelector("#orderRangeFilter"),
  areaFilter: document.querySelector("#areaFilter"),
  contactFilter: document.querySelector("#contactFilter"),
  rankFilter: document.querySelector("#rankFilter"),
  searchInput: document.querySelector("#searchInput"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCount: document.querySelector("#resultCount"),
  monthGroups: document.querySelector("#monthGroups"),
  monthChart: document.querySelector("#monthChart"),
  levelChart: document.querySelector("#levelChart"),
  salesChart: document.querySelector("#salesChart"),
  areaChart: document.querySelector("#areaChart"),
  topCustomers: document.querySelector("#topCustomers"),
  topCustomerCount: document.querySelector("#topCustomerCount"),
  areaSummary: document.querySelector("#areaSummary"),
  areaSummaryCount: document.querySelector("#areaSummaryCount"),
  segmentMatrix: document.querySelector("#segmentMatrix"),
  matrixCount: document.querySelector("#matrixCount"),
  actionLists: document.querySelector("#actionLists"),
  actionListCount: document.querySelector("#actionListCount"),
  clearFiltersBtn: document.querySelector("#clearFiltersBtn"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
};

els.loginForm.addEventListener("submit", handleLogin);
els.storeSearchInput.addEventListener("input", renderStoreOptions);
els.logoutBtn.addEventListener("click", logout);
els.levelFilter.addEventListener("change", renderFiltered);
els.monthFilter.addEventListener("change", renderFiltered);
els.salesRangeFilter.addEventListener("change", renderFiltered);
els.orderRangeFilter.addEventListener("change", renderFiltered);
els.areaFilter.addEventListener("change", renderFiltered);
els.contactFilter.addEventListener("change", renderFiltered);
els.rankFilter.addEventListener("change", renderFiltered);
els.searchInput.addEventListener("input", renderFiltered);
els.exportCsvBtn.addEventListener("click", exportCurrentCsv);
if (els.clearFiltersBtn) els.clearFiltersBtn.addEventListener("click", resetFilters);

seedMonthFilter();
seedStaticFilters();
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
  portalState.visibleStores = [...portalState.package.stores]
    .filter((store) => isCustomerFacingStore(store))
    .map(enrichStoreMeta)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  renderStoreOptions();
  els.storeSearchInput.disabled = false;
  els.storeSelect.disabled = false;
  els.passwordInput.disabled = false;
  els.loginBtn.disabled = false;
}

function renderStoreOptions() {
  const keyword = normalizeSearchText(els.storeSearchInput.value);
  const stores = portalState.visibleStores.filter((store) => {
    if (!keyword) return true;
    return normalizeSearchText([
      store.name,
      store.storeCode,
      store.code,
      store.employeeCode,
    ].filter(Boolean).join(" ")).includes(keyword);
  });
  if (!stores.length) {
    els.storeSelect.innerHTML = `<option value="">找不到符合的門市</option>`;
    return;
  }
  els.storeSelect.innerHTML = stores.map((store) => (
    `<option value="${SstcCRM.escapeHtml(store.id)}">${SstcCRM.escapeHtml(storeLabel(store))}</option>`
  )).join("");
}

function isCustomerFacingStore(store) {
  const name = String(store.name || "");
  if (!name || name === "未歸屬門市") return false;
  return !store.hidden;
}

function enrichStoreMeta(store) {
  const rule = findPasswordRule(store.name);
  const rawStoreCode = rule?.storeCode || store.storeCode || store.code || "";
  const storeCode = cleanStoreCode(rawStoreCode);
  const employeeCode = store.employeeCode || rule?.employeeCode || (isEmployeeCode(rawStoreCode) ? rawStoreCode : "");
  return {
    ...store,
    code: storeCode,
    storeCode,
    employeeCode,
  };
}

function storeLabel(store) {
  const code = cleanStoreCode(store.storeCode || store.code || "");
  const codeText = code ? `${code}｜` : "";
  return `${codeText}${store.name} (${SstcCRM.formatNumber(store.count)})`;
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
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

function isEmployeeCode(value) {
  return /^T\d{3}(?:\/T\d{3})*$/i.test(String(value || "").trim());
}

function cleanStoreCode(value) {
  const code = String(value || "").trim();
  return isEmployeeCode(code) ? "" : code;
}

async function handleLogin(event) {
  event.preventDefault();
  const selected = portalState.visibleStores.find((store) => store.id === els.storeSelect.value);
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
    portalState.currentRows = (decrypted.members || []).map(enrichMember);
    renderDashboard();
  } catch (error) {
    const messages = {
      decrypt_failed: "密碼驗證成功，但資料包還不是用目前鑰匙產生。請到後台重新產生加密資料並更新 GitHub。",
      store_not_found: "這個門市不在 Google Sheet 密碼表裡，請先確認密碼表是否有這家店。",
      missing_data_key: "Google Sheet 缺少資料鑰匙欄，請重新下載後台產生的密碼清單並補到 Sheet。",
      invalid_password: "密碼錯誤，或這不是該門市的密碼。",
      sheet_access_failed: "密碼表讀取失敗。請確認 Google Apps Script 部署為「以擁有者身分執行」且「任何人」可存取。",
      auth_failed: "密碼驗證服務無法讀取。請確認 Google Apps Script 部署權限。",
      auth_timeout: "密碼驗證逾時。請重新整理後再試，或確認 Google Apps Script 部署權限。",
      package_auth_missing: "目前資料包尚未包含新版登入驗證。請到後台按「同步密碼」後，再按「直接更新 GitHub」。",
    };
    alert(messages[error.message] || "密碼錯誤，或這不是該門市的密碼。");
  } finally {
    els.loginBtn.disabled = false;
    els.loginBtn.textContent = "進入";
  }
}

async function resolveLoginKey(store, password) {
  return resolveLoginKeyFromPackage(store, password);
}

async function resolveLoginKeyFromPackage(store, password) {
  const authList = portalState.package?.auth || [];
  if (!authList.length) throw new Error("package_auth_missing");
  const authEntry = authList.find((entry) => entry.id === store.id || entry.name === store.name);
  if (!authEntry) throw new Error("package_auth_missing");
  try {
    const result = await SstcCRM.decryptJson(authEntry, password);
    if (!result?.dataKey) throw new Error("missing_data_key");
    return result.dataKey;
  } catch (error) {
    if (error.message === "missing_data_key") throw error;
    throw new Error("invalid_password");
  }
}

function logout() {
  portalState.currentStore = null;
  portalState.currentRows = [];
  els.dashboard.classList.add("hidden");
  els.passwordInput.value = "";
}

function enrichMember(row) {
  return {
    ...row,
    birthdayYear: row.birthdayYear || SstcCRM.birthdayYear(row.birthday),
    birthdayMonth: row.birthdayMonth || SstcCRM.birthdayMonth(row.birthday),
    birthdayDay: row.birthdayDay || SstcCRM.birthdayDay(row.birthday),
    age: row.age || SstcCRM.ageFromBirthday(row.birthday),
  };
}

function renderDashboard() {
  const rows = portalState.currentRows;
  const nowMonth = new Date().getMonth() + 1;
  const totalSales = SstcCRM.sum(rows, "sales");
  const avgSales = rows.length ? totalSales / rows.length : 0;
  const highValueFloor = highValueThreshold(rows);
  const withArea = rows.filter((row) => areaName(row)).length;
  const appCount = rows.filter((row) => yesLike(row.app)).length;
  const smsCount = rows.filter((row) => yesLike(row.sms)).length;

  els.currentStoreName.textContent = portalState.currentStore.name;
  const code = cleanStoreCode(portalState.currentStore.storeCode || portalState.currentStore.code || "");
  els.currentStoreCode.textContent = code ? `店號 ${code}` : "門市加密資料已解鎖";
  els.metricMembers.textContent = SstcCRM.formatNumber(rows.length);
  els.metricThisMonth.textContent = SstcCRM.formatNumber(rows.filter((row) => row.birthdayMonth === nowMonth).length);
  els.metricSales.textContent = SstcCRM.money(totalSales);
  els.metricAvg.textContent = SstcCRM.money(avgSales);
  els.metricHighValue.textContent = SstcCRM.formatNumber(rows.filter((row) => row.sales >= highValueFloor && row.sales > 0).length);
  els.metricArea.textContent = SstcCRM.formatNumber(withArea);
  els.metricApp.textContent = percent(appCount, rows.length);
  els.metricSms.textContent = percent(smsCount, rows.length);
  els.dashboard.classList.remove("hidden");

  seedLevelFilter(rows);
  seedAreaFilter(rows);
  resetFilters(false);
  drawCharts(rows);
  renderFiltered();
}

function resetFilters(shouldRender = true) {
  els.levelFilter.value = "all";
  els.monthFilter.value = "all";
  els.salesRangeFilter.value = "all";
  els.orderRangeFilter.value = "all";
  els.areaFilter.value = "all";
  els.contactFilter.value = "all";
  els.rankFilter.value = "birthday";
  els.searchInput.value = "";
  if (shouldRender) renderFiltered();
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

function seedStaticFilters() {
  els.salesRangeFilter.innerHTML = salesRanges.map((range) => `<option value="${range.id}">${range.label}</option>`).join("");
  els.orderRangeFilter.innerHTML = orderRanges.map((range) => `<option value="${range.id}">${range.label}</option>`).join("");
  els.contactFilter.innerHTML = contactOptions.map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
  els.rankFilter.innerHTML = rankOptions.map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
}

function seedAreaFilter(rows) {
  const areas = [...new Set(rows.map(areaName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  els.areaFilter.innerHTML = `<option value="all">全部地區</option>` + areas.map((area) => (
    `<option value="${SstcCRM.escapeHtml(area)}">${SstcCRM.escapeHtml(area)}</option>`
  )).join("");
}

function renderFiltered() {
  const level = els.levelFilter.value;
  const month = els.monthFilter.value;
  const salesRange = salesRanges.find((range) => range.id === els.salesRangeFilter.value) || salesRanges[0];
  const orderRange = orderRanges.find((range) => range.id === els.orderRangeFilter.value) || orderRanges[0];
  const area = els.areaFilter.value;
  const contact = els.contactFilter.value;
  const rank = els.rankFilter.value;
  const keyword = SstcCRM.clean(els.searchInput.value).toLowerCase();
  let rows = portalState.currentRows.filter((row) => {
    if (level !== "all" && row.level !== level) return false;
    if (month !== "all" && row.birthdayMonth !== Number(month)) return false;
    if (!inRange(row.sales, salesRange)) return false;
    if (!inRange(row.orders, orderRange)) return false;
    if (area !== "all" && areaName(row) !== area) return false;
    if (!matchesContact(row, contact)) return false;
    if (!keyword) return true;
    return [row.name, row.phone, row.email, row.brandId, row.onlineId, row.city, row.district, row.note].some((value) => String(value).toLowerCase().includes(keyword));
  });

  rows = sortRows(rows, rank);
  rows = limitRows(rows, rank);
  portalState.filteredRows = rows;
  const levelText = level === "all" ? "全部卡別" : level;
  const monthText = month === "all" ? "全部月份" : `${month}月`;
  const salesText = salesRange.id === "all" ? "全部消費" : salesRange.label;
  els.resultTitle.textContent = `${levelText}｜${monthText}｜${salesText}`;
  els.resultCount.textContent = `${SstcCRM.formatNumber(rows.length)} 筆`;
  renderInsights(rows);
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
                <th>年齡</th>
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

function renderInsights(rows) {
  renderTopCustomers(rows);
  renderAreaSummary(rows);
  renderSegmentMatrix(rows);
  renderActionLists(rows);
}

function renderTopCustomers(rows) {
  const topRows = [...rows].sort((a, b) => b.sales - a.sales || b.orders - a.orders).slice(0, 10);
  els.topCustomerCount.textContent = `${SstcCRM.formatNumber(topRows.length)} 筆`;
  els.topCustomers.innerHTML = `<p class="insight-note">依目前篩選條件，列出累積消費最高的前 10 位。</p>` + (topRows.length ? topRows.map((row, index) => `
    <div class="mini-row">
      <strong><span class="rank-badge">${index + 1}</span>${SstcCRM.escapeHtml(row.name)}</strong>
      <span>${SstcCRM.escapeHtml(row.level)}｜${SstcCRM.money(row.sales)}｜${SstcCRM.formatNumber(row.orders)} 單</span>
    </div>
  `).join("") : `<div class="empty compact-empty">目前沒有符合條件的高價值客人。</div>`);
}

function renderAreaSummary(rows) {
  const areas = countBy(rows, areaName).filter((item) => item.label);
  els.areaSummaryCount.textContent = `${SstcCRM.formatNumber(areas.length)} 區`;
  els.areaSummary.innerHTML = `<p class="insight-note">依會員縣市與行政區統計，排序以人數優先、消費金額次之。</p>` + (areas.slice(0, 10).map((item, index) => `
    <div class="mini-row">
      <strong><span class="rank-badge">${index + 1}</span>${SstcCRM.escapeHtml(item.label)}</strong>
      <span>${SstcCRM.formatNumber(item.count)} 人｜${SstcCRM.money(item.sales)}</span>
    </div>
  `).join("") || `<div class="empty compact-empty">目前沒有地區資料。</div>`);
}

function renderSegmentMatrix(rows) {
  const levels = [...new Set(rows.map((row) => row.level))].sort(SstcCRM.levelSorter);
  const ranges = salesRanges.filter((range) => range.id !== "all" && range.id !== "0");
  els.matrixCount.textContent = `${SstcCRM.formatNumber(rows.length)} 筆`;
  if (!rows.length) {
    els.segmentMatrix.innerHTML = `<div class="empty compact-empty">目前沒有符合條件的資料。</div>`;
    return;
  }
  els.segmentMatrix.innerHTML = `
    <p class="insight-note">交叉比對卡別與累積消費級距，用來看不同卡別的消費分布。</p>
    <div class="matrix-wrap">
      <table class="matrix-table">
        <thead>
          <tr>
            <th>卡別</th>
            ${ranges.map((range) => `<th>${range.label}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${levels.map((level) => `
            <tr>
              <th>${SstcCRM.escapeHtml(level)}</th>
              ${ranges.map((range) => `<td>${SstcCRM.formatNumber(rows.filter((row) => row.level === level && inRange(row.sales, range)).length)}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderActionLists(rows) {
  const nowMonth = new Date().getMonth() + 1;
  const nextMonth = nowMonth === 12 ? 1 : nowMonth + 1;
  const highValueFloor = highValueThreshold(portalState.currentRows);
  const groups = [
    {
      title: "本月生日高消費",
      rows: rows.filter((row) => row.birthdayMonth === nowMonth && row.sales >= highValueFloor).sort((a, b) => b.sales - a.sales),
    },
    {
      title: "下月生日可預約",
      rows: rows.filter((row) => row.birthdayMonth === nextMonth).sort((a, b) => b.sales - a.sales),
    },
    {
      title: "消費高但訂單少",
      rows: rows.filter((row) => row.sales >= highValueFloor && row.orders <= 2).sort((a, b) => b.sales - a.sales),
    },
    {
      title: "有點數可提醒",
      rows: rows.filter((row) => row.points > 0).sort((a, b) => b.points - a.points),
    },
  ].filter((group) => group.rows.length);

  els.actionListCount.textContent = `${SstcCRM.formatNumber(groups.length)} 組`;
  els.actionLists.innerHTML = `<p class="insight-note">系統依生日月份、消費與點數抓出可優先聯繫的客戶群。</p>` + (groups.length ? groups.map((group, index) => {
    const top = group.rows.slice(0, 5);
    return `
      <div class="mini-group">
        <strong><span class="rank-badge">${index + 1}</span>${SstcCRM.escapeHtml(group.title)}：${SstcCRM.formatNumber(group.rows.length)} 人</strong>
        ${top.map((row, rowIndex) => `
          <span class="mini-customer">
            <b>${rowIndex + 1}</b>
            <em>${SstcCRM.escapeHtml(row.name)}</em>
            <small>${SstcCRM.money(row.sales)}｜${SstcCRM.formatBirthday(row.birthday)}</small>
          </span>
        `).join("")}
      </div>
    `;
  }).join("") : `<div class="empty compact-empty">目前沒有可優先經營名單。</div>`);
}

function drawCharts(rows) {
  const months = Array(12).fill(0);
  const levels = new Map();
  const salesBuckets = salesRanges.filter((range) => range.id !== "all").map((range) => ({ label: range.label, value: 0, range }));
  const areas = countBy(rows, areaName).filter((item) => item.label).slice(0, 8);
  for (const row of rows) {
    if (row.birthdayMonth) months[row.birthdayMonth - 1] += 1;
    levels.set(row.level, (levels.get(row.level) || 0) + 1);
    const bucket = salesBuckets.find((item) => inRange(row.sales, item.range));
    if (bucket) bucket.value += 1;
  }
  SstcCRM.drawBarChart(els.monthChart, months.map((value, i) => ({ label: `${i + 1}月`, value })), "#c98f95");
  SstcCRM.drawBarChart(els.levelChart, [...levels].sort((a, b) => SstcCRM.levelSorter(a[0], b[0])).map(([label, value]) => ({ label, value })), "#7e7a80");
  SstcCRM.drawBarChart(els.salesChart, salesBuckets.map(({ label, value }) => ({ label, value })), "#a7785d");
  SstcCRM.drawBarChart(els.areaChart, areas.map((item) => ({ label: item.label.slice(0, 5), value: item.count })), "#7b8794");
}

function exportCurrentCsv() {
  const rows = portalState.filteredRows;
  if (!rows.length) return;
  const header = ["生日", "年齡", "卡別", "姓名", "手機", "Email", "總消費", "門市消費", "線上消費", "訂單", "點數", "縣市", "行政區", "App", "推播", "簡訊", "LINE綁定", "會員編號", "註記"];
  const exportedAt = new Date().toLocaleString("zh-TW", { hour12: false });
  const levelText = els.levelFilter.value === "all" ? "全部卡別" : els.levelFilter.value;
  const monthText = els.monthFilter.value === "all" ? "全部月份" : `${els.monthFilter.value}月`;
  const salesText = (salesRanges.find((range) => range.id === els.salesRangeFilter.value) || salesRanges[0]).label;
  const orderText = (orderRanges.find((range) => range.id === els.orderRangeFilter.value) || orderRanges[0]).label;
  const areaText = els.areaFilter.value === "all" ? "全部地區" : els.areaFilter.value;
  const contactText = contactOptions.find((item) => item.id === els.contactFilter.value)?.label || "全部狀態";
  const rankText = rankOptions.find((item) => item.id === els.rankFilter.value)?.label || "生日排序";
  const keywordText = SstcCRM.clean(els.searchInput.value) || "無";
  const metaRows = [
    ["匯出時間", exportedAt],
    ["店家", portalState.currentStore?.name || "未選擇"],
    ["卡別條件", levelText],
    ["生日月份條件", monthText],
    ["消費級距", salesText],
    ["訂單次數", orderText],
    ["地區條件", areaText],
    ["經營狀態", contactText],
    ["排序條件", rankText],
    ["搜尋條件", keywordText],
    ["資料筆數", rows.length],
    [],
  ];
  const bodyRows = rows.map((row) => [
    SstcCRM.formatBirthday(row.birthday),
    row.age || SstcCRM.ageFromBirthday(row.birthday) || "",
    row.level,
    row.name,
    row.phone,
    row.email,
    row.sales,
    row.storeSales,
    row.onlineSales,
    row.orders,
    row.points,
    row.city,
    row.district,
    row.app,
    row.push,
    row.sms,
    row.lineDate,
    row.brandId || row.onlineId,
    row.note,
  ]);
  const csv = [...metaRows, header, ...bodyRows].map((row) => row.map(SstcCRM.csvCell).join(",")).join("\n");
  const fileParts = [
    portalState.currentStore?.name || "生日名單",
    levelText,
    monthText,
    salesText,
    `${rows.length}筆`,
    SstcCRM.dateStamp(),
  ].map(SstcCRM.safeFileName).filter(Boolean);
  SstcCRM.downloadText(`${fileParts.join("_")}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function inRange(value, range) {
  const number = Number(value) || 0;
  return number >= range.min && number <= range.max;
}

function sortRows(rows, rank) {
  const birthdaySort = (a, b) => (a.birthdayMonth || 99) - (b.birthdayMonth || 99) || (a.birthdayDay || 99) - (b.birthdayDay || 99) || b.sales - a.sales;
  if (rank === "sales-desc" || rank.startsWith("top")) return [...rows].sort((a, b) => b.sales - a.sales || b.orders - a.orders || birthdaySort(a, b));
  if (rank === "orders-desc") return [...rows].sort((a, b) => b.orders - a.orders || b.sales - a.sales || birthdaySort(a, b));
  if (rank === "points-desc") return [...rows].sort((a, b) => b.points - a.points || b.sales - a.sales || birthdaySort(a, b));
  return [...rows].sort(birthdaySort);
}

function limitRows(rows, rank) {
  const match = String(rank).match(/^top(\d+)$/);
  return match ? rows.slice(0, Number(match[1])) : rows;
}

function matchesContact(row, contact) {
  if (contact === "app") return yesLike(row.app);
  if (contact === "push") return yesLike(row.push);
  if (contact === "sms") return yesLike(row.sms);
  if (contact === "line") return Boolean(row.lineDate);
  if (contact === "no-phone") return !row.phone;
  if (contact === "no-email") return !row.email;
  return true;
}

function yesLike(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || ["否", "不", "未", "no", "false", "0"].some((word) => text.includes(word))) return false;
  return ["是", "yes", "true", "1", "y", "有", "已安裝", "同意"].some((word) => text.includes(word.toLowerCase()));
}

function areaName(row) {
  return [row.city, row.district].filter(Boolean).join(" ");
}

function countBy(rows, labeler) {
  const map = new Map();
  for (const row of rows) {
    const label = labeler(row) || "";
    const item = map.get(label) || { label, count: 0, sales: 0 };
    item.count += 1;
    item.sales += Number(row.sales) || 0;
    map.set(label, item);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.sales - a.sales || a.label.localeCompare(b.label, "zh-Hant"));
}

function highValueThreshold(rows) {
  const values = rows.map((row) => Number(row.sales) || 0).filter((value) => value > 0).sort((a, b) => b - a);
  if (!values.length) return Infinity;
  return Math.max(10000, values[Math.min(values.length - 1, Math.floor(values.length * 0.2))]);
}

function percent(count, total) {
  return total ? `${Math.round(count * 100 / total)}%` : "0%";
}
