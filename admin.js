const adminState = {
  members: [],
  stores: [],
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
};

adminEls.memberFiles.addEventListener("change", handleMemberFiles);
adminEls.generateBtn.addEventListener("click", generateEncryptedData);
adminEls.downloadPasswordsBtn.addEventListener("click", downloadPasswordList);
adminEls.uploadGithubBtn.addEventListener("click", uploadEncryptedDataToGitHub);

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
        code: rule?.code || "",
        phone: rule?.phone || "",
        count: members.length,
        members,
        password: rule?.password || SstcCRM.randomPassword(),
        passwordSource: rule ? "店櫃代號+電話後五碼" : "未對應，系統隨機",
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
  adminEls.passwordRows.innerHTML = adminState.stores.map((store) => `
    <tr>
      <td>${SstcCRM.escapeHtml(store.name)}</td>
      <td>${SstcCRM.escapeHtml(store.code || "-")}</td>
      <td class="orders">${SstcCRM.formatNumber(store.count)}</td>
      <td>
        <input class="password-cell" data-store-id="${SstcCRM.escapeHtml(store.id)}" type="text" value="${SstcCRM.escapeHtml(store.password)}">
      </td>
      <td>${SstcCRM.escapeHtml(store.passwordSource)}</td>
    </tr>
  `).join("");
  adminEls.adminPanel.classList.remove("hidden");
}

async function generateEncryptedData() {
  if (!adminState.stores.length) return;
  syncPasswordsFromTable();
  setStatus("加密資料包產生中...");
  adminEls.generateBtn.disabled = true;

  try {
    const stores = [];
    for (const store of adminState.stores) {
      const encrypted = await SstcCRM.encryptJson({ store: store.name, members: store.members }, store.password);
      stores.push({
        id: store.id,
        name: store.name,
        code: store.code,
        count: store.count,
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
  if (!adminState.stores.length) return;
  syncPasswordsFromTable();
  const rows = [["門市", "店櫃代號", "電話", "會員數", "密碼", "來源"], ...adminState.stores.map((store) => [store.name, store.code, store.phone, store.count, store.password, store.passwordSource])];
  const csv = rows.map((row) => row.map(SstcCRM.csvCell).join(",")).join("\n");
  SstcCRM.downloadText(`門市密碼清單_${SstcCRM.dateStamp()}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function syncPasswordsFromTable() {
  document.querySelectorAll(".password-cell").forEach((input) => {
    const store = adminState.stores.find((item) => item.id === input.dataset.storeId);
    if (store) store.password = input.value.trim() || store.password;
  });
}

function setStatus(text) {
  adminEls.dataStatus.textContent = text;
}

async function uploadEncryptedDataToGitHub() {
  syncPasswordsFromTable();
  if (!adminState.latestPackageText) {
    await buildLatestPackageWithoutDownload();
  }

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
  const stores = [];
  for (const store of adminState.stores) {
    const encrypted = await SstcCRM.encryptJson({ store: store.name, members: store.members }, store.password);
    stores.push({
      id: store.id,
      name: store.name,
      code: store.code,
      count: store.count,
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
