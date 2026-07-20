// jsdom で主要フローを実行レベルで検証する（静的チェックではなく実際にクリックさせる）
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}

function boot() {
  // 各テストで localStorage を分離するため毎回新しい JSDOM を生成
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/', storageQuota: 10000000 });
  const { window } = dom;
  window.localStorage.clear();
  window.confirm = () => true;
  // app.js を window コンテキストで実行
  const runScript = new window.Function(appJs);
  runScript.call(window);
  // jsdom は readyState が 'loading' のままなので DOMContentLoaded を手動発火して init() を走らせる
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return window;
}

console.log('■ 初期状態');
{
  const w = boot();
  ok(w.document.getElementById('glassCurrent').textContent === '0', '開始時の合計は 0 ml');
  ok(w.document.getElementById('logEmpty').hidden === false, '記録なしメッセージが表示される');
  ok(w.MizuLog._state().goal === 2000, 'デフォルト目標は 2000 ml');
}

console.log('■ クイック追加ボタン');
{
  const w = boot();
  w.document.querySelector('.add-btn[data-amount="200"]').click();
  w.document.querySelector('.add-btn[data-amount="500"]').click();
  ok(w.MizuLog.dayTotal(w.MizuLog.todayKey()) === 700, '200+500 で合計 700 ml');
  ok(w.document.getElementById('glassCurrent').textContent === '700', 'グラス表示が 700');
  ok(w.document.getElementById('percent').textContent === '35%', '2000 に対して 35%');
  ok(w.document.querySelectorAll('.log-item').length === 2, '記録リストが2件');
  ok(w.document.getElementById('logEmpty').hidden === true, '空メッセージが消える');
}

console.log('■ 永続化（リロード再現）');
{
  const w = boot();
  w.document.querySelector('.add-btn[data-amount="350"]').click();
  const raw = w.localStorage.getItem('mizulog:v1');
  ok(raw && JSON.parse(raw).days[w.MizuLog.todayKey()][0].ml === 350, 'localStorage に 350ml が保存される');
}

console.log('■ 削除');
{
  const w = boot();
  w.document.querySelector('.add-btn[data-amount="200"]').click();
  w.document.querySelector('.del').click();
  ok(w.MizuLog.dayTotal(w.MizuLog.todayKey()) === 0, '削除後は合計 0');
  ok(w.document.querySelectorAll('.log-item').length === 0, 'リストが空になる');
}

console.log('■ 取り消し（Undo）');
{
  const w = boot();
  w.document.querySelector('.add-btn[data-amount="200"]').click();
  ok(w.document.getElementById('undoBtn').hidden === false, '追加後にUndoボタンが出る');
  w.document.getElementById('undoBtn').click();
  ok(w.MizuLog.dayTotal(w.MizuLog.todayKey()) === 0, 'Undoで合計が 0 に戻る');
  ok(w.document.getElementById('undoBtn').hidden === true, 'Undo後はボタンが隠れる');
}

console.log('■ カスタム入力');
{
  const w = boot();
  w.document.getElementById('customBtn').click();
  ok(w.document.getElementById('customModal').hidden === false, 'カスタムモーダルが開く');
  w.document.getElementById('customInput').value = '180';
  w.document.getElementById('customSave').click();
  ok(w.MizuLog.dayTotal(w.MizuLog.todayKey()) === 180, 'カスタム 180ml が記録される');
  ok(w.document.getElementById('customModal').hidden === true, '保存後モーダルが閉じる');
}

console.log('■ 不正なカスタム入力は無視');
{
  const w = boot();
  w.document.getElementById('customBtn').click();
  w.document.getElementById('customInput').value = '-50';
  w.document.getElementById('customSave').click();
  ok(w.MizuLog.dayTotal(w.MizuLog.todayKey()) === 0, '負の値は記録されない');
}

console.log('■ 目標設定と達成判定');
{
  const w = boot();
  w.document.getElementById('settingsBtn').click();
  w.document.getElementById('goalInput').value = '500';
  w.document.getElementById('settingsSave').click();
  ok(w.MizuLog._state().goal === 500, '目標が 500 に変わる');
  w.document.querySelector('.add-btn[data-amount="500"]').click();
  ok(w.document.getElementById('percent').textContent === '100%', '達成で 100%');
  ok(/達成/.test(w.document.getElementById('remaining').textContent), '達成メッセージが出る');
  ok(w.document.getElementById('glassWater').classList.contains('full'), 'グラスがfull状態');
}

console.log('■ 週間チャート');
{
  const w = boot();
  w.document.querySelector('.add-btn[data-amount="200"]').click();
  ok(w.document.querySelectorAll('.chart .bar').length === 7, 'バーが7本描画される');
  ok(w.document.querySelector('.bar.today') !== null, '今日のバーがハイライトされる');
  ok(/平均/.test(w.document.getElementById('weekAvg').textContent), '平均が表示される');
}

console.log('■ 今日をリセット');
{
  const w = boot();
  w.document.querySelector('.add-btn[data-amount="200"]').click();
  w.document.getElementById('settingsBtn').click();
  w.document.getElementById('resetToday').click();
  ok(w.MizuLog.dayTotal(w.MizuLog.todayKey()) === 0, 'リセットで合計 0');
}

console.log('■ CSV書き出し');
{
  const w = boot();
  w.document.querySelector('.add-btn[data-amount="200"]').click();
  w.document.querySelector('.add-btn[data-amount="500"]').click();
  const csv = w.MizuLog.buildCSV();
  const lines = csv.split('\r\n');
  ok(lines[0] === '日付,時刻,量(ml)', 'ヘッダー行が正しい');
  ok(lines.length === 3, 'ヘッダー＋2記録で3行');
  ok(/,200$/.test(lines[1]) || /,200$/.test(lines[2]), '200ml の行が含まれる');
  ok(/,500$/.test(lines[1]) || /,500$/.test(lines[2]), '500ml の行が含まれる');
  ok(/^\d{4}-\d{2}-\d{2},\d{2}:\d{2},/.test(lines[1]), '日付・時刻フォーマットが正しい');
}

console.log('■ CSVエクスポートボタン（download属性つきaを生成）');
{
  const w = boot();
  w.document.querySelector('.add-btn[data-amount="200"]').click();
  let clicked = null;
  const origCreate = w.document.createElement.bind(w.document);
  w.document.createElement = function (tag) {
    const el = origCreate(tag);
    if (tag === 'a') { el.click = () => { clicked = el.download; }; }
    return el;
  };
  w.URL.createObjectURL = () => 'blob:x';
  w.URL.revokeObjectURL = () => {};
  w.document.getElementById('exportBtn').click();
  ok(/^mizulog-\d{4}-\d{2}-\d{2}\.csv$/.test(clicked || ''), 'CSVファイル名でダウンロードが起動する');
}

console.log('■ リマインダー設定の保存');
{
  const w = boot();
  w.document.getElementById('settingsBtn').click();
  ok(w.document.getElementById('reminderIntervalField').hidden === true, '初期は間隔選択が隠れている');
  // Notification API を許可済みでモック
  w.Notification = function () {};
  w.Notification.permission = 'granted';
  w.Notification.requestPermission = async () => 'granted';
  const toggle = w.document.getElementById('reminderToggle');
  toggle.checked = true;
  toggle.dispatchEvent(new w.Event('change'));
  w.document.getElementById('reminderInterval').value = '60';
  w.document.getElementById('settingsSave').click();
  const r = w.MizuLog._state().reminder;
  ok(r.enabled === true, 'リマインダーが有効になる');
  ok(r.intervalMin === 60, '間隔60分が保存される');
}

console.log('■ リマインダーは永続化される');
{
  const w = boot();
  w.MizuLog.setReminder(true, 30);
  const raw = JSON.parse(w.localStorage.getItem('mizulog:v1'));
  ok(raw.reminder.enabled === true && raw.reminder.intervalMin === 30, 'reminder が localStorage に保存される');
}

console.log(`\n結果: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
