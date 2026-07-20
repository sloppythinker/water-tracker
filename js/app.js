(function () {
  'use strict';

  const STORAGE_KEY = 'mizulog:v1';
  const DEFAULT_GOAL = 2000;

  // ---------- 日付ユーティリティ ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayKey() { return dateKey(new Date()); }

  // ---------- データ層 ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { goal: DEFAULT_GOAL, days: {} };
      const data = JSON.parse(raw);
      if (typeof data.goal !== 'number') data.goal = DEFAULT_GOAL;
      if (!data.days || typeof data.days !== 'object') data.days = {};
      if (!data.reminder || typeof data.reminder !== 'object') data.reminder = { enabled: false, intervalMin: 120 };
      return data;
    } catch (e) {
      return { goal: DEFAULT_GOAL, days: {}, reminder: { enabled: false, intervalMin: 120 } };
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  let state = load();
  let lastAddedId = null;

  function entries(key) { return state.days[key] || []; }
  function dayTotal(key) { return entries(key).reduce((s, e) => s + e.ml, 0); }

  function addEntry(ml) {
    ml = Math.round(ml);
    if (!Number.isFinite(ml) || ml <= 0) return null;
    const key = todayKey();
    if (!state.days[key]) state.days[key] = [];
    const entry = { id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`, ml, t: new Date().toISOString() };
    state.days[key].push(entry);
    lastAddedId = entry.id;
    save(state);
    return entry;
  }

  function removeEntry(id) {
    const key = todayKey();
    const list = state.days[key] || [];
    const i = list.findIndex((e) => e.id === id);
    if (i === -1) return false;
    list.splice(i, 1);
    if (lastAddedId === id) lastAddedId = null;
    save(state);
    return true;
  }

  function undoLast() {
    if (!lastAddedId) return false;
    return removeEntry(lastAddedId);
  }

  function setGoal(ml) {
    ml = Math.round(ml);
    if (!Number.isFinite(ml) || ml < 200) return false;
    state.goal = ml;
    save(state);
    return true;
  }

  function resetToday() {
    state.days[todayKey()] = [];
    lastAddedId = null;
    save(state);
  }

  // ---------- CSV 書き出し ----------
  // 全記録を「日付,時刻,量(ml)」の行にした純粋なCSV文字列を返す
  function buildCSV() {
    const rows = [['日付', '時刻', '量(ml)']];
    Object.keys(state.days).sort().forEach((key) => {
      entries(key).slice().sort((a, b) => (a.t < b.t ? -1 : 1)).forEach((e) => {
        const d = new Date(e.t);
        rows.push([key, `${pad(d.getHours())}:${pad(d.getMinutes())}`, String(e.ml)]);
      });
    });
    return rows.map((r) => r.join(',')).join('\r\n');
  }

  function downloadCSV() {
    const blob = new Blob(['﻿' + buildCSV()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mizulog-${todayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- リマインダー ----------
  let reminderTimer = null;

  function applyReminder() {
    if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
    const r = state.reminder;
    if (!r || !r.enabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    reminderTimer = setInterval(() => {
      if (dayTotal(todayKey()) < state.goal) {
        try {
          new Notification('💧 みずログ', { body: '水分補給の時間です。1杯どうぞ！', icon: 'icons/icon-192.png' });
        } catch (e) { /* noop */ }
      }
    }, r.intervalMin * 60 * 1000);
  }

  function setReminder(enabled, intervalMin) {
    const cur = state.reminder || {};
    state.reminder = { enabled: !!enabled, intervalMin: intervalMin || cur.intervalMin || 120 };
    save(state);
    return state.reminder;
  }

  // 直近7日分（古い→新しい）の { key, total, isToday, dow } を返す純関数
  function lastSevenDays(baseDate) {
    const base = baseDate || new Date();
    const dows = ['日', '月', '火', '水', '木', '金', '土'];
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      const key = dateKey(d);
      out.push({ key, total: dayTotal(key), isToday: key === todayKey(), dow: dows[d.getDay()] });
    }
    return out;
  }

  // ---------- 表示層 ----------
  const $ = (id) => document.getElementById(id);
  let els = {};

  function fmtTime(iso) {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { els.toast.hidden = true; }, 1800);
  }

  function render() {
    const total = dayTotal(todayKey());
    const goal = state.goal;
    const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;
    const met = total >= goal;

    // グラス
    els.glassWater.style.height = pct + '%';
    els.glassWater.classList.toggle('full', met);
    els.glassCurrent.textContent = total;
    els.glassGoal.textContent = `/ ${goal} ml`;
    els.percent.textContent = pct + '%';
    els.remaining.textContent = met
      ? '🎉 目標達成！お疲れさまです'
      : `目標まであと ${goal - total} ml`;

    // 週間チャート
    const week = lastSevenDays();
    const maxVal = Math.max(goal, ...week.map((d) => d.total), 1);
    els.chart.innerHTML = '';
    let sum = 0, counted = 0;
    week.forEach((d) => {
      if (d.total > 0) { sum += d.total; counted++; }
      const h = Math.round((d.total / maxVal) * 100);
      const wrap = document.createElement('div');
      wrap.className = 'bar-wrap';
      wrap.innerHTML =
        `<div class="bar-track"><div class="bar ${d.total >= goal ? 'met' : ''} ${d.isToday ? 'today' : ''}" style="height:${h}%" title="${d.total}ml"></div></div>` +
        `<div class="bar-day ${d.isToday ? 'is-today' : ''}">${d.dow}</div>`;
      els.chart.appendChild(wrap);
    });
    els.weekAvg.textContent = counted ? `平均 ${Math.round(sum / counted)} ml/日` : '';

    // 今日の記録リスト
    const list = entries(todayKey()).slice().reverse();
    els.logList.innerHTML = '';
    els.logEmpty.hidden = list.length > 0;
    list.forEach((e) => {
      const li = document.createElement('li');
      li.className = 'log-item';
      li.innerHTML =
        `<span class="amt">${e.ml} ml</span>` +
        `<span class="time">${fmtTime(e.t)}</span>` +
        `<button class="del" data-id="${e.id}" aria-label="削除">✕</button>`;
      els.logList.appendChild(li);
    });

    els.undoBtn.hidden = !lastAddedId;
  }

  // ---------- イベント ----------
  function bind() {
    document.querySelectorAll('.add-btn[data-amount]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ml = parseInt(btn.dataset.amount, 10);
        addEntry(ml);
        render();
        toast(`+${ml} ml 記録しました`);
      });
    });

    els.logList.addEventListener('click', (e) => {
      const btn = e.target.closest('.del');
      if (!btn) return;
      removeEntry(btn.dataset.id);
      render();
    });

    els.undoBtn.addEventListener('click', () => { undoLast(); render(); toast('取り消しました'); });

    // 設定モーダル
    els.settingsBtn.addEventListener('click', () => {
      els.goalInput.value = state.goal;
      els.reminderToggle.checked = !!(state.reminder && state.reminder.enabled);
      els.reminderInterval.value = String((state.reminder && state.reminder.intervalMin) || 120);
      els.reminderIntervalField.hidden = !els.reminderToggle.checked;
      els.settingsModal.hidden = false;
    });
    els.settingsClose.addEventListener('click', () => { els.settingsModal.hidden = true; });
    els.settingsSave.addEventListener('click', () => {
      if (setGoal(parseInt(els.goalInput.value, 10))) { toast('目標を保存しました'); }
      setReminder(els.reminderToggle.checked, parseInt(els.reminderInterval.value, 10));
      applyReminder();
      els.settingsModal.hidden = true;
      render();
    });

    // リマインダーのトグル（ONにするとき通知許可を要求）
    els.reminderToggle.addEventListener('change', async () => {
      if (els.reminderToggle.checked) {
        if (typeof Notification === 'undefined') { toast('この端末は通知に対応していません'); els.reminderToggle.checked = false; return; }
        let perm = Notification.permission;
        if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
        if (perm !== 'granted') { toast('通知が許可されませんでした'); els.reminderToggle.checked = false; return; }
      }
      els.reminderIntervalField.hidden = !els.reminderToggle.checked;
    });

    // CSV書き出し
    els.exportBtn.addEventListener('click', () => {
      if (buildCSV().split('\r\n').length <= 1) { toast('書き出す記録がありません'); return; }
      downloadCSV();
      toast('CSVを書き出しました');
    });
    document.querySelectorAll('.preset-goals button').forEach((b) => {
      b.addEventListener('click', () => { els.goalInput.value = b.dataset.goal; });
    });
    els.resetToday.addEventListener('click', () => {
      if (confirm('今日の記録をすべて消しますか？')) { resetToday(); els.settingsModal.hidden = true; render(); toast('今日の記録を消しました'); }
    });

    // カスタム入力モーダル
    els.customBtn.addEventListener('click', () => { els.customInput.value = ''; els.customModal.hidden = false; els.customInput.focus(); });
    els.customClose.addEventListener('click', () => { els.customModal.hidden = true; });
    els.customSave.addEventListener('click', () => {
      const ml = parseInt(els.customInput.value, 10);
      if (addEntry(ml)) { toast(`+${ml} ml 記録しました`); els.customModal.hidden = true; render(); }
      else { toast('正しい数値を入力してください'); }
    });
    els.customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.customSave.click(); });

    // モーダル背景クリックで閉じる
    [els.settingsModal, els.customModal].forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; });
    });
  }

  function init() {
    els = {
      glassWater: $('glassWater'), glassCurrent: $('glassCurrent'), glassGoal: $('glassGoal'),
      percent: $('percent'), remaining: $('remaining'),
      chart: $('chart'), weekAvg: $('weekAvg'),
      logList: $('logList'), logEmpty: $('logEmpty'), undoBtn: $('undoBtn'),
      settingsBtn: $('settingsBtn'), settingsModal: $('settingsModal'), settingsClose: $('settingsClose'),
      settingsSave: $('settingsSave'), goalInput: $('goalInput'), resetToday: $('resetToday'),
      reminderToggle: $('reminderToggle'), reminderInterval: $('reminderInterval'), reminderIntervalField: $('reminderIntervalField'),
      exportBtn: $('exportBtn'),
      customBtn: $('customBtn'), customModal: $('customModal'), customClose: $('customClose'),
      customSave: $('customSave'), customInput: $('customInput'),
      toast: $('toast'),
    };
    bind();
    render();
    applyReminder();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // テスト用にロジックを公開
  const api = {
    STORAGE_KEY, todayKey, dateKey, load, save,
    addEntry, removeEntry, undoLast, setGoal, resetToday,
    buildCSV, setReminder, applyReminder,
    dayTotal, entries, lastSevenDays, render, init,
    _state: () => state, _reload: () => { state = load(); lastAddedId = null; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MizuLog = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
