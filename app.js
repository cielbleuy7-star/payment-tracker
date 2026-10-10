(() => {
  "use strict";

  const CATEGORIES = ["食費", "日用品", "交通費", "娯楽", "医療", "住居", "通信", "その他"];
  const SUB_CATEGORIES = ["住居", "通信", "娯楽", "日用品", "その他"];

  const STORAGE_TX = "pt_transactions";
  const STORAGE_SUB = "pt_subscriptions";
  const STORAGE_NOTIFY = "pt_notify_enabled";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const yen = (n) => "¥" + Math.round(n).toLocaleString("ja-JP");
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const monthKey = (dateStr) => dateStr.slice(0, 7);
  const monthLabel = (key) => {
    const [y, m] = key.split("-");
    return `${y}年${parseInt(m, 10)}月`;
  };

  function categoryColor(category) {
    const idx = CATEGORIES.indexOf(category);
    const slot = idx >= 0 ? idx + 1 : 8;
    return getComputedStyle(document.documentElement).getPropertyValue(`--series-${slot}`).trim();
  }

  // ---------- storage ----------
  function loadTx() {
    try { return JSON.parse(localStorage.getItem(STORAGE_TX)) || []; }
    catch { return []; }
  }
  function saveTx(list) { localStorage.setItem(STORAGE_TX, JSON.stringify(list)); }

  function loadSubs() {
    try { return JSON.parse(localStorage.getItem(STORAGE_SUB)) || []; }
    catch { return []; }
  }
  function saveSubs(list) { localStorage.setItem(STORAGE_SUB, JSON.stringify(list)); }

  let transactions = loadTx();
  let subscriptions = loadSubs();

  // ---------- category selects ----------
  function fillCategorySelect(selectEl, categories, includeAll) {
    selectEl.innerHTML = "";
    if (includeAll) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "すべてのカテゴリ";
      selectEl.appendChild(opt);
    }
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      selectEl.appendChild(opt);
    });
  }

  // ---------- month options ----------
  function recentMonthKeys(count) {
    const keys = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < count; i++) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      keys.push(`${y}-${m}`);
      d.setMonth(d.getMonth() - 1);
    }
    return keys;
  }

  function fillMonthSelect(selectEl, selected) {
    const existing = new Set(transactions.map((t) => monthKey(t.date)));
    const keys = new Set(recentMonthKeys(12));
    existing.forEach((k) => keys.add(k));
    const sorted = Array.from(keys).sort().reverse();
    selectEl.innerHTML = "";
    sorted.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = monthLabel(k);
      selectEl.appendChild(opt);
    });
    selectEl.value = selected && sorted.includes(selected) ? selected : sorted[0];
  }

  // ---------- tabs ----------
  function switchView(viewId) {
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === viewId));
    $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
    if (viewId === "view-stats") renderStats();
  }
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // ---------- history view ----------
  function renderHistory() {
    const month = $("#filter-month").value;
    const category = $("#filter-category").value;
    const reimbursementOnly = $("#filter-reimbursement").value === "1";
    const list = $("#history-list");
    const empty = $("#history-empty");
    list.innerHTML = "";

    const filtered = transactions
      .filter((t) => !month || monthKey(t.date) === month)
      .filter((t) => !category || t.category === category)
      .filter((t) => !reimbursementOnly || t.reimbursement)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const total = filtered.reduce((sum, t) => sum + t.amount, 0);
    const totalLabel = reimbursementOnly ? "建替払い中の合計" : month ? `${monthLabel(month)}の合計` : "合計";
    $("#history-summary").innerHTML = `${totalLabel}<strong>${yen(total)}</strong>`;

    empty.classList.toggle("hidden", filtered.length > 0);
    if (filtered.length === 0) {
      empty.textContent = reimbursementOnly
        ? "建替払い中の記録はありません。"
        : "まだ記録がありません。右下の「＋」から追加しましょう。";
    }

    filtered.forEach((t) => {
      const li = document.createElement("li");
      const badge = t.reimbursement ? '<span class="badge-reimbursement">建替中</span>' : "";
      li.innerHTML = `
        <span class="item-dot" style="background:${categoryColor(t.category)}"></span>
        <span class="item-main">
          <div class="item-title"><span class="item-title-text">${escapeHtml(t.memo) || t.category}</span>${badge}</div>
          <div class="item-sub">${t.date} ・ ${t.category}</div>
        </span>
        <span class="item-amount">${yen(t.amount)}</span>
        <span class="item-chevron">›</span>
      `;
      li.addEventListener("click", () => openPaymentModal(t));
      list.appendChild(li);
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  $("#filter-month").addEventListener("change", renderHistory);
  $("#filter-category").addEventListener("change", renderHistory);
  $("#filter-reimbursement").addEventListener("change", renderHistory);

  // ---------- payment modal ----------
  const modalPayment = $("#modal-payment");
  const formPayment = $("#form-payment");

  function openPaymentModal(tx) {
    $("#payment-modal-title").textContent = tx ? "支払いを編集" : "支払いを記録";
    $("#payment-id").value = tx ? tx.id : "";
    $("#payment-date").value = tx ? tx.date : todayStr();
    $("#payment-amount").value = tx ? tx.amount : "";
    $("#payment-category").value = tx ? tx.category : CATEGORIES[0];
    $("#payment-memo").value = tx ? tx.memo || "" : "";
    $("#payment-reimbursement").checked = tx ? !!tx.reimbursement : false;
    $("#btn-delete-payment").style.display = tx ? "" : "none";
    modalPayment.classList.remove("hidden");
  }
  function closePaymentModal() { modalPayment.classList.add("hidden"); }

  $("#fab-add").addEventListener("click", () => openPaymentModal(null));
  $("#btn-cancel-payment").addEventListener("click", closePaymentModal);
  modalPayment.addEventListener("click", (e) => { if (e.target === modalPayment) closePaymentModal(); });

  formPayment.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("#payment-id").value || String(Date.now());
    const tx = {
      id,
      date: $("#payment-date").value,
      amount: Number($("#payment-amount").value) || 0,
      category: $("#payment-category").value,
      memo: $("#payment-memo").value.trim(),
      reimbursement: $("#payment-reimbursement").checked,
    };
    const idx = transactions.findIndex((t) => t.id === id);
    if (idx >= 0) transactions[idx] = tx; else transactions.push(tx);
    saveTx(transactions);
    closePaymentModal();
    fillMonthSelect($("#filter-month"), monthKey(tx.date));
    renderHistory();
  });

  $("#btn-delete-payment").addEventListener("click", () => {
    const id = $("#payment-id").value;
    transactions = transactions.filter((t) => t.id !== id);
    saveTx(transactions);
    closePaymentModal();
    renderHistory();
  });

  // ---------- stats view ----------
  let chartCategory = null;
  let chartTrend = null;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderStats() {
    const month = $("#stats-month").value;
    const inMonth = transactions.filter((t) => monthKey(t.date) === month);

    const totalsByCategory = CATEGORIES.map((c) => ({
      category: c,
      total: inMonth.filter((t) => t.category === c).reduce((s, t) => s + t.amount, 0),
    })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);

    $("#stats-empty").classList.toggle("hidden", totalsByCategory.length > 0);
    $("#chart-category").classList.toggle("hidden", totalsByCategory.length === 0);

    if (chartCategory) chartCategory.destroy();
    if (totalsByCategory.length > 0) {
      chartCategory = new Chart($("#chart-category"), {
        type: "bar",
        data: {
          labels: totalsByCategory.map((c) => c.category),
          datasets: [{
            data: totalsByCategory.map((c) => c.total),
            backgroundColor: totalsByCategory.map((c) => categoryColor(c.category)),
            borderRadius: 4,
            maxBarThickness: 28,
          }],
        },
        options: {
          indexAxis: "y",
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => yen(ctx.parsed.x) } },
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { color: cssVar("--text-muted"), precision: 0, callback: (v) => yen(v) },
              grid: { color: cssVar("--gridline") },
            },
            y: {
              ticks: { color: cssVar("--text-primary") },
              grid: { display: false },
            },
          },
        },
      });
    }

    const months = recentMonthKeys(6).reverse();
    const trendTotals = months.map((m) =>
      transactions.filter((t) => monthKey(t.date) === m).reduce((s, t) => s + t.amount, 0)
    );
    if (chartTrend) chartTrend.destroy();
    chartTrend = new Chart($("#chart-trend"), {
      type: "bar",
      data: {
        labels: months.map((m) => monthLabel(m).replace("年", "/").replace("月", "")),
        datasets: [{
          data: trendTotals,
          backgroundColor: cssVar("--series-1"),
          borderRadius: 4,
          maxBarThickness: 36,
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => yen(ctx.parsed.y) } },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: cssVar("--text-muted"), precision: 0, callback: (v) => yen(v) },
            grid: { color: cssVar("--gridline") },
          },
          x: {
            ticks: { color: cssVar("--text-primary") },
            grid: { display: false },
          },
        },
      },
    });
  }

  $("#stats-month").addEventListener("change", renderStats);

  // ---------- subscriptions view ----------
  function nextDueDate(sub) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const day = Math.min(sub.day, 28 + (new Date(y, m + 1, 0).getDate() - 28));
    let due = new Date(y, m, day);
    due.setHours(0, 0, 0, 0);
    const todayMid = new Date(y, now.getMonth(), now.getDate());
    if (due < todayMid) {
      const nm = m + 1;
      const dim = new Date(y, nm + 1, 0).getDate();
      due = new Date(y, nm, Math.min(sub.day, dim));
    }
    return due;
  }

  function renderSubs() {
    const list = $("#sub-list");
    list.innerHTML = "";
    const sorted = [...subscriptions].sort((a, b) => a.day - b.day);
    $("#sub-empty").classList.toggle("hidden", sorted.length > 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    sorted.forEach((sub) => {
      const due = nextDueDate(sub);
      const daysLeft = Math.round((due - today) / 86400000);
      const dueSoon = daysLeft <= 7;
      const li = document.createElement("li");
      if (dueSoon) li.classList.add("sub-due-soon");
      li.innerHTML = `
        <span class="item-dot" style="background:${categoryColor(sub.category)}"></span>
        <span class="item-main">
          <div class="item-title">${escapeHtml(sub.name)}</div>
          <div class="item-sub">毎月${sub.day}日 ・ ${sub.category} ・ 次回 ${daysLeft}日後</div>
        </span>
        <span class="item-amount">${yen(sub.amount)}</span>
        <span class="item-chevron">›</span>
      `;
      li.addEventListener("click", () => openSubModal(sub));
      list.appendChild(li);
    });

    renderReminderBanner(sorted, today);
  }

  function renderReminderBanner(subs, today) {
    const banner = $("#reminder-banner");
    const upcoming = subs
      .map((s) => ({ sub: s, due: nextDueDate(s) }))
      .filter(({ due }) => Math.round((due - today) / 86400000) <= 7)
      .sort((a, b) => a.due - b.due);

    if (upcoming.length === 0) {
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }
    const lines = upcoming.map(({ sub, due }) => {
      const daysLeft = Math.round((due - today) / 86400000);
      const when = daysLeft === 0 ? "本日" : daysLeft < 0 ? `${-daysLeft}日前` : `${daysLeft}日後`;
      return `${sub.name}：${yen(sub.amount)}（${when}）`;
    });
    banner.innerHTML = `🔔 支払い予定<br>${lines.join("<br>")}`;
    banner.classList.remove("hidden");

    if (localStorage.getItem(STORAGE_NOTIFY) === "1" && "Notification" in window && Notification.permission === "granted") {
      const key = "pt_last_notified_" + todayStr();
      if (!sessionStorage.getItem(key)) {
        new Notification("支払いリマインド", { body: lines.join("\n") });
        sessionStorage.setItem(key, "1");
      }
    }
  }

  const modalSub = $("#modal-sub");
  const formSub = $("#form-sub");

  function openSubModal(sub) {
    $("#sub-modal-title").textContent = sub ? "固定費を編集" : "固定費・サブスクを追加";
    $("#sub-id").value = sub ? sub.id : "";
    $("#sub-name").value = sub ? sub.name : "";
    $("#sub-amount").value = sub ? sub.amount : "";
    $("#sub-category").value = sub ? sub.category : SUB_CATEGORIES[0];
    $("#sub-day").value = sub ? sub.day : "";
    $("#btn-delete-sub").style.display = sub ? "" : "none";
    modalSub.classList.remove("hidden");
  }
  function closeSubModal() { modalSub.classList.add("hidden"); }

  $("#btn-add-sub").addEventListener("click", async () => {
    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); localStorage.setItem(STORAGE_NOTIFY, "1"); } catch {}
    }
    openSubModal(null);
  });
  $("#btn-cancel-sub").addEventListener("click", closeSubModal);
  modalSub.addEventListener("click", (e) => { if (e.target === modalSub) closeSubModal(); });

  formSub.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("#sub-id").value || String(Date.now());
    const sub = {
      id,
      name: $("#sub-name").value.trim(),
      amount: Number($("#sub-amount").value) || 0,
      category: $("#sub-category").value,
      day: Math.min(31, Math.max(1, Number($("#sub-day").value) || 1)),
    };
    const idx = subscriptions.findIndex((s) => s.id === id);
    if (idx >= 0) subscriptions[idx] = sub; else subscriptions.push(sub);
    saveSubs(subscriptions);
    closeSubModal();
    renderSubs();
  });

  $("#btn-delete-sub").addEventListener("click", () => {
    const id = $("#sub-id").value;
    subscriptions = subscriptions.filter((s) => s.id !== id);
    saveSubs(subscriptions);
    closeSubModal();
    renderSubs();
  });

  // ---------- settings: backup / restore ----------
  async function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      transactions,
      subscriptions,
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = `payment-tracker-backup-${todayStr()}.json`;

    if (navigator.canShare && typeof File !== "undefined") {
      try {
        const file = new File([json], filename, { type: "application/json" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "支払い管理バックアップ" });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
        // 共有に失敗した場合はダウンロードにフォールバック
      }
    }

    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importDataFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch {
        alert("ファイルの読み込みに失敗しました。正しいバックアップファイルを選択してください。");
        return;
      }
      if (!Array.isArray(data.transactions) || !Array.isArray(data.subscriptions)) {
        alert("バックアップファイルの形式が正しくありません。");
        return;
      }
      const ok = confirm(
        `この端末の現在のデータを置き換えます。\n支払い記録：${data.transactions.length}件\n固定費：${data.subscriptions.length}件\n\nよろしいですか？`
      );
      if (!ok) return;

      transactions = data.transactions;
      subscriptions = data.subscriptions;
      saveTx(transactions);
      saveSubs(subscriptions);
      fillMonthSelect($("#filter-month"), monthKey(todayStr()));
      fillMonthSelect($("#stats-month"), monthKey(todayStr()));
      renderHistory();
      renderSubs();
      alert("データを読み込みました。");
    };
    reader.readAsText(file);
  }

  $("#btn-export").addEventListener("click", exportData);
  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importDataFromFile(file);
    e.target.value = "";
  });

  // ---------- init ----------
  function init() {
    fillCategorySelect($("#payment-category"), CATEGORIES, false);
    fillCategorySelect($("#filter-category"), CATEGORIES, true);
    fillCategorySelect($("#sub-category"), SUB_CATEGORIES, false);
    fillMonthSelect($("#filter-month"), monthKey(todayStr()));
    fillMonthSelect($("#stats-month"), monthKey(todayStr()));
    renderHistory();
    renderSubs();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  }

  init();
})();
