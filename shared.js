window.SstcCRM = (() => {
  const levelOrder = ["未分級", "普卡", "銀卡", "金卡", "企業尊榮金卡", "黑卡", "金鑽卡", "黑鑽卡"];
  const monthNames = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

  async function readCsvText(file) {
    const buffer = await file.arrayBuffer();
    const candidates = [];
    try {
      candidates.push(new TextDecoder("big5").decode(buffer));
    } catch {
      // UTF-8 fallback below.
    }
    candidates.push(new TextDecoder("utf-8").decode(buffer));
    return candidates.sort((a, b) => csvHeaderScore(b) - csvHeaderScore(a))[0];
  }

  function csvHeaderScore(text) {
    const header = text.split(/\r?\n/, 1)[0] || "";
    return ["姓名", "生日", "會員等級", "加入門市名稱", "手機號碼"].reduce((score, key) => score + (header.includes(key) ? 1 : 0), 0);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === "\"") {
        if (quoted && text[i + 1] === "\"") {
          cell += "\"";
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((items) => items.some((item) => String(item).trim()));
  }

  function normalizeRows(rows, sourceName = "會員 CSV") {
    const headers = rows[0].map((header) => clean(header));
    const index = Object.fromEntries(headers.map((header, i) => [header, i]));
    const required = ["姓名", "手機號碼", "會員等級", "生日", "加入門市名稱"];
    if (!required.every((key) => key in index)) {
      throw new Error(`${sourceName} 欄位不完整，請確認是 91APP 會員名單 CSV`);
    }

    return rows.slice(1).map((row) => {
      const birthday = normalizeBirthday(clean(row[index["生日"]]));
      const store = clean(row[index["加入門市名稱"]]) || "未歸屬門市";
      return {
        id: clean(row[index["品牌會員編號"]]) || clean(row[index["線上會員編號"]]) || `${sourceName}-${Math.random()}`,
        onlineId: clean(row[index["線上會員編號"]]),
        brandId: clean(row[index["品牌會員編號"]]),
        name: clean(row[index["姓名"]]) || "未填姓名",
        gender: clean(row[index["性別"]]),
        phone: clean(row[index["手機號碼"]]),
        email: clean(row[index["Email"]]),
        city: clean(row[index["縣市"]]),
        district: clean(row[index["行政區"]]),
        app: clean(row[index["是否安裝 App"]]),
        push: clean(row[index["是否接收活動推播"]]),
        sms: clean(row[index["是否接收活動簡訊"]]),
        lineDate: clean(row[index["綁定 LINE 帳號日期"]]),
        points: toNumber(row[index["可用點數"]]),
        level: clean(row[index["會員等級"]]) || "未分級",
        levelExpire: clean(row[index["會員等級到期日"]]),
        birthday,
        birthdayYear: birthdayYear(birthday),
        birthdayMonth: birthdayMonth(birthday),
        birthdayDay: birthdayDay(birthday),
        age: ageFromBirthday(birthday),
        registerChannel: clean(row[index["註冊管道"]]),
        store,
        sales: toNumber(row[index["訂單金額 (TG)"]]),
        storeSales: toNumber(row[index["門市訂單金額 (TG)"]]),
        onlineSales: toNumber(row[index["線上訂單金額 (TG)"]]),
        orders: toNumber(row[index["訂單數 (TG)"]]),
        note: clean(row[index["門市註記"]]) || clean(row[index["共用註記"]]),
      };
    });
  }

  function dedupeMembers(rows) {
    const seen = new Map();
    for (const row of rows) {
      const key = row.brandId || row.onlineId || `${row.name}-${row.phone}-${row.birthday}`;
      const existing = seen.get(key);
      if (!existing || row.sales > existing.sales) seen.set(key, row);
    }
    return [...seen.values()];
  }

  function groupByStore(rows) {
    const stores = new Map();
    for (const row of rows) {
      if (!stores.has(row.store)) stores.set(row.store, []);
      stores.get(row.store).push(row);
    }
    return stores;
  }

  async function encryptJson(value, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const encoded = new TextEncoder().encode(JSON.stringify(value));
    const compressed = await compressBytes(encoded);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, compressed.bytes);
    return {
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      compression: compressed.compression,
      ciphertext: bytesToBase64(new Uint8Array(cipher)),
    };
  }

  async function decryptJson(entry, password) {
    const salt = base64ToBytes(entry.salt);
    const iv = base64ToBytes(entry.iv);
    const cipher = base64ToBytes(entry.ciphertext);
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    const bytes = await decompressBytes(new Uint8Array(plain), entry.compression);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function compressBytes(bytes) {
    if (!("CompressionStream" in window)) return { bytes, compression: "none" };
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), compression: "gzip" };
  }

  async function decompressBytes(bytes, compression) {
    if (compression !== "gzip") return bytes;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function deriveKey(password, salt) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 180000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  function randomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return `SSTC-${[...bytes].map((byte) => chars[byte % chars.length]).join("")}`;
  }

  function storeId(name) {
    let hash = 2166136261;
    for (const char of String(name)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `store-${(hash >>> 0).toString(36)}`;
  }

  function renderMemberRow(row) {
    const area = [row.city, row.district].filter(Boolean).join(" ");
    const age = row.age || ageFromBirthday(row.birthday) || "";
    return `
      <tr>
        <td data-label="生日">${escapeHtml(formatBirthday(row.birthday))}</td>
        <td data-label="年齡" class="orders">${escapeHtml(age || "-")}</td>
        <td data-label="卡別"><span class="level-badge">${escapeHtml(row.level)}</span></td>
        <td data-label="姓名">${escapeHtml(row.name)}<br><small>${escapeHtml(row.brandId || row.onlineId)}</small></td>
        <td data-label="手機">${escapeHtml(row.phone)}</td>
        <td data-label="Email">${escapeHtml(row.email)}</td>
        <td data-label="消費" class="money">${money(row.sales)}</td>
        <td data-label="訂單" class="orders">${formatNumber(row.orders)}</td>
        <td data-label="點數" class="orders">${formatNumber(row.points)}</td>
        <td data-label="地區">${escapeHtml(area)}</td>
        <td data-label="註記">${escapeHtml(row.note)}</td>
      </tr>
    `;
  }

  function drawBarChart(canvas, data, color) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    const targetWidth = Math.max(1, Math.round(width * dpr));
    const targetHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const max = Math.max(1, ...data.map((item) => item.value));
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#e8d6d7";
    ctx.lineWidth = 1;
    const left = 48;
    const right = 16;
    const top = 24;
    const bottom = data.some((item) => labelLines(item.label).length > 1) ? 78 : 54;
    const baseline = height - bottom;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, baseline);
    ctx.lineTo(width - right, baseline);
    ctx.stroke();
    const gap = 12;
    const chartWidth = width - left - right - 8;
    const barWidth = Math.max(18, (chartWidth - gap * (data.length - 1)) / data.length);
    data.forEach((item, index) => {
      const x = 56 + index * (barWidth + gap);
      const barHeight = Math.round((height - bottom - top - 18) * item.value / max);
      const y = baseline - barHeight;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillStyle = "#353238";
      ctx.font = "18px Arial";
      ctx.textAlign = "center";
      ctx.fillText(formatNumber(item.value), x + barWidth / 2, Math.max(18, y - 8));
      ctx.fillStyle = "#847b80";
      ctx.font = "15px Arial";
      labelLines(item.label).forEach((line, lineIndex) => {
        ctx.fillText(line, x + barWidth / 2, baseline + 26 + lineIndex * 18);
      });
    });
  }

  function labelLines(label) {
    const text = String(label || "");
    if (!text) return [""];
    if (text.includes(" ")) return text.split(/\s+/).filter(Boolean).slice(0, 2);
    if (text.length <= 5) return [text];
    return [text.slice(0, 5), text.slice(5, 10)];
  }

  function downloadText(filename, text, type = "application/json;charset=utf-8") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function birthdayMonth(value) {
    const match = String(value).replace(/[/.]/g, "-").match(/^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/);
    return match ? Number(match[1]) : 0;
  }

  function birthdayDay(value) {
    const match = String(value).replace(/[/.]/g, "-").match(/^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/);
    return match ? Number(match[2]) : 0;
  }

  function birthdayYear(value) {
    const match = String(value).replace(/[/.]/g, "-").match(/^(\d{4})-/);
    return match ? Number(match[1]) : 0;
  }

  function ageFromBirthday(value) {
    const year = birthdayYear(value);
    const month = birthdayMonth(value);
    const day = birthdayDay(value);
    if (!year || !month || !day) return 0;
    const now = new Date();
    let age = now.getFullYear() - year;
    if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
    return age > 0 && age < 120 ? age : 0;
  }

  function formatBirthday(value) {
    const text = String(value).replace(/[/.]/g, "-");
    const full = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (full) return `${full[1]}/${String(Number(full[2])).padStart(2, "0")}/${String(Number(full[3])).padStart(2, "0")}`;
    const partial = text.match(/^(\d{1,2})-(\d{1,2})$/);
    if (partial) return `${Number(partial[1])}/${Number(partial[2])}`;
    return value || "-";
  }

  function normalizeBirthday(value) {
    const text = clean(value).replace(/\./g, "/").replace(/-/g, "/");
    let match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
    match = text.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (match) return `${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
    return value;
  }

  function clean(value) {
    return String(value ?? "").replace(/^\uFEFF/, "").trim();
  }

  function toNumber(value) {
    const number = Number(String(value ?? "").replace(/,/g, "").trim());
    return Number.isFinite(number) ? number : 0;
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  }

  function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString("zh-TW");
  }

  function money(value) {
    return `$${formatNumber(value)}`;
  }

  function levelSorter(a, b) {
    const ai = levelOrder.indexOf(a);
    const bi = levelOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b, "zh-Hant");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
  }

  function dateStamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  function safeFileName(value) {
    return String(value).replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function base64ToBytes(value) {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }

  return {
    levelOrder,
    monthNames,
    readCsvText,
    parseCsv,
    normalizeRows,
    dedupeMembers,
    groupByStore,
    encryptJson,
    decryptJson,
    randomPassword,
    storeId,
    renderMemberRow,
    drawBarChart,
    downloadText,
    birthdayMonth,
    birthdayDay,
    birthdayYear,
    ageFromBirthday,
    formatBirthday,
    clean,
    toNumber,
    sum,
    formatNumber,
    money,
    levelSorter,
    escapeHtml,
    csvCell,
    dateStamp,
    safeFileName,
  };
})();
