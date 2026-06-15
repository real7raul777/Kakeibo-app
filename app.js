// ====================== FIREBASE ======================

const firebaseConfig = {
  apiKey: "AIzaSyDtmx-KOaETTTIwfSlaoYoHiFYPV8HCPOw",
  authDomain: "kakeibo-app-19171.firebaseapp.com",
  projectId: "kakeibo-app-19171",
  storageBucket: "kakeibo-app-19171.firebasestorage.app",
  messagingSenderId: "1040445712514",
  appId: "1:1040445712514:web:f44d9948a296102400ec9b"
};

firebase.initializeApp(firebaseConfig);
const fsDb = firebase.firestore();

// オフライン永続化（IndexedDB）— 複数タブ対応
fsDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
  console.warn('Offline persistence unavailable:', err.code);
});

// ====================== CACHE ======================
// UI は常にキャッシュから同期読み取り。Firestore 書き込みはバックグラウンド実行。

const cache = {
  bonusCats:    [],
  bonusPeriods: [],
  bonusItems:   [],
  bonusExpenses:[],
  monthlyCats:  [],
  monthlyData:  {},
};

const FS_COL = 'kakeibo';

function fsSave(docId, data) {
  return fsDb.collection(FS_COL).doc(docId).set(data)
    .catch(err => console.error('Firestore write error [' + docId + ']:', err));
}

async function loadAll() {
  const ids = ['bonusCats', 'bonusPeriods', 'bonusItems', 'bonusExpenses', 'monthlyCats', 'monthlyData'];
  const snaps = await Promise.all(ids.map(id => fsDb.collection(FS_COL).doc(id).get()));
  cache.bonusCats    = snaps[0].data()?.items || [];
  cache.bonusPeriods = snaps[1].data()?.items || [];
  cache.bonusItems   = snaps[2].data()?.items || [];
  cache.bonusExpenses= snaps[3].data()?.items || [];
  cache.monthlyCats  = snaps[4].data()?.items || [];
  cache.monthlyData  = snaps[5].data()?.data  || {};
}

// ====================== DB ACCESSORS ======================

function genId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

const DB = {
  getBonusCats:     () => cache.bonusCats,
  getBonusPeriods:  () => cache.bonusPeriods,
  getBonusItems:    () => cache.bonusItems,
  getBonusExpenses: () => cache.bonusExpenses,
  getMonthlyCats:   () => cache.monthlyCats,

  getMonthlyData: (key) => {
    const d = cache.monthlyData[key] || {};
    return { income: d.income || 0, payments: d.payments || [], bonusSupplies: d.bonusSupplies || [] };
  },

  saveBonusCats:     (d) => { cache.bonusCats     = d; fsSave('bonusCats',     { items: d }); },
  saveBonusPeriods:  (d) => { cache.bonusPeriods  = d; fsSave('bonusPeriods',  { items: d }); },
  saveBonusItems:    (d) => { cache.bonusItems    = d; fsSave('bonusItems',    { items: d }); },
  saveBonusExpenses: (d) => { cache.bonusExpenses = d; fsSave('bonusExpenses', { items: d }); },
  saveMonthlyCats:   (d) => { cache.monthlyCats   = d; fsSave('monthlyCats',   { items: d }); },

  saveMonthlyData: (key, data) => {
    cache.monthlyData[key] = data;
    fsSave('monthlyData', { data: cache.monthlyData });
  },
};

// ====================== AUTH ======================

const SESSION_KEY = 'kakeibo_session';

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

function setLoggedIn() {
  sessionStorage.setItem(SESSION_KEY, '1');
}

function confirmLogout() {
  if (!confirm('ログアウトしますか？')) return;
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

// config/password ドキュメントを取得（未存在なら初期値で作成）
async function getPasswordDoc() {
  const ref  = fsDb.collection('config').doc('password');
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ id: 'admin', password: 'kakeibo2026' });
    return { id: 'admin', password: 'kakeibo2026' };
  }
  return snap.data();
}

async function attemptLogin() {
  const btn     = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');
  const inputId = document.getElementById('login-id').value.trim();
  const inputPw = document.getElementById('login-pw').value;

  errorEl.classList.add('hidden');

  if (!inputId || !inputPw) {
    errorEl.textContent = 'IDとパスワードを入力してください';
    errorEl.classList.remove('hidden');
    return;
  }

  btn.disabled    = true;
  btn.textContent = '確認中...';

  try {
    const data = await getPasswordDoc();
    if (data.id === inputId && data.password === inputPw) {
      setLoggedIn();
      document.getElementById('login-overlay').classList.add('hidden');
      await startApp();
    } else {
      errorEl.textContent = 'IDまたはパスワードが正しくありません';
      errorEl.classList.remove('hidden');
      btn.disabled    = false;
      btn.textContent = 'ログイン';
      document.getElementById('login-pw').value = '';
      document.getElementById('login-pw').focus();
    }
  } catch (err) {
    errorEl.textContent = 'エラーが発生しました: ' + err.message;
    errorEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = 'ログイン';
  }
}

async function doChangePassword() {
  const newId  = document.getElementById('f-new-id').value.trim();
  const newPw  = document.getElementById('f-new-pw').value;
  const confirm = document.getElementById('f-confirm-pw').value;

  if (!newId)          { alert('IDを入力してください');        return; }
  if (!newPw)          { alert('パスワードを入力してください'); return; }
  if (newPw !== confirm) { alert('パスワードが一致しません');  return; }

  const btn = document.getElementById('pw-change-btn');
  btn.disabled    = true;
  btn.textContent = '変更中...';

  try {
    await fsDb.collection('config').doc('password').set({ id: newId, password: newPw });
    closeModal();
    alert('変更しました。次回ログインから新しいIDとパスワードが有効になります。');
  } catch (err) {
    alert('エラー: ' + err.message);
    btn.disabled    = false;
    btn.textContent = '変更する';
  }
}

function showChangePassword() {
  openModal('パスワード変更', `
    <div class="form-group">
      <label class="form-label">新しいID</label>
      <input class="form-input" id="f-new-id" type="text" autocomplete="off" placeholder="新しいID">
    </div>
    <div class="form-group">
      <label class="form-label">新しいパスワード</label>
      <input class="form-input" id="f-new-pw" type="password" autocomplete="new-password" placeholder="新しいパスワード">
    </div>
    <div class="form-group">
      <label class="form-label">パスワード（確認）</label>
      <input class="form-input" id="f-confirm-pw" type="password" autocomplete="new-password" placeholder="もう一度入力">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="pw-change-btn" onclick="doChangePassword()">変更する</button>
    </div>
  `);
  setTimeout(() => document.getElementById('f-new-id')?.focus(), 100);
}

// ====================== STATE ======================

const state = {
  activeTab: 'bonus',
  bonusPeriodId: null,
  monthlyPeriodKey: null,
};

let _supEditSources = null; // null = 追加モード; array = 編集時のプリセット

// ====================== UTILS ======================

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n) {
  return '¥' + Math.abs(n || 0).toLocaleString('ja-JP');
}

function fmtSigned(n) {
  n = n || 0;
  return (n < 0 ? '-¥' : '¥') + Math.abs(n).toLocaleString('ja-JP');
}

function getCurrentPeriodKey() {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  if (now.getDate() < 20) {
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return y + '-' + String(m).padStart(2, '0');
}

function periodKeyLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const MO = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  let em = m + 1, ey = y;
  if (em > 12) { em = 1; ey++; }
  return y + '年' + MO[m-1] + '20日〜' + ey + '年' + MO[em-1] + '19日';
}

function periodKeyShort(key) {
  const [y, m] = key.split('-').map(Number);
  return y + '年' + m + '月期';
}

function bonusPeriodLabel(p) {
  return p.year + '年' + (p.season === 'summer' ? '夏' : '冬');
}

function prevPeriodKey(key) {
  let [y, m] = key.split('-').map(Number);
  m--; if (m === 0) { m = 12; y--; }
  return y + '-' + String(m).padStart(2, '0');
}

function nextPeriodKey(key) {
  let [y, m] = key.split('-').map(Number);
  m++; if (m > 12) { m = 1; y++; }
  return y + '-' + String(m).padStart(2, '0');
}

function getBonusItemSpent(itemId) {
  return DB.getBonusExpenses()
    .filter(e => e.itemId === itemId)
    .reduce((s, e) => s + e.amount, 0);
}

function getBonusItemRemaining(item) {
  return item.budget - getBonusItemSpent(item.id);
}

// ====================== MODAL ======================

function openModal(title, bodyHTML, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');

  const confirmBtn = document.getElementById('modal-confirm');
  if (confirmBtn && onConfirm) {
    confirmBtn.addEventListener('click', function handler() {
      const result = onConfirm();
      if (result !== false) closeModal();
    });
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

// ====================== ROUTING ======================

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));
  renderTab(tab);
}

function renderTab(tab) {
  if (tab === 'bonus')    renderBonus();
  if (tab === 'monthly')  renderMonthly();
  if (tab === 'settings') renderSettings();
}

// =============================================
// SETTINGS TAB
// =============================================

function renderSettings() {
  document.getElementById('settings-content').innerHTML = `
    <div class="page-title">設定</div>

    <div class="card">
      <div class="section-header">
        <span class="section-title">ボーナス管理 カテゴリ</span>
        <button class="btn btn-primary btn-sm" onclick="showAddBonusCat()">＋ 追加</button>
      </div>
      <ul class="settings-list" id="bonus-cat-list">${renderBonusCatList()}</ul>
    </div>

    <div class="card">
      <div class="section-header">
        <span class="section-title">月次管理 カテゴリ</span>
        <button class="btn btn-primary btn-sm" onclick="showAddMonthlyCat()">＋ 追加</button>
      </div>
      <div id="monthly-cat-list">${renderMonthlyCatList()}</div>
    </div>

    <div class="card">
      <div class="section-header">
        <span class="section-title">アカウント</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-secondary" onclick="showChangePassword()">🔑 パスワード変更</button>
        <button class="btn btn-danger" onclick="confirmLogout()">ログアウト</button>
      </div>
    </div>
  `;
}

function renderBonusCatList() {
  const cats = DB.getBonusCats();
  if (!cats.length) return '<li class="empty-state"><div class="empty-state-icon">📂</div>カテゴリがありません</li>';
  return cats.map((cat, i) => `
    <li class="settings-item">
      <span class="settings-item-name">${esc(cat.name)}</span>
      <div class="settings-item-actions">
        ${i > 0 ? `<button class="btn btn-secondary btn-xs" onclick="moveBonusCat('${cat.id}',-1)">↑</button>` : ''}
        ${i < cats.length - 1 ? `<button class="btn btn-secondary btn-xs" onclick="moveBonusCat('${cat.id}',1)">↓</button>` : ''}
        <button class="btn btn-secondary btn-xs" onclick="showEditBonusCat('${cat.id}')">編集</button>
        <button class="btn btn-danger btn-xs" onclick="deleteBonusCat('${cat.id}')">削除</button>
      </div>
    </li>
  `).join('');
}

function renderMonthlyCatList() {
  const cats = DB.getMonthlyCats();
  if (!cats.length) return '<div class="empty-state"><div class="empty-state-icon">📂</div>カテゴリがありません</div>';
  return cats.map((cat, ci) => `
    <div class="cat-block">
      <div class="cat-header">
        <span class="cat-name">${esc(cat.name)}</span>
        <div class="cat-actions">
          ${ci > 0 ? `<button class="btn btn-secondary btn-xs" onclick="moveMonthlyCat('${cat.id}',-1)">↑</button>` : ''}
          ${ci < cats.length - 1 ? `<button class="btn btn-secondary btn-xs" onclick="moveMonthlyCat('${cat.id}',1)">↓</button>` : ''}
          <button class="btn btn-secondary btn-xs" onclick="showEditMonthlyCat('${cat.id}')">編集</button>
          <button class="btn btn-danger btn-xs" onclick="deleteMonthlyCat('${cat.id}')">削除</button>
        </div>
      </div>
      ${cat.items.map(item => `
        <div class="item-row">
          <div class="item-info">
            <div class="item-name">${esc(item.name)}</div>
            <div class="item-sub">固定額: ${fmt(item.defaultAmount)}</div>
          </div>
          <div class="item-right">
            <button class="btn btn-secondary btn-xs" onclick="showEditMonthlyItem('${cat.id}','${item.id}')">編集</button>
            <button class="btn btn-danger btn-xs" onclick="deleteMonthlyItem('${cat.id}','${item.id}')">削除</button>
          </div>
        </div>
      `).join('')}
      <div class="add-row">
        <button class="btn btn-secondary btn-sm" onclick="showAddMonthlyItem('${cat.id}')">＋ 内容を追加</button>
      </div>
    </div>
  `).join('');
}

// --- Bonus Cat CRUD ---

function showAddBonusCat() {
  openModal('ボーナスカテゴリ追加', `
    <div class="form-group">
      <label class="form-label">カテゴリ名</label>
      <input class="form-input" id="f-name" type="text" placeholder="例：お小遣い" autocomplete="off">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">追加</button>
    </div>
  `, () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { alert('カテゴリ名を入力してください'); return false; }
    const cats = DB.getBonusCats();
    cats.push({ id: genId('bcat'), name });
    DB.saveBonusCats(cats);
    renderSettings();
  });
  setTimeout(() => document.getElementById('f-name')?.focus(), 100);
}

function showEditBonusCat(id) {
  const cats = DB.getBonusCats();
  const cat = cats.find(c => c.id === id);
  if (!cat) return;
  openModal('ボーナスカテゴリ編集', `
    <div class="form-group">
      <label class="form-label">カテゴリ名</label>
      <input class="form-input" id="f-name" type="text" value="${esc(cat.name)}" autocomplete="off">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">保存</button>
    </div>
  `, () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { alert('カテゴリ名を入力してください'); return false; }
    cat.name = name;
    DB.saveBonusCats(cats);
    renderSettings();
  });
}

function deleteBonusCat(id) {
  if (!confirm('このカテゴリを削除しますか？\n関連する内容・支出履歴もすべて削除されます。')) return;
  const itemIds = DB.getBonusItems().filter(i => i.categoryId === id).map(i => i.id);
  DB.saveBonusCats(DB.getBonusCats().filter(c => c.id !== id));
  DB.saveBonusItems(DB.getBonusItems().filter(i => i.categoryId !== id));
  DB.saveBonusExpenses(DB.getBonusExpenses().filter(e => !itemIds.includes(e.itemId)));
  renderSettings();
}

function moveBonusCat(id, dir) {
  const cats = DB.getBonusCats();
  const idx = cats.findIndex(c => c.id === id);
  const ni = idx + dir;
  if (ni < 0 || ni >= cats.length) return;
  [cats[idx], cats[ni]] = [cats[ni], cats[idx]];
  DB.saveBonusCats(cats);
  renderSettings();
}

// --- Monthly Cat CRUD ---

function showAddMonthlyCat() {
  openModal('月次カテゴリ追加', `
    <div class="form-group">
      <label class="form-label">カテゴリ名</label>
      <input class="form-input" id="f-name" type="text" placeholder="例：楽天カード" autocomplete="off">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">追加</button>
    </div>
  `, () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { alert('カテゴリ名を入力してください'); return false; }
    const cats = DB.getMonthlyCats();
    cats.push({ id: genId('mcat'), name, items: [] });
    DB.saveMonthlyCats(cats);
    renderSettings();
  });
  setTimeout(() => document.getElementById('f-name')?.focus(), 100);
}

function showEditMonthlyCat(id) {
  const cats = DB.getMonthlyCats();
  const cat = cats.find(c => c.id === id);
  if (!cat) return;
  openModal('月次カテゴリ編集', `
    <div class="form-group">
      <label class="form-label">カテゴリ名</label>
      <input class="form-input" id="f-name" type="text" value="${esc(cat.name)}" autocomplete="off">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">保存</button>
    </div>
  `, () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { alert('カテゴリ名を入力してください'); return false; }
    cat.name = name;
    DB.saveMonthlyCats(cats);
    renderSettings();
  });
}

function deleteMonthlyCat(id) {
  if (!confirm('このカテゴリを削除しますか？\n配下の内容もすべて削除されます。')) return;
  DB.saveMonthlyCats(DB.getMonthlyCats().filter(c => c.id !== id));
  renderSettings();
}

function moveMonthlyCat(id, dir) {
  const cats = DB.getMonthlyCats();
  const idx = cats.findIndex(c => c.id === id);
  const ni = idx + dir;
  if (ni < 0 || ni >= cats.length) return;
  [cats[idx], cats[ni]] = [cats[ni], cats[idx]];
  DB.saveMonthlyCats(cats);
  renderSettings();
}

function showAddMonthlyItem(catId) {
  openModal('内容追加', `
    <div class="form-group">
      <label class="form-label">内容名</label>
      <input class="form-input" id="f-name" type="text" placeholder="例：食費" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">毎月の固定金額</label>
      <input class="form-input" id="f-amount" type="number" placeholder="30000" inputmode="numeric">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">追加</button>
    </div>
  `, () => {
    const name = document.getElementById('f-name').value.trim();
    const amount = parseInt(document.getElementById('f-amount').value) || 0;
    if (!name) { alert('内容名を入力してください'); return false; }
    const cats = DB.getMonthlyCats();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    cat.items.push({ id: genId('mitem'), name, defaultAmount: amount });
    DB.saveMonthlyCats(cats);
    renderSettings();
  });
  setTimeout(() => document.getElementById('f-name')?.focus(), 100);
}

function showEditMonthlyItem(catId, itemId) {
  const cats = DB.getMonthlyCats();
  const cat = cats.find(c => c.id === catId);
  const item = cat?.items.find(i => i.id === itemId);
  if (!item) return;
  openModal('内容編集', `
    <div class="form-group">
      <label class="form-label">内容名</label>
      <input class="form-input" id="f-name" type="text" value="${esc(item.name)}" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">毎月の固定金額</label>
      <input class="form-input" id="f-amount" type="number" value="${item.defaultAmount}" inputmode="numeric">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">保存</button>
    </div>
  `, () => {
    const name = document.getElementById('f-name').value.trim();
    const amount = parseInt(document.getElementById('f-amount').value) || 0;
    if (!name) { alert('内容名を入力してください'); return false; }
    item.name = name;
    item.defaultAmount = amount;
    DB.saveMonthlyCats(cats);
    renderSettings();
  });
}

function deleteMonthlyItem(catId, itemId) {
  if (!confirm('この内容を削除しますか？')) return;
  const cats = DB.getMonthlyCats();
  const cat = cats.find(c => c.id === catId);
  if (!cat) return;
  cat.items = cat.items.filter(i => i.id !== itemId);
  DB.saveMonthlyCats(cats);
  renderSettings();
}

// =============================================
// BONUS TAB
// =============================================

function renderBonus() {
  const periods = DB.getBonusPeriods();
  if (!state.bonusPeriodId && periods.length) state.bonusPeriodId = periods[periods.length - 1].id;

  const el = document.getElementById('bonus-content');
  el.innerHTML = `
    <div class="period-selector">
      <select onchange="selectBonusPeriod(this.value)">
        ${!periods.length ? '<option value="">期がありません</option>' : ''}
        ${periods.map(p => `<option value="${p.id}" ${p.id === state.bonusPeriodId ? 'selected' : ''}>${bonusPeriodLabel(p)}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" onclick="showCreateBonusPeriod()">＋ 新しい期</button>
    </div>
    ${periods.length && state.bonusPeriodId
      ? renderBonusPeriodContent(periods.find(p => p.id === state.bonusPeriodId))
      : '<div class="empty-state"><div class="empty-state-icon">💰</div>ボーナス期を作成してください</div>'
    }
  `;
}

// --- Carryover helpers ---

function sortedBonusPeriods() {
  return [...DB.getBonusPeriods()].sort((a, b) => {
    // Number() でキャストして string/number 混在を吸収
    const ay = Number(a.year), by = Number(b.year);
    if (ay !== by) return ay - by;
    if (a.season === b.season) return 0;
    return a.season === 'summer' ? -1 : 1; // summer < winter
  });
}

function getPrevBonusPeriod(periodId) {
  const all    = DB.getBonusPeriods();
  const sorted = sortedBonusPeriods();

  // デバッグ用: ブラウザのコンソールで確認できる
  console.log('[繰越] 登録期一覧:', all.map(p => p.id));
  console.log('[繰越] ソート後:', sorted.map(p => p.id));
  console.log('[繰越] 現在期ID:', JSON.stringify(periodId));

  const idx = sorted.findIndex(p => String(p.id) === String(periodId));
  console.log('[繰越] idx:', idx, '→ 前期:', idx > 0 ? sorted[idx - 1].id : 'なし');

  return idx > 0 ? sorted[idx - 1] : null;
}

function getOrCreateCarryoverCat() {
  const cats = DB.getBonusCats();
  let cat    = cats.find(c => c.name === '繰越');
  if (!cat) {
    cat = { id: genId('bcat-co'), name: '繰越' };
    cats.push(cat);
    DB.saveBonusCats(cats);
  }
  return cat;
}

function copyCarryover(periodId) {
  const periods = DB.getBonusPeriods();
  const period  = periods.find(p => p.id === periodId);
  if (!period) return;

  if (period.carryoverCopied) {
    if (!confirm('既に繰越コピー済みです。再度コピーしますか？\n繰越カテゴリの内容が上書きされます。')) return;
    const existingCoCat = DB.getBonusCats().find(c => c.name === '繰越');
    if (existingCoCat) {
      DB.saveBonusItems(DB.getBonusItems().filter(
        i => !(i.periodId === periodId && i.categoryId === existingCoCat.id)
      ));
    }
  }

  const prevPeriod = getPrevBonusPeriod(periodId);
  if (!prevPeriod) {
    alert('前期が見つかりません');
    return;
  }

  const prevItems    = DB.getBonusItems().filter(i => i.periodId === prevPeriod.id);
  const prevExpenses = DB.getBonusExpenses().filter(e => e.periodId === prevPeriod.id);
  const bonusCats    = DB.getBonusCats();

  // 残額 > 0 の内容を抽出
  const targets = prevItems
    .map(item => {
      const spent     = prevExpenses.filter(e => e.itemId === item.id).reduce((s, e) => s + e.amount, 0);
      const remaining = item.budget - spent;
      const cat       = bonusCats.find(c => c.id === item.categoryId);
      return { item, remaining, catName: cat ? cat.name : '' };
    })
    .filter(d => d.remaining > 0);

  if (targets.length === 0) {
    alert(bonusPeriodLabel(prevPeriod) + ' に繰り越せる残額がある内容がありません');
    return;
  }

  const listText = targets
    .map(d => '・' + (d.catName ? d.catName + '／' : '') + d.item.name + '：' + fmt(d.remaining))
    .join('\n');

  if (!confirm(
    bonusPeriodLabel(prevPeriod) + ' から以下の内容を繰り越しますか？\n\n' +
    listText + '\n\n「繰越」カテゴリに追加されます。'
  )) return;

  const coCat    = getOrCreateCarryoverCat();
  const allItems = DB.getBonusItems();

  targets.forEach(({ item, remaining }) => {
    allItems.push({
      id:         genId('bitem-co'),
      periodId,
      categoryId: coCat.id,
      name:       item.name,
      budget:     remaining,
    });
  });
  DB.saveBonusItems(allItems);

  period.carryoverCopied = true;
  DB.saveBonusPeriods(periods);

  renderBonus();
}

// --- Render ---

function renderBonusPeriodContent(period) {
  if (!period) return '';
  const items    = DB.getBonusItems().filter(i => i.periodId === period.id);
  const expenses = DB.getBonusExpenses().filter(e => e.periodId === period.id);
  const cats     = DB.getBonusCats();

  // 繰越カテゴリを特定（名前が「繰越」のカテゴリ）
  const carryoverCat   = cats.find(c => c.name === '繰越');
  const carryoverCatId = carryoverCat ? carryoverCat.id : null;

  const carryoverItems = items.filter(i => i.categoryId === carryoverCatId);

  const carryoverTotal = carryoverItems.reduce((s, i) => s + i.budget, 0); // 繰越額
  const budgetAmount   = period.amount + carryoverTotal;                    // 予算額
  const totalBudget    = items.reduce((s, i) => s + i.budget, 0);          // 予算化済み総額（全カテゴリ）
  const totalSpent     = expenses.reduce((s, e) => s + e.amount, 0);       // 使用済み
  const unbudgeted     = budgetAmount - totalBudget;
  const remaining      = budgetAmount - totalSpent;

  const copied = period.carryoverCopied;

  return `
    <div class="card">
      <div class="section-header">
        <span class="section-title">サマリー</span>
        <button class="btn btn-secondary btn-sm" onclick="showEditBonusPeriod('${period.id}')">期の設定</button>
      </div>
      <div class="carryover-copy-row">
        ${copied
          ? `<span class="tag tag-actual" style="padding:5px 10px">✓ 繰越コピー済み</span>
             <button class="btn btn-secondary btn-sm" onclick="copyCarryover('${period.id}')">↩ 前期から繰越をコピー</button>`
          : `<button class="btn btn-success btn-sm" onclick="copyCarryover('${period.id}')">↩ 前期から繰越をコピー</button>`
        }
      </div>
      <div class="summary-grid mt-8">
        <div class="summary-item">
          <div class="summary-label">ボーナス総額</div>
          <div class="summary-value">${fmt(period.amount)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">繰越額</div>
          <div class="summary-value ${carryoverTotal > 0 ? 'positive' : 'text-muted'}">${fmt(carryoverTotal)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">予算額</div>
          <div class="summary-value">${fmt(budgetAmount)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">予算化済み総額</div>
          <div class="summary-value">${fmt(totalBudget)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">未予算額</div>
          <div class="summary-value ${unbudgeted < 0 ? 'negative' : ''}">${fmtSigned(unbudgeted)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">残額</div>
          <div class="summary-value ${remaining < 0 ? 'negative' : 'positive'}">${fmtSigned(remaining)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-header">
        <span class="section-title">予算管理</span>
      </div>
      ${cats.length === 0
        ? '<div class="empty-state">設定でカテゴリを追加してください</div>'
        : cats.map(cat => renderBonusCatBlock(cat, period, items, expenses)).join('')
      }
    </div>

    <div class="card">
      <div class="section-header">
        <span class="section-title">支出履歴</span>
        <button class="btn btn-primary btn-sm" onclick="showAddBonusExpense('${period.id}')">＋ 支出追加</button>
      </div>
      ${renderBonusExpenseList(period, expenses, items, cats)}
    </div>
  `;
}

function renderBonusCatBlock(cat, period, allItems, allExpenses) {
  const items    = allItems.filter(i => i.categoryId === cat.id);
  const expenses = allExpenses.filter(e => e.categoryId === cat.id);
  const catBudget = items.reduce((s, i) => s + i.budget, 0);
  const catSpent  = expenses.reduce((s, e) => s + e.amount, 0);
  const catRem    = catBudget - catSpent;

  return `
    <div class="cat-block">
      <div class="cat-header">
        <span class="cat-name">${esc(cat.name)}</span>
      </div>
      <div class="cat-stat-row">
        <span class="tag tag-budget">予算 ${fmt(catBudget)}</span>
        <span class="tag tag-actual">実績 ${fmt(catSpent)}</span>
        <span class="tag ${catRem < 0 ? 'tag-over' : 'tag-remaining'}">残 ${fmtSigned(catRem)}</span>
      </div>
      ${items.map((item, idx) => {
        const spent = allExpenses.filter(e => e.itemId === item.id).reduce((s, e) => s + e.amount, 0);
        const rem   = item.budget - spent;
        const pct   = item.budget > 0 ? Math.min(100, Math.round((spent / item.budget) * 100)) : 0;
        const cls   = pct >= 100 ? 'over' : pct >= 80 ? 'almost' : '';
        return `
          <div class="bitem-row">
            <div class="bitem-head">
              <div class="bitem-name-wrap">
                <div class="item-name">${esc(item.name)}</div>
                ${item.memo ? `<div class="item-sub">${esc(item.memo)}</div>` : ''}
              </div>
              <div class="bitem-btns">
                <button class="btn btn-secondary btn-xs" style="visibility:${idx > 0 ? 'visible' : 'hidden'}" onclick="moveBonusItem('${item.id}',-1)">↑</button>
                <button class="btn btn-secondary btn-xs" style="visibility:${idx < items.length - 1 ? 'visible' : 'hidden'}" onclick="moveBonusItem('${item.id}',1)">↓</button>
                <button class="btn btn-secondary btn-xs" onclick="showEditBonusItem('${item.id}','${period.id}')">編集</button>
                <button class="btn btn-danger btn-xs" onclick="deleteBonusItem('${item.id}')">削除</button>
              </div>
            </div>
            <div class="bitem-foot">
              <div class="bitem-amounts">
                <span class="tag tag-budget">予算 ${fmt(item.budget)}</span>
                <span class="tag tag-actual">実績 ${fmt(spent)}</span>
                <span class="tag ${rem < 0 ? 'tag-over' : 'tag-remaining'}">残 ${fmtSigned(rem)}</span>
              </div>
              <div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
            </div>
          </div>
        `;
      }).join('')}
      <div class="add-row">
        <button class="btn btn-secondary btn-sm" onclick="showAddBonusItem('${cat.id}','${period.id}')">＋ 内容を追加</button>
      </div>
    </div>
  `;
}

function renderBonusExpenseList(period, expenses, items, cats) {
  if (!expenses.length) return '<div class="empty-state">支出履歴がありません</div>';
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  return `
    <ul class="exp-list">
      ${sorted.map(exp => {
        const cat  = cats.find(c => c.id === exp.categoryId);
        const item = items.find(i => i.id === exp.itemId);
        const isSupply = exp.source === 'bonus_supply';
        return `
          <li class="exp-item">
            <div class="exp-info">
              <div class="exp-date">${exp.date}　${cat ? esc(cat.name) : ''}／${item ? esc(item.name) : ''}</div>
              ${isSupply ? '<span class="tag tag-custom" style="font-size:10px">月次補充</span>' : ''}
              ${exp.memo ? `<div class="exp-memo">${esc(exp.memo)}</div>` : ''}
            </div>
            <div class="exp-right">
              <span class="exp-amount">${fmt(exp.amount)}</span>
              ${!isSupply ? `<button class="btn btn-danger btn-xs" onclick="deleteBonusExpense('${exp.id}')">削除</button>` : ''}
            </div>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

// --- Bonus Period ---

function selectBonusPeriod(id) {
  state.bonusPeriodId = id;
  renderBonus();
}

function showCreateBonusPeriod() {
  const periods = DB.getBonusPeriods();
  const y = new Date().getFullYear();
  openModal('新しいボーナス期を作成', `
    <div class="form-group">
      <label class="form-label">年</label>
      <input class="form-input" id="f-year" type="number" value="${y}" inputmode="numeric">
    </div>
    <div class="form-group">
      <label class="form-label">期</label>
      <select class="form-input" id="f-season">
        <option value="summer">夏</option>
        <option value="winter">冬</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">ボーナス金額</label>
      <input class="form-input" id="f-amount" type="number" placeholder="1000000" inputmode="numeric">
    </div>
    ${periods.length ? `
    <div class="form-group">
      <div class="check-group">
        <input type="checkbox" id="f-copy" checked>
        <label for="f-copy">前回同期（前年同期）の予算をコピーする</label>
      </div>
    </div>` : ''}
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">作成</button>
    </div>
  `, () => {
    const year   = parseInt(document.getElementById('f-year').value);
    const season = document.getElementById('f-season').value;
    const amount = parseInt(document.getElementById('f-amount').value) || 0;
    const copyEl = document.getElementById('f-copy');
    const doCopy = copyEl ? copyEl.checked : false;
    if (!year) { alert('年を入力してください'); return false; }
    const periodId = year + '-' + season;
    if (periods.find(p => p.id === periodId)) { alert('この期はすでに存在します'); return false; }

    periods.push({ id: periodId, year, season, amount });
    DB.saveBonusPeriods(periods);

    if (doCopy && prev) {
      const prevItems = DB.getBonusItems().filter(i => i.periodId === prev.id);
      const allItems  = DB.getBonusItems();
      prevItems.forEach(item => {
        allItems.push({ id: genId('bitem'), periodId, categoryId: item.categoryId, name: item.name, budget: item.budget });
      });
      DB.saveBonusItems(allItems);
    }

    state.bonusPeriodId = periodId;
    renderBonus();
  });
}

function showEditBonusPeriod(periodId) {
  const periods = DB.getBonusPeriods();
  const period  = periods.find(p => p.id === periodId);
  if (!period) return;
  openModal('期の設定', `
    <div class="form-group">
      <label class="form-label">ボーナス金額</label>
      <input class="form-input" id="f-amount" type="number" value="${period.amount}" inputmode="numeric">
    </div>
    <div class="form-actions">
      <button class="btn btn-danger" onclick="confirmDeleteBonusPeriod('${periodId}')">期を削除</button>
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">保存</button>
    </div>
  `, () => {
    period.amount = parseInt(document.getElementById('f-amount').value) || 0;
    DB.saveBonusPeriods(periods);
    renderBonus();
  });
}

function confirmDeleteBonusPeriod(periodId) {
  if (!confirm('この期を削除しますか？\n関連する内容・支出履歴もすべて削除されます。')) return;
  closeModal();
  DB.saveBonusPeriods(DB.getBonusPeriods().filter(p => p.id !== periodId));
  DB.saveBonusItems(DB.getBonusItems().filter(i => i.periodId !== periodId));
  DB.saveBonusExpenses(DB.getBonusExpenses().filter(e => e.periodId !== periodId));
  const remaining = DB.getBonusPeriods();
  state.bonusPeriodId = remaining.length ? remaining[remaining.length - 1].id : null;
  renderBonus();
}

// --- Bonus Items (内容) ---

function showAddBonusItem(catId, periodId) {
  openModal('内容追加', `
    <div class="form-group">
      <label class="form-label">内容名</label>
      <input class="form-input" id="f-name" type="text" placeholder="例：パパ" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">予算金額</label>
      <input class="form-input" id="f-budget" type="number" placeholder="150000" inputmode="numeric">
    </div>
    <div class="form-group">
      <label class="form-label">メモ（任意）</label>
      <input class="form-input" id="f-memo" type="text" placeholder="メモを入力" autocomplete="off">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">追加</button>
    </div>
  `, () => {
    const name   = document.getElementById('f-name').value.trim();
    const budget = parseInt(document.getElementById('f-budget').value) || 0;
    const memo   = document.getElementById('f-memo').value.trim();
    if (!name) { alert('内容名を入力してください'); return false; }
    const items = DB.getBonusItems();
    items.push({ id: genId('bitem'), periodId, categoryId: catId, name, budget, memo });
    DB.saveBonusItems(items);
    renderBonus();
  });
  setTimeout(() => document.getElementById('f-name')?.focus(), 100);
}

function showEditBonusItem(itemId) {
  const items = DB.getBonusItems();
  const item  = items.find(i => i.id === itemId);
  if (!item) return;
  openModal('内容編集', `
    <div class="form-group">
      <label class="form-label">内容名</label>
      <input class="form-input" id="f-name" type="text" value="${esc(item.name)}" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">予算金額</label>
      <input class="form-input" id="f-budget" type="number" value="${item.budget}" inputmode="numeric">
    </div>
    <div class="form-group">
      <label class="form-label">メモ（任意）</label>
      <input class="form-input" id="f-memo" type="text" value="${esc(item.memo || '')}" autocomplete="off">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">保存</button>
    </div>
  `, () => {
    const name   = document.getElementById('f-name').value.trim();
    const budget = parseInt(document.getElementById('f-budget').value) || 0;
    const memo   = document.getElementById('f-memo').value.trim();
    if (!name) { alert('内容名を入力してください'); return false; }
    item.name   = name;
    item.budget = budget;
    item.memo   = memo;
    DB.saveBonusItems(items);
    renderBonus();
  });
}

function deleteBonusItem(itemId) {
  if (!confirm('この内容を削除しますか？\n関連する支出履歴も削除されます。')) return;
  DB.saveBonusItems(DB.getBonusItems().filter(i => i.id !== itemId));
  DB.saveBonusExpenses(DB.getBonusExpenses().filter(e => e.itemId !== itemId));
  renderBonus();
}

function moveBonusItem(itemId, dir) {
  const allItems = DB.getBonusItems();
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;
  const groupIndices = allItems
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => it.periodId === item.periodId && it.categoryId === item.categoryId)
    .map(({ idx }) => idx);
  const posInGroup = groupIndices.findIndex(gi => allItems[gi].id === itemId);
  const newPos = posInGroup + dir;
  if (newPos < 0 || newPos >= groupIndices.length) return;
  [allItems[groupIndices[posInGroup]], allItems[groupIndices[newPos]]] =
    [allItems[groupIndices[newPos]], allItems[groupIndices[posInGroup]]];
  DB.saveBonusItems(allItems);
  renderBonus();
}

// --- Bonus Expenses ---

function showAddBonusExpense(periodId) {
  const cats    = DB.getBonusCats();
  const allItems = DB.getBonusItems().filter(i => i.periodId === periodId);

  if (!cats.length || !allItems.length) {
    alert('先にカテゴリと内容を追加してください');
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  function buildItemOpts(catId) {
    return allItems.filter(i => i.categoryId === catId).map(i => {
      const rem = getBonusItemRemaining(i);
      return `<option value="${i.id}" data-rem="${rem}">${esc(i.name)} (残: ${fmtSigned(rem)})</option>`;
    }).join('') || '<option value="">内容がありません</option>';
  }

  const firstCat = cats.find(c => allItems.some(i => i.categoryId === c.id)) || cats[0];

  openModal('支出追加', `
    <div class="form-group">
      <label class="form-label">日付</label>
      <input class="form-input" id="f-date" type="date" value="${today}">
    </div>
    <div class="form-group">
      <label class="form-label">カテゴリ</label>
      <select class="form-input" id="f-cat" onchange="onBonusExpCatChange('${periodId}')">
        ${cats.map(c => `<option value="${c.id}" ${c.id === firstCat.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">内容</label>
      <select class="form-input" id="f-item" onchange="onBonusExpItemChange()">
        ${buildItemOpts(firstCat.id)}
      </select>
    </div>
    <div id="rem-info" class="remaining-info ok" style="display:none"></div>
    <div class="form-group">
      <label class="form-label">金額</label>
      <input class="form-input" id="f-amount" type="number" placeholder="10000" inputmode="numeric">
    </div>
    <div class="form-group">
      <label class="form-label">メモ（任意）</label>
      <input class="form-input" id="f-memo" type="text" placeholder="メモ" autocomplete="off">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">追加</button>
    </div>
  `, () => {
    const date   = document.getElementById('f-date').value;
    const catId  = document.getElementById('f-cat').value;
    const itemId = document.getElementById('f-item').value;
    const amount = parseInt(document.getElementById('f-amount').value) || 0;
    const memo   = document.getElementById('f-memo').value.trim();
    if (!date)   { alert('日付を入力してください'); return false; }
    if (!amount) { alert('金額を入力してください'); return false; }
    if (!itemId) { alert('内容を選択してください'); return false; }
    const item = allItems.find(i => i.id === itemId);
    if (item) {
      const rem = getBonusItemRemaining(item);
      if (amount > rem) {
        alert('残額を超えています。\n残額: ' + fmt(rem) + '\n入力金額: ' + fmt(amount));
        return false;
      }
    }
    const exps = DB.getBonusExpenses();
    exps.push({ id: genId('exp'), periodId, date, categoryId: catId, itemId, amount, memo, source: 'bonus' });
    DB.saveBonusExpenses(exps);
    renderBonus();
  });

  setTimeout(() => onBonusExpItemChange(), 50);
}

// Global helpers for bonus expense form
function onBonusExpCatChange(periodId) {
  const catId    = document.getElementById('f-cat')?.value;
  const itemSel  = document.getElementById('f-item');
  if (!itemSel) return;
  const allItems = DB.getBonusItems().filter(i => i.periodId === periodId && i.categoryId === catId);
  itemSel.innerHTML = allItems.length
    ? allItems.map(i => {
        const rem = getBonusItemRemaining(i);
        return `<option value="${i.id}" data-rem="${rem}">${esc(i.name)} (残: ${fmtSigned(rem)})</option>`;
      }).join('')
    : '<option value="">内容がありません</option>';
  onBonusExpItemChange();
}

function onBonusExpItemChange() {
  const sel  = document.getElementById('f-item');
  const info = document.getElementById('rem-info');
  if (!sel || !info) return;
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { info.style.display = 'none'; return; }
  const rem = parseInt(opt.dataset.rem || '0');
  info.style.display = '';
  if (rem <= 0) {
    info.className = 'remaining-info over';
    info.textContent = '残額: ' + fmtSigned(rem) + '（超過）';
  } else if (rem < 50000) {
    info.className = 'remaining-info warning';
    info.textContent = '残額: ' + fmt(rem);
  } else {
    info.className = 'remaining-info ok';
    info.textContent = '残額: ' + fmt(rem);
  }
}

function deleteBonusExpense(expId) {
  const exp = DB.getBonusExpenses().find(e => e.id === expId);
  if (exp && exp.source === 'bonus_supply') {
    alert('月次補充の支出は月次管理画面から削除してください');
    return;
  }
  if (!confirm('この支出を削除しますか？')) return;
  DB.saveBonusExpenses(DB.getBonusExpenses().filter(e => e.id !== expId));
  renderBonus();
}

// =============================================
// MONTHLY TAB
// =============================================

function renderMonthly() {
  if (!state.monthlyPeriodKey) state.monthlyPeriodKey = getCurrentPeriodKey();
  const key  = state.monthlyPeriodKey;
  const data = DB.getMonthlyData(key);
  const cats = DB.getMonthlyCats();

  const totalPay    = calcTotalPayments(data, cats);
  const totalSupply = data.bonusSupplies.reduce((s, b) => s + b.amount, 0);
  const balance     = data.income + totalSupply - totalPay;

  document.getElementById('monthly-content').innerHTML = `
    <div class="month-nav">
      <button class="btn btn-secondary btn-sm" onclick="navigateMonth(-1)">◀</button>
      <span class="month-nav-title">${periodKeyShort(key)}</span>
      <button class="btn btn-secondary btn-sm" onclick="navigateMonth(1)">▶</button>
    </div>
    <div class="month-nav-sub">${periodKeyLabel(key)}</div>

    <div class="card">
      <div class="section-header">
        <span class="section-title">サマリー</span>
        <button class="btn btn-secondary btn-sm" onclick="showEditIncome('${key}')">給料設定</button>
      </div>
      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-label">給料収入</div>
          <div class="summary-value">${fmt(data.income)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">支払合計</div>
          <div class="summary-value warning">${fmt(totalPay)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">ボーナス補充</div>
          <div class="summary-value positive">${fmt(totalSupply)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">収支差額</div>
          <div class="summary-value ${balance < 0 ? 'negative' : 'positive'}">${fmtSigned(balance)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-header">
        <span class="section-title">支払い管理</span>
      </div>
      ${renderMonthlyPayments(key, data, cats)}
    </div>

    <div class="card">
      <div class="section-header">
        <span class="section-title">ボーナス補充</span>
        <button class="btn btn-primary btn-sm" onclick="showAddBonusSupply('${key}')">＋ 追加</button>
      </div>
      ${renderBonusSupplies(key, data, cats)}
    </div>
  `;
}

function calcTotalPayments(data, cats) {
  let total = 0;
  cats.forEach(cat => {
    cat.items.forEach(item => {
      const ov = data.payments.find(p => p.categoryId === cat.id && p.itemId === item.id && !p.isCustom);
      total += ov ? ov.amount : item.defaultAmount;
    });
  });
  data.payments.filter(p => p.isCustom).forEach(p => { total += p.amount; });
  return total;
}

function renderMonthlyPayments(periodKey, data, cats) {
  if (!cats.length) return '<div class="empty-state">設定でカテゴリを追加してください</div>';

  return cats.map(cat => {
    const masterItems = cat.items.map(item => {
      const ov     = data.payments.find(p => p.categoryId === cat.id && p.itemId === item.id && !p.isCustom);
      const amount = ov ? ov.amount : item.defaultAmount;
      return { ...item, amount, isModified: !!ov && ov.amount !== item.defaultAmount };
    });
    const customItems = data.payments.filter(p => p.categoryId === cat.id && p.isCustom);
    const catTotal = [...masterItems, ...customItems].reduce((s, p) => s + p.amount, 0);

    return `
      <div class="cat-block">
        <div class="cat-header">
          <span class="cat-name">${esc(cat.name)}</span>
          <span class="tag tag-budget">${fmt(catTotal)}</span>
        </div>
        ${masterItems.map(item => `
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">${esc(item.name)}</div>
              ${item.isModified ? `<div class="item-sub">固定額: ${fmt(item.defaultAmount)}</div>` : ''}
            </div>
            <div class="item-right">
              ${item.isModified ? '<span class="tag tag-modified">変更済</span>' : ''}
              <span class="fw-700">${fmt(item.amount)}</span>
              <button class="btn btn-secondary btn-xs" onclick="showEditPayment('${periodKey}','${cat.id}','${item.id}')">編集</button>
            </div>
          </div>
        `).join('')}
        ${customItems.map(p => `
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">${esc(p.name)}</div>
            </div>
            <div class="item-right">
              <span class="tag tag-custom">追加</span>
              <span class="fw-700">${fmt(p.amount)}</span>
              <button class="btn btn-secondary btn-xs" onclick="showEditCustomPayment('${periodKey}','${p.id}')">編集</button>
              <button class="btn btn-danger btn-xs" onclick="deleteCustomPayment('${periodKey}','${p.id}')">削除</button>
            </div>
          </div>
        `).join('')}
        <div class="add-row">
          <button class="btn btn-secondary btn-sm" onclick="showAddCustomPayment('${periodKey}','${cat.id}')">＋ この月に追加</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderBonusSupplies(periodKey, data, cats) {
  if (!data.bonusSupplies.length) return '<div class="empty-state">ボーナス補充がありません</div>';
  const bonusCats    = DB.getBonusCats();
  const bonusPeriods = DB.getBonusPeriods();
  const bonusItems   = DB.getBonusItems();
  return `
    <ul class="exp-list">
      ${data.bonusSupplies.map(sup => {
        const mCat  = cats.find(c => c.id === sup.monthlyCategoryId);
        const mItem = mCat?.items.find(i => i.id === sup.monthlyItemId);

        let sourceHtml;
        if (sup.bonusSources && sup.bonusSources.length > 0) {
          sourceHtml = sup.bonusSources.map(src => {
            const bPer  = bonusPeriods.find(p => p.id === src.periodId);
            const bCat  = bonusCats.find(c => c.id === src.categoryId);
            const bItem = bonusItems.find(i => i.id === src.itemId);
            return `<div class="supply-arrow">↖ ${bPer ? bonusPeriodLabel(bPer) : ''}　${bCat ? esc(bCat.name) : ''}／${bItem ? esc(bItem.name) : ''} (${fmt(src.amount)})</div>`;
          }).join('');
        } else if (sup.bonusPeriodId) {
          const bPer  = bonusPeriods.find(p => p.id === sup.bonusPeriodId);
          const bCat  = bonusCats.find(c => c.id === sup.bonusCategoryId);
          const bItem = bonusItems.find(i => i.id === sup.bonusItemId);
          sourceHtml = `<div class="supply-arrow">↖ ${bPer ? bonusPeriodLabel(bPer) : ''}　${bCat ? esc(bCat.name) : ''}／${bItem ? esc(bItem.name) : ''}</div>
            <div class="exp-memo">ボーナスから ${fmt(sup.bonusAmount)}</div>`;
        } else {
          sourceHtml = '<div class="supply-arrow" style="color:var(--text-muted)">未紐付け</div>';
        }

        return `
          <li class="exp-item">
            <div class="exp-info">
              <div class="exp-date fw-bold">${mCat ? esc(mCat.name) : ''}／${mItem ? esc(mItem.name) : (sup.monthlyCustomName || '—')}</div>
              ${sup.label ? `<div class="exp-memo">${esc(sup.label)}</div>` : ''}
              ${sourceHtml}
            </div>
            <div class="exp-right">
              <span class="exp-amount">${fmt(sup.amount)}</span>
              <button class="btn btn-secondary btn-xs" onclick="showEditBonusSupply('${periodKey}','${sup.id}')">編集</button>
              <button class="btn btn-danger btn-xs" onclick="deleteBonusSupply('${periodKey}','${sup.id}')">削除</button>
            </div>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

// --- Monthly Navigation ---

function navigateMonth(dir) {
  state.monthlyPeriodKey = dir < 0
    ? prevPeriodKey(state.monthlyPeriodKey)
    : nextPeriodKey(state.monthlyPeriodKey);
  renderMonthly();
}

// --- Monthly Income ---

function showEditIncome(periodKey) {
  const data = DB.getMonthlyData(periodKey);
  openModal('給料設定', `
    <div class="form-group">
      <label class="form-label">給料収入</label>
      <input class="form-input" id="f-income" type="number" value="${data.income}" inputmode="numeric">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">保存</button>
    </div>
  `, () => {
    data.income = parseInt(document.getElementById('f-income').value) || 0;
    DB.saveMonthlyData(periodKey, data);
    renderMonthly();
  });
  setTimeout(() => document.getElementById('f-income')?.focus(), 100);
}

// --- Monthly Payments ---

function showEditPayment(periodKey, catId, itemId) {
  const cats   = DB.getMonthlyCats();
  const cat    = cats.find(c => c.id === catId);
  const item   = cat?.items.find(i => i.id === itemId);
  const data   = DB.getMonthlyData(periodKey);
  const ov     = data.payments.find(p => p.categoryId === catId && p.itemId === itemId && !p.isCustom);
  const cur    = ov ? ov.amount : (item?.defaultAmount || 0);
  const defAmt = item?.defaultAmount || 0;

  openModal('支払額を編集', `
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${item ? esc(item.name) : ''}（固定設定額: ${fmt(defAmt)}）</div>
    <div class="form-group">
      <label class="form-label">この月の金額</label>
      <input class="form-input" id="f-amount" type="number" value="${cur}" inputmode="numeric">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      ${ov ? `<button class="btn btn-warning btn-sm" onclick="resetPayment('${periodKey}','${catId}','${itemId}')">固定額に戻す</button>` : ''}
      <button class="btn btn-primary" id="modal-confirm">保存</button>
    </div>
  `, () => {
    const amount = parseInt(document.getElementById('f-amount').value) || 0;
    const idx    = data.payments.findIndex(p => p.categoryId === catId && p.itemId === itemId && !p.isCustom);
    if (idx >= 0) {
      data.payments[idx].amount = amount;
    } else {
      data.payments.push({ id: genId('pay'), categoryId: catId, itemId, amount, isCustom: false });
    }
    DB.saveMonthlyData(periodKey, data);
    renderMonthly();
  });
  setTimeout(() => document.getElementById('f-amount')?.focus(), 100);
}

function resetPayment(periodKey, catId, itemId) {
  closeModal();
  const data = DB.getMonthlyData(periodKey);
  data.payments = data.payments.filter(p => !(p.categoryId === catId && p.itemId === itemId && !p.isCustom));
  DB.saveMonthlyData(periodKey, data);
  renderMonthly();
}

function showAddCustomPayment(periodKey, catId) {
  const cat = DB.getMonthlyCats().find(c => c.id === catId);
  openModal((cat ? esc(cat.name) + 'に' : '') + 'この月の支払いを追加', `
    <div class="form-group">
      <label class="form-label">内容名</label>
      <input class="form-input" id="f-name" type="text" placeholder="例：臨時出費" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">金額</label>
      <input class="form-input" id="f-amount" type="number" placeholder="0" inputmode="numeric">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">追加</button>
    </div>
  `, () => {
    const name   = document.getElementById('f-name').value.trim();
    const amount = parseInt(document.getElementById('f-amount').value) || 0;
    if (!name) { alert('内容名を入力してください'); return false; }
    const data = DB.getMonthlyData(periodKey);
    data.payments.push({ id: genId('cpay'), categoryId: catId, itemId: null, name, amount, isCustom: true });
    DB.saveMonthlyData(periodKey, data);
    renderMonthly();
  });
  setTimeout(() => document.getElementById('f-name')?.focus(), 100);
}

function showEditCustomPayment(periodKey, payId) {
  const data = DB.getMonthlyData(periodKey);
  const pay  = data.payments.find(p => p.id === payId);
  if (!pay) return;
  openModal('支払いを編集', `
    <div class="form-group">
      <label class="form-label">内容名</label>
      <input class="form-input" id="f-name" type="text" value="${esc(pay.name)}" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">金額</label>
      <input class="form-input" id="f-amount" type="number" value="${pay.amount}" inputmode="numeric">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">保存</button>
    </div>
  `, () => {
    const name   = document.getElementById('f-name').value.trim();
    const amount = parseInt(document.getElementById('f-amount').value) || 0;
    if (!name) { alert('内容名を入力してください'); return false; }
    pay.name   = name;
    pay.amount = amount;
    DB.saveMonthlyData(periodKey, data);
    renderMonthly();
  });
}

function deleteCustomPayment(periodKey, payId) {
  if (!confirm('この支払いを削除しますか？')) return;
  const data = DB.getMonthlyData(periodKey);
  data.payments = data.payments.filter(p => p.id !== payId);
  DB.saveMonthlyData(periodKey, data);
  renderMonthly();
}

// --- Bonus Supply ---

function showAddBonusSupply(periodKey) {
  _supEditSources = null;
  _openBonusSupplyModal('add', periodKey, null);
}

function showEditBonusSupply(periodKey, supId) {
  const data = DB.getMonthlyData(periodKey);
  const sup  = data.bonusSupplies.find(s => s.id === supId);
  if (!sup) return;
  if (sup.bonusSources) {
    _supEditSources = sup.bonusSources;
  } else if (sup.bonusPeriodId) {
    _supEditSources = [{ periodId: sup.bonusPeriodId, categoryId: sup.bonusCategoryId, itemId: sup.bonusItemId, amount: sup.bonusAmount || 0 }];
  } else {
    _supEditSources = [];
  }
  _openBonusSupplyModal('edit', periodKey, sup);
}

function _openBonusSupplyModal(mode, periodKey, sup) {
  const mCats        = DB.getMonthlyCats();
  const bonusPeriods = DB.getBonusPeriods();
  const bonusCats    = DB.getBonusCats();

  if (!mCats.length) { alert('月次カテゴリを先に設定してください'); return; }

  const hasBonusData = bonusPeriods.length > 0 && bonusCats.length > 0;

  const initMCatId  = sup ? sup.monthlyCategoryId : mCats[0].id;
  const initMCat    = mCats.find(c => c.id === initMCatId) || mCats[0];
  const initMItemId = sup ? sup.monthlyItemId : (initMCat.items[0]?.id || '');
  const initAmount  = sup ? sup.amount : '';
  const initLabel   = sup ? (sup.label || '') : '';

  let initBPeriodId = bonusPeriods.length ? bonusPeriods[bonusPeriods.length - 1].id : '';
  let initBCatId    = bonusCats.length ? bonusCats[0].id : '';
  if (_supEditSources && _supEditSources.length > 0) {
    initBPeriodId = _supEditSources[0].periodId;
    initBCatId    = _supEditSources[0].categoryId;
  }

  function mItemOpts(catId) {
    const cat = mCats.find(c => c.id === catId);
    return cat && cat.items.length
      ? cat.items.map(i => `<option value="${i.id}" ${i.id === initMItemId ? 'selected' : ''}>${esc(i.name)}</option>`).join('')
      : '<option value="">（内容なし）</option>';
  }

  openModal(mode === 'add' ? 'ボーナス補充を追加' : 'ボーナス補充を編集', `
    <div class="form-section-label">補充先（月次）</div>
    <div class="form-group">
      <label class="form-label">カテゴリ</label>
      <select class="form-input" id="sup-m-cat" onchange="supUpdateMItems()">
        ${mCats.map(c => `<option value="${c.id}" ${c.id === initMCatId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">内容</label>
      <select class="form-input" id="sup-m-item">
        ${mItemOpts(initMCatId)}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">名目<span class="form-label-optional">任意</span></label>
      <input class="form-input" id="sup-label" type="text" value="${esc(initLabel)}" placeholder="例：楽天カード6月分" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">補充金額</label>
      <input class="form-input" id="sup-amount" type="number" value="${initAmount}" placeholder="0" inputmode="numeric">
    </div>

    <hr class="form-divider">
    <div class="form-section-label">補充元（ボーナス）<span class="form-label-optional">任意</span></div>

    ${hasBonusData ? `
      <div class="form-group">
        <label class="form-label">ボーナス期</label>
        <select class="form-input" id="sup-b-period" onchange="supUpdateBItems()">
          ${bonusPeriods.map(p => `<option value="${p.id}" ${p.id === initBPeriodId ? 'selected' : ''}>${bonusPeriodLabel(p)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">ボーナスカテゴリ</label>
        <select class="form-input" id="sup-b-cat" onchange="supUpdateBItems()">
          ${bonusCats.map(c => `<option value="${c.id}" ${c.id === initBCatId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">ボーナス内容<span class="form-label-optional">複数選択可</span></label>
        <div class="sup-items-box" id="sup-b-items-list"></div>
      </div>
      <div class="sup-total-row">
        <span>補充合計</span>
        <span id="sup-bonus-total" class="positive">¥0</span>
      </div>
    ` : '<div class="form-hint" style="margin-bottom:8px">ボーナス期・カテゴリを設定すると補充元を紐付けられます</div>'}

    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="modal-confirm">${mode === 'add' ? '追加' : '保存'}</button>
    </div>
  `, () => {
    const mCatId  = document.getElementById('sup-m-cat').value;
    const mItemId = document.getElementById('sup-m-item').value;
    const label   = document.getElementById('sup-label').value.trim();
    const amount  = parseInt(document.getElementById('sup-amount').value) || 0;
    if (!amount) { alert('補充金額を入力してください'); return false; }

    // Collect bonus sources
    const bonusSources = [];
    if (hasBonusData) {
      const bPeriodId = document.getElementById('sup-b-period')?.value;
      const bCatId    = document.getElementById('sup-b-cat')?.value;
      document.querySelectorAll('#sup-b-items-list input[type=checkbox]:checked').forEach(cb => {
        const amt = parseInt(document.getElementById('sup-amt-' + cb.value)?.value || '0') || 0;
        if (amt > 0) bonusSources.push({ periodId: bPeriodId, categoryId: bCatId, itemId: cb.value, amount: amt });
      });
    }

    // Validate bonus remaining for each source
    for (const src of bonusSources) {
      const bItem = DB.getBonusItems().find(i => i.id === src.itemId);
      if (bItem) {
        let rem = getBonusItemRemaining(bItem);
        // In edit mode: add back amount already allocated to this supply's item
        if (sup) {
          const oldSrc = (sup.bonusSources || []).find(s => s.itemId === src.itemId);
          if (oldSrc) rem += oldSrc.amount;
          else if (!sup.bonusSources && sup.bonusItemId === src.itemId) rem += (sup.bonusAmount || 0);
        }
        if (src.amount > rem) {
          alert(`「${bItem.name}」のボーナス残額を超えています。\n残額: ${fmt(rem)}\n入力金額: ${fmt(src.amount)}`);
          return false;
        }
      }
    }

    const data  = DB.getMonthlyData(periodKey);
    const mCat  = mCats.find(c => c.id === mCatId);
    const mItem = mCat?.items.find(i => i.id === mItemId);
    const memo  = '月次補充: ' + (mCat ? mCat.name : '') + ' ' + (mItem ? mItem.name : '');

    if (mode === 'add') {
      const supId = genId('sup');
      data.bonusSupplies.push({ id: supId, monthlyCategoryId: mCatId, monthlyItemId: mItemId, label, amount, bonusSources });
      DB.saveMonthlyData(periodKey, data);
      if (bonusSources.length) {
        const bExps = DB.getBonusExpenses();
        bonusSources.forEach(src => {
          bExps.push({ id: genId('bsup'), periodId: src.periodId, date: new Date().toISOString().split('T')[0],
            categoryId: src.categoryId, itemId: src.itemId, amount: src.amount, memo, source: 'bonus_supply', supplyId: supId });
        });
        DB.saveBonusExpenses(bExps);
      }
    } else {
      const supIdx = data.bonusSupplies.findIndex(s => s.id === sup.id);
      if (supIdx < 0) return false;
      data.bonusSupplies[supIdx] = { id: sup.id, monthlyCategoryId: mCatId, monthlyItemId: mItemId, label, amount, bonusSources };
      DB.saveMonthlyData(periodKey, data);
      DB.saveBonusExpenses(DB.getBonusExpenses().filter(e => e.supplyId !== sup.id));
      if (bonusSources.length) {
        const bExps = DB.getBonusExpenses();
        bonusSources.forEach(src => {
          bExps.push({ id: genId('bsup'), periodId: src.periodId, date: new Date().toISOString().split('T')[0],
            categoryId: src.categoryId, itemId: src.itemId, amount: src.amount, memo, source: 'bonus_supply', supplyId: sup.id });
        });
        DB.saveBonusExpenses(bExps);
      }
    }

    renderMonthly();
    if (state.activeTab === 'bonus') renderBonus();
  });

  if (hasBonusData) setTimeout(() => supUpdateBItems(), 100);
}

// Global helpers for bonus supply form
function supUpdateMItems() {
  const catId = document.getElementById('sup-m-cat')?.value;
  const sel   = document.getElementById('sup-m-item');
  if (!sel || !catId) return;
  const cat = DB.getMonthlyCats().find(c => c.id === catId);
  sel.innerHTML = cat && cat.items.length
    ? cat.items.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')
    : '<option value="">（内容なし）</option>';
}

function supUpdateBItems() {
  const bPeriodId = document.getElementById('sup-b-period')?.value;
  const bCatId    = document.getElementById('sup-b-cat')?.value;
  const container = document.getElementById('sup-b-items-list');
  if (!container) return;

  const items = DB.getBonusItems().filter(i => i.periodId === bPeriodId && i.categoryId === bCatId);
  if (!items.length) {
    container.innerHTML = '<div style="padding:6px;color:var(--text-muted);font-size:12px">内容がありません</div>';
    supRecalcTotal();
    return;
  }

  container.innerHTML = items.map(item => {
    const rem    = getBonusItemRemaining(item);
    const clsRem = rem <= 0 ? 'negative' : 'positive';
    return `
      <div class="sup-chk-row">
        <label class="sup-chk-label">
          <input type="checkbox" value="${item.id}" data-rem="${rem}" onchange="supToggleBItem(this)">
          <span class="sup-chk-name">${esc(item.name)}</span>
          <span class="sup-chk-rem ${clsRem}">${fmtSigned(rem)}</span>
        </label>
        <div class="sup-chk-amt" id="sup-chk-amt-${item.id}" style="display:none">
          <input class="form-input" type="number" id="sup-amt-${item.id}" value="${Math.max(0, rem)}" inputmode="numeric" oninput="supRecalcTotal()">
        </div>
      </div>
    `;
  }).join('');

  // Apply pre-selection in edit mode
  if (_supEditSources) {
    _supEditSources.forEach(src => {
      if (src.periodId === bPeriodId && src.categoryId === bCatId) {
        const cb = container.querySelector(`input[type=checkbox][value="${src.itemId}"]`);
        if (cb) {
          cb.checked = true;
          const amtDiv = document.getElementById('sup-chk-amt-' + src.itemId);
          if (amtDiv) amtDiv.style.display = '';
          const amtInput = document.getElementById('sup-amt-' + src.itemId);
          if (amtInput) amtInput.value = src.amount;
        }
      }
    });
  }

  supRecalcTotal();
}

function supToggleBItem(cb) {
  const amtDiv = document.getElementById('sup-chk-amt-' + cb.value);
  if (amtDiv) amtDiv.style.display = cb.checked ? '' : 'none';
  supRecalcTotal();
}

function supRecalcTotal() {
  let total = 0;
  document.querySelectorAll('#sup-b-items-list input[type=checkbox]:checked').forEach(cb => {
    total += parseInt(document.getElementById('sup-amt-' + cb.value)?.value || '0') || 0;
  });
  const totalEl = document.getElementById('sup-bonus-total');
  if (totalEl) totalEl.textContent = fmt(total);
  if (total > 0) {
    const supAmountEl = document.getElementById('sup-amount');
    if (supAmountEl && !supAmountEl.value) supAmountEl.value = total;
  }
}

function deleteBonusSupply(periodKey, supId) {
  if (!confirm('このボーナス補充を削除しますか？\nボーナスへの支出計上も取り消されます。')) return;
  const data = DB.getMonthlyData(periodKey);
  data.bonusSupplies = data.bonusSupplies.filter(s => s.id !== supId);
  DB.saveMonthlyData(periodKey, data);
  DB.saveBonusExpenses(DB.getBonusExpenses().filter(e => e.supplyId !== supId));
  renderMonthly();
  if (state.activeTab === 'bonus') renderBonus();
}

// =============================================
// INIT
// =============================================

// アプリ本体の起動（ログイン後に呼ぶ）
async function startApp() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('hidden');

  try {
    await loadAll();
  } catch (err) {
    console.error('Firestore load failed:', err);
    overlay.innerHTML = `
      <div style="text-align:center;padding:32px;max-width:320px">
        <div style="font-size:40px;margin-bottom:12px">⚠️</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:8px">読み込みに失敗しました</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px">${err.message}</div>
        <button class="btn btn-primary btn-block" onclick="location.reload()">再読み込み</button>
      </div>`;
    return;
  }

  overlay.classList.add('hidden');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Prevent scroll bounce on iOS
  document.addEventListener('touchmove', e => {
    if (e.target.closest('#modal-container')) return;
  }, { passive: false });

  renderBonus();
}

function init() {
  if (isLoggedIn()) {
    // セッション継続中 → そのままアプリ起動
    startApp();
  } else {
    // 未ログイン → ログイン画面を表示
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('login-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('login-id')?.focus(), 100);

    // Enter キーでログイン
    ['login-id', 'login-pw'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') attemptLogin();
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
