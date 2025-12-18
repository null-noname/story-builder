// Firebase SDKのインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, query, orderBy, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- Firebase設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyDc5HZ1PVW7H8-Pe8PBoY_bwCMm0jd5_PU",
  authDomain: "story-builder-app.firebaseapp.com",
  projectId: "story-builder-app",
  storageBucket: "story-builder-app.firebasestorage.app",
  messagingSenderId: "763153451684",
  appId: "1:763153451684:web:37a447d4cafb4abe41f431"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// --- 状態変数 ---
let currentUser = null;
let currentWorkId = null;
let currentChapterId = null;
let currentMemoId = null;
let worksData = [];
let chaptersData = [];

// --- DOM要素キャッシュ ---
const views = {
    login: document.getElementById('login-screen'),
    app: document.getElementById('app-container'),
    top: document.getElementById('top-screen'),
    workspace: document.getElementById('work-workspace'),
    stats: document.getElementById('stats-screen'),
    commonMemo: document.getElementById('common-memo-screen'),
    memoEdit: document.getElementById('memo-edit-screen')
};

const header = {
    el: document.getElementById('global-header'),
    backBtn: document.getElementById('header-back-btn'),
    title: document.getElementById('header-title'),
    delBtn: document.getElementById('header-delete-btn')
};

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            showApp();
            loadDashboard();
        } else {
            currentUser = null;
            showLogin();
        }
    });
    setupEventListeners();
});

function showLogin() {
    views.login.style.display = 'flex';
    views.app.style.display = 'none';
}

function showApp() {
    views.login.style.display = 'none';
    views.app.style.display = 'flex';
    switchView('top');
}

function switchView(viewName) {
    Object.values(views).forEach(v => v.style.display = 'none');
    
    // ヘッダー制御
    header.el.style.display = (viewName === 'memoEdit') ? 'flex' : 'none';

    if(viewName === 'top') views.top.style.display = 'block';
    if(viewName === 'workspace') views.workspace.style.display = 'flex';
    if(viewName === 'stats') views.stats.style.display = 'block';
    if(viewName === 'commonMemo') views.commonMemo.style.display = 'flex';
    if(viewName === 'memoEdit') views.memoEdit.style.display = 'flex';
}

// --- イベントリスナー ---
function setupEventListeners() {
    // Auth
    document.getElementById('login-btn').addEventListener('click', () => signInWithPopup(auth, provider));
    // ヘッダー戻るボタン（メモ編集から一覧へ）
    header.backBtn.addEventListener('click', async () => {
        if(currentMemoId) await saveCurrentMemo();
        switchView('commonMemo');
        loadCommonMemos();
    });
    // メモ削除ボタン
    header.delBtn.addEventListener('click', async () => {
        if(confirm("このメモを削除しますか？")) {
            await deleteDoc(doc(db, `users/${currentUser.uid}/memos`, currentMemoId));
            switchView('commonMemo');
            loadCommonMemos();
        }
    });

    // TOP
    document.getElementById('create-work-btn').addEventListener('click', createNewWork);
    document.getElementById('common-memo-btn').addEventListener('click', () => {
        loadCommonMemos();
        switchView('commonMemo');
    });
    document.getElementById('diary-widget').addEventListener('click', () => {
        loadStats(); // 統計データ更新
        switchView('stats');
    });
    document.getElementById('close-stats-btn').addEventListener('click', () => switchView('top'));

    // フィルタ・ソート
    document.getElementById('sort-order').addEventListener('change', () => renderWorkList());
    document.getElementById('filter-status').addEventListener('change', () => renderWorkList());

    // ワークスペース
    document.getElementById('workspace-back-btn').addEventListener('click', () => {
        saveCurrentChapter();
        switchView('top');
        loadDashboard();
    });
    
    const tabBtns = document.querySelectorAll('.workspace-tabs .tab-btn:not(.back-tab)');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    // エディタ
    document.getElementById('main-editor').addEventListener('input', updateCharCount);
    document.getElementById('toggle-vertical-btn').addEventListener('click', () => {
        document.querySelector('.editor-wrapper').classList.toggle('vertical-mode');
    });
    document.getElementById('add-chapter-btn').addEventListener('click', addChapter);
    document.getElementById('save-chapter-btn').addEventListener('click', saveCurrentChapter);

    // 作品情報
    document.getElementById('update-work-info-btn').addEventListener('click', updateWorkInfo);
    document.getElementById('edit-work-catchphrase').addEventListener('input', (e) => {
        document.getElementById('catchphrase-counter').textContent = `残り${35 - e.target.value.length}`;
    });

    // 共通メモ
    document.getElementById('add-memo-btn').addEventListener('click', createNewMemo);
}

// --- 作品管理 ---
async function loadDashboard() {
    if(!currentUser) return;
    const q = query(collection(db, `users/${currentUser.uid}/works`), orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    worksData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
    
    // 統計情報の更新（簡易）
    let totalChars = 0;
    worksData.forEach(w => totalChars += (w.totalCharCount || 0));
    document.getElementById('stat-today').textContent = "1200"; // 仮
    document.getElementById('stat-week').textContent = "5000"; // 仮
    document.getElementById('today-count').textContent = "1200"; // 仮
    document.getElementById('week-count').textContent = "5000"; // 仮
    document.getElementById('stat-works').textContent = worksData.length;

    renderWorkList();
}

function renderWorkList() {
    const listContainer = document.getElementById('work-list');
    listContainer.innerHTML = '';

    // フィルタ
    const statusFilter = document.getElementById('filter-status').value;
    let filtered = (statusFilter === 'all') ? worksData : worksData.filter(w => w.status === statusFilter);

    // ソート
    const sortKey = document.getElementById('sort-order').value === 'created' ? 'createdAt' : 'updatedAt';
    filtered.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const da = a[sortKey]?.toDate() || new Date(0);
        const db = b[sortKey]?.toDate() || new Date(0);
        return db - da;
    });

    filtered.forEach(work => {
        // 更新日時のフォーマット: 2025/12/20 12:10
        const d = work.updatedAt ? work.updatedAt.toDate() : new Date();
        const dateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours()}:${d.getMinutes()}`;
        const createD = work.createdAt ? work.createdAt.toDate() : new Date();
        const createStr = `${createD.getFullYear()}/${(createD.getMonth()+1).toString().padStart(2,'0')}/${createD.getDate().toString().padStart(2,'0')}`;

        const card = document.createElement('div');
        card.className = 'work-card';
        card.innerHTML = `
            <div class="work-card-header">
                <div class="work-card-title" onclick="openWork('${work.id}')">${work.title}</div>
                <div class="work-card-actions">
                    <button class="mini-btn" onclick="openWork('${work.id}')">編集</button>
                    <button class="mini-btn delete" onclick="deleteWork('${work.id}')">削除</button>
                    <button class="star-btn ${work.pinned?'active':''}" onclick="togglePin('${work.id}', ${!work.pinned})">★</button>
                </div>
            </div>
            <div class="work-card-meta">
                作成日: ${createStr}　更新日: ${dateStr}
            </div>
        `;
        listContainer.appendChild(card);
    });
}

window.deleteWork = async (id) => {
    if(confirm("作品を削除しますか？復元できません。")) {
        await deleteDoc(doc(db, `users/${currentUser.uid}/works`, id));
        loadDashboard();
    }
};

window.togglePin = async (id, status) => {
    await updateDoc(doc(db, `users/${currentUser.uid}/works`, id), { pinned: status });
    loadDashboard();
};

window.openWork = async (workId) => {
    currentWorkId = workId;
    const work = worksData.find(w => w.id === workId);
    
    // フォームへの反映
    document.getElementById('edit-work-title').value = work.title;
    document.getElementById('edit-work-catchphrase').value = work.catchphrase || '';
    document.getElementById('edit-work-status').value = work.status || 'writing';
    
    await loadChapters(workId);
    switchView('workspace');
    document.querySelector('.tab-btn[data-target="editor-view"]').click();
};

// --- チャプター機能 (簡易版) ---
async function loadChapters(workId) {
    const q = query(collection(db, `users/${currentUser.uid}/works/${workId}/chapters`), orderBy("order"));
    const snapshot = await getDocs(q);
    chaptersData = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
    
    const list = document.getElementById('chapter-list');
    list.innerHTML = '';
    let total = 0;
    
    chaptersData.forEach((c, i) => {
        const div = document.createElement('div');
        div.className = 'chapter-item'; // CSSで定義済みと仮定
        div.textContent = c.title || `第${i+1}話`;
        div.style.padding = "10px";
        div.style.borderBottom = "1px solid #444";
        div.style.cursor = "pointer";
        div.onclick = () => selectChapter(c.id);
        list.appendChild(div);
        total += (c.charCount || 0);
    });
    
    document.getElementById('work-total-chars').textContent = total;
    if(chaptersData.length > 0) selectChapter(chaptersData[0].id);
    else {
        document.getElementById('main-editor').value = '';
        document.getElementById('chapter-title-input').value = '';
    }
}

async function addChapter() {
    await addDoc(collection(db, `users/${currentUser.uid}/works/${currentWorkId}/chapters`), {
        title: `第${chaptersData.length+1}話`, content: '', order: chaptersData.length, charCount: 0, updatedAt: serverTimestamp()
    });
    loadChapters(currentWorkId);
}

function selectChapter(id) {
    currentChapterId = id;
    const c = chaptersData.find(x => x.id === id);
    document.getElementById('main-editor').value = c.content || '';
    document.getElementById('chapter-title-input').value = c.title || '';
    updateCharCount();
}

async function saveCurrentChapter() {
    if(!currentChapterId) return;
    const content = document.getElementById('main-editor').value;
    const title = document.getElementById('chapter-title-input').value;
    const count = content.replace(/[\s\n]/g, '').length;
    
    await updateDoc(doc(db, `users/${currentUser.uid}/works/${currentWorkId}/chapters`, currentChapterId), {
        content, title, charCount: count, updatedAt: serverTimestamp()
    });
    // 本来はWorkの合計文字数も更新すべき
}

function updateCharCount() {
    const val = document.getElementById('main-editor').value;
    document.getElementById('char-count-all').textContent = val.length;
    document.getElementById('char-count-net').textContent = val.replace(/[\s\n]/g, '').length;
}

// --- エディタ補助 ---
window.insertText = (text, wrap='') => {
    const el = document.getElementById('main-editor');
    const start = el.selectionStart;
    const val = el.value;
    let ins = text;
    if(wrap) {
        const sel = val.substring(start, el.selectionEnd);
        ins = sel ? `|${sel}《》` : `|親文字《ルビ》`;
    }
    el.value = val.substring(0, start) + ins + val.substring(el.selectionEnd);
    updateCharCount();
};

async function updateWorkInfo() {
    await updateDoc(doc(db, `users/${currentUser.uid}/works`, currentWorkId), {
        title: document.getElementById('edit-work-title').value,
        catchphrase: document.getElementById('edit-work-catchphrase').value,
        status: document.getElementById('edit-work-status').value,
        updatedAt: serverTimestamp()
    });
    alert("保存しました");
}

// --- 共通メモ機能 ---
async function createNewWork() {
    const title = prompt("作品タイトル");
    if(!title) return;
    await addDoc(collection(db, `users/${currentUser.uid}/works`), {
        title, status: 'writing', pinned: false, totalCharCount: 0, 
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    loadDashboard();
}

async function loadCommonMemos() {
    const q = query(collection(db, `users/${currentUser.uid}/memos`), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    const list = document.getElementById('memo-list');
    list.innerHTML = '';
    
    snap.forEach(d => {
        const m = d.data();
        const div = document.createElement('div');
        div.className = 'memo-card';
        // プレビュー用に本文の最初の方を取得
        const preview = m.content ? m.content.substring(0, 30) + '...' : '内容なし';
        
        div.innerHTML = `
            <div class="memo-info">
                <span class="memo-title">${m.title || '無題'}</span>
                <div class="memo-preview">${preview}</div>
            </div>
            <div class="memo-actions">
                <button class="memo-btn" onclick="openMemo('${d.id}')">編集</button>
                <button class="memo-btn" style="color:#aaa;">↑</button>
                <button class="memo-btn green" onclick="deleteMemo('${d.id}')">－</button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function createNewMemo() {
    const ref = await addDoc(collection(db, `users/${currentUser.uid}/memos`), {
        title: '新規メモ', content: '', updatedAt: serverTimestamp()
    });
    openMemo(ref.id);
}

window.openMemo = async (id) => {
    currentMemoId = id;
    const snap = await getDocs(query(collection(db, `users/${currentUser.uid}/memos`))); // 簡易取得
    const memo = snap.docs.find(d => d.id === id).data();
    
    document.getElementById('memo-edit-title').value = memo.title;
    document.getElementById('memo-edit-content').value = memo.content;
    
    // ヘッダー設定
    header.backBtn.style.display = 'block';
    header.title.textContent = 'メモ編集';
    header.delBtn.style.display = 'block';
    
    switchView('memoEdit');
};

async function saveCurrentMemo() {
    if(!currentMemoId) return;
    await updateDoc(doc(db, `users/${currentUser.uid}/memos`, currentMemoId), {
        title: document.getElementById('memo-edit-title').value,
        content: document.getElementById('memo-edit-content').value,
        updatedAt: serverTimestamp()
    });
}

window.deleteMemo = async (id) => {
    if(confirm("メモを削除しますか？")) {
        await deleteDoc(doc(db, `users/${currentUser.uid}/memos`, id));
        loadCommonMemos();
    }
};

function loadStats() {
    // グラフ描画等はChart.jsなどで行うが、ここでは数字のみ
}