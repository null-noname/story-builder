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

// アプリと認証の初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// 言語設定を日本語に固定（エラーメッセージ等が日本語になります）
auth.languageCode = 'ja';

// --- 状態変数 ---
let currentUser = null;
let currentWorkId = null;
let currentChapterId = null;
let currentMemoId = null;
let worksData = [];
let chaptersData = [];

// --- DOM要素取得ヘルパー ---
const getViews = () => ({
    login: document.getElementById('login-screen'),
    app: document.getElementById('app-container'),
    top: document.getElementById('top-screen'),
    workspace: document.getElementById('work-workspace'),
    stats: document.getElementById('stats-screen'),
    commonMemo: document.getElementById('common-memo-screen'),
    memoEdit: document.getElementById('memo-edit-screen')
});

const getHeader = () => ({
    el: document.getElementById('global-header'),
    backBtn: document.getElementById('header-back-btn'),
    title: document.getElementById('header-title'),
    delBtn: document.getElementById('header-delete-btn')
});

// --- 初期化プロセス ---
function initApp() {
    setupEventListeners();

    // 認証状態の監視
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
}

// 読み込み完了待ち
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function showLogin() {
    const views = getViews();
    if(views.login) views.login.style.display = 'flex';
    if(views.app) views.app.style.display = 'none';
}

function showApp() {
    const views = getViews();
    if(views.login) views.login.style.display = 'none';
    if(views.app) views.app.style.display = 'flex';
    switchView('top');
}

function switchView(viewName) {
    const views = getViews();
    const header = getHeader();

    Object.values(views).forEach(v => { if(v) v.style.display = 'none'; });
    
    // ヘッダー制御
    if(header.el) header.el.style.display = (viewName === 'memoEdit') ? 'flex' : 'none';

    if(viewName === 'top' && views.top) views.top.style.display = 'block';
    if(viewName === 'workspace' && views.workspace) views.workspace.style.display = 'flex';
    if(viewName === 'stats' && views.stats) views.stats.style.display = 'block';
    if(viewName === 'commonMemo' && views.commonMemo) views.commonMemo.style.display = 'flex';
    if(viewName === 'memoEdit' && views.memoEdit) views.memoEdit.style.display = 'flex';
}

// --- イベントリスナー ---
function setupEventListeners() {
    // 【修正】ログインボタン：詳細なエラーハンドリングを追加
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error("Login Error:", error);
                
                // エラー内容に応じた案内を表示
                if (error.code === 'auth/configuration-not-found') {
                    alert("【重要：設定が必要です】\n\nFirebaseコンソールで「Authentication（認証）」機能がまだ有効になっていません。\n\n1. Firebaseコンソールを開く\n2. 左メニューの「Build」→「Authentication」をクリック\n3. 「始める」ボタンを押して、Sign-in methodで「Google」を有効にしてください。");
                } else if (error.code === 'auth/unauthorized-domain') {
                    alert("【ドメイン許可エラー】\n\nこのサイトのURL（github.io等）がFirebaseで許可されていません。\n\nFirebaseコンソール > Authentication > 設定 > 承認済みドメイン に現在のドメインを追加してください。");
                } else if (error.code === 'auth/popup-blocked') {
                    alert("【ポップアップブロック】\n\nログイン画面がブラウザによってブロックされました。ポップアップを許可してください。");
                } else {
                    alert("ログインエラーが発生しました:\n" + error.message + "\n\n(コンソールを確認してください)");
                }
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));

    // ヘッダー戻るボタン
    const header = getHeader();
    if (header.backBtn) {
        header.backBtn.addEventListener('click', async () => {
            if(currentMemoId) await saveCurrentMemo();
            switchView('commonMemo');
            loadCommonMemos();
        });
    }
    // メモ削除ボタン
    if (header.delBtn) {
        header.delBtn.addEventListener('click', async () => {
            if(confirm("このメモを削除しますか？")) {
                await deleteDoc(doc(db, `users/${currentUser.uid}/memos`, currentMemoId));
                switchView('commonMemo');
                loadCommonMemos();
            }
        });
    }

    // TOP画面操作
    const createWorkBtn = document.getElementById('create-work-btn');
    if(createWorkBtn) createWorkBtn.addEventListener('click', createNewWork);
    
    const commonMemoBtn = document.getElementById('common-memo-btn');
    if(commonMemoBtn) commonMemoBtn.addEventListener('click', () => {
        loadCommonMemos();
        switchView('commonMemo');
    });

    const diaryWidget = document.getElementById('diary-widget');
    if(diaryWidget) diaryWidget.addEventListener('click', () => {
        loadStats();
        switchView('stats');
    });

    const closeStatsBtn = document.getElementById('close-stats-btn');
    if(closeStatsBtn) closeStatsBtn.addEventListener('click', () => switchView('top'));

    // フィルタ・ソート
    const sortOrder = document.getElementById('sort-order');
    if(sortOrder) sortOrder.addEventListener('change', () => renderWorkList());
    
    const filterStatus = document.getElementById('filter-status');
    if(filterStatus) filterStatus.addEventListener('change', () => renderWorkList());

    // ワークスペース
    const workspaceBackBtn = document.getElementById('workspace-back-btn');
    if(workspaceBackBtn) workspaceBackBtn.addEventListener('click', () => {
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
            const target = document.getElementById(btn.dataset.target);
            if(target) target.classList.add('active');
        });
    });

    // エディタ
    const mainEditor = document.getElementById('main-editor');
    if(mainEditor) mainEditor.addEventListener('input', updateCharCount);
    
    const toggleVerticalBtn = document.getElementById('toggle-vertical-btn');
    if(toggleVerticalBtn) toggleVerticalBtn.addEventListener('click', () => {
        const wrapper = document.querySelector('.editor-wrapper');
        if(wrapper) wrapper.classList.toggle('vertical-mode');
    });

    const addChapterBtn = document.getElementById('add-chapter-btn');
    if(addChapterBtn) addChapterBtn.addEventListener('click', addChapter);
    
    const saveChapterBtn = document.getElementById('save-chapter-btn');
    if(saveChapterBtn) saveChapterBtn.addEventListener('click', saveCurrentChapter);

    // 作品情報
    const updateWorkInfoBtn = document.getElementById('update-work-info-btn');
    if(updateWorkInfoBtn) updateWorkInfoBtn.addEventListener('click', updateWorkInfo);
    
    const editCatchphrase = document.getElementById('edit-work-catchphrase');
    if(editCatchphrase) editCatchphrase.addEventListener('input', (e) => {
        const counter = document.getElementById('catchphrase-counter');
        if(counter) counter.textContent = `残り${35 - e.target.value.length}`;
    });

    // 共通メモ
    const addMemoBtn = document.getElementById('add-memo-btn');
    if(addMemoBtn) addMemoBtn.addEventListener('click', createNewMemo);
}

// --- 作品管理 ---
async function loadDashboard() {
    if(!currentUser) return;
    try {
        const q = query(collection(db, `users/${currentUser.uid}/works`), orderBy("updatedAt", "desc"));
        const snapshot = await getDocs(q);
        worksData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // 統計表示 (モックデータのまま維持)
        const todayEl = document.getElementById('stat-today');
        if(todayEl) todayEl.textContent = "1200"; 
        
        const weekEl = document.getElementById('stat-week');
        if(weekEl) weekEl.textContent = "5000";
        
        const todayCountEl = document.getElementById('today-count');
        if(todayCountEl) todayCountEl.textContent = "1200";
        
        const weekCountEl = document.getElementById('week-count');
        if(weekCountEl) weekCountEl.textContent = "5000";
        
        const statWorksEl = document.getElementById('stat-works');
        if(statWorksEl) statWorksEl.textContent = worksData.length;

        renderWorkList();
    } catch (e) {
        console.error("Data load error:", e);
    }
}

function renderWorkList() {
    const listContainer = document.getElementById('work-list');
    if(!listContainer) return;
    
    listContainer.innerHTML = '';

    // フィルタ
    const filterStatusEl = document.getElementById('filter-status');
    const statusFilter = filterStatusEl ? filterStatusEl.value : 'all';
    
    let filtered = (statusFilter === 'all') ? worksData : worksData.filter(w => w.status === statusFilter);

    // ソート
    const sortOrderEl = document.getElementById('sort-order');
    const sortKey = (sortOrderEl && sortOrderEl.value === 'created') ? 'createdAt' : 'updatedAt';
    
    filtered.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const da = a[sortKey]?.toDate() || new Date(0);
        const db = b[sortKey]?.toDate() || new Date(0);
        return db - da;
    });

    filtered.forEach(work => {
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

// グローバル関数公開
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
    
    const titleInput = document.getElementById('edit-work-title');
    if(titleInput) titleInput.value = work.title;
    
    const catchInput = document.getElementById('edit-work-catchphrase');
    if(catchInput) catchInput.value = work.catchphrase || '';
    
    const statusInput = document.getElementById('edit-work-status');
    if(statusInput) statusInput.value = work.status || 'writing';
    
    await loadChapters(workId);
    switchView('workspace');
    
    const editorTab = document.querySelector('.tab-btn[data-target="editor-view"]');
    if(editorTab) editorTab.click();
};

// --- チャプター機能 ---
async function loadChapters(workId) {
    const q = query(collection(db, `users/${currentUser.uid}/works/${workId}/chapters`), orderBy("order"));
    const snapshot = await getDocs(q);
    chaptersData = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
    
    const list = document.getElementById('chapter-list');
    if(list) {
        list.innerHTML = '';
        let total = 0;
        
        chaptersData.forEach((c, i) => {
            const div = document.createElement('div');
            div.className = 'chapter-item';
            div.textContent = c.title || `第${i+1}話`;
            div.style.padding = "10px";
            div.style.borderBottom = "1px solid #444";
            div.style.cursor = "pointer";
            div.onclick = () => selectChapter(c.id);
            list.appendChild(div);
            total += (c.charCount || 0);
        });
        
        const totalCharsEl = document.getElementById('work-total-chars');
        if(totalCharsEl) totalCharsEl.textContent = total;
    }

    if(chaptersData.length > 0) selectChapter(chaptersData[0].id);
    else {
        const editor = document.getElementById('main-editor');
        if(editor) editor.value = '';
        const titleIn = document.getElementById('chapter-title-input');
        if(titleIn) titleIn.value = '';
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
    const editor = document.getElementById('main-editor');
    if(editor) editor.value = c.content || '';
    const titleIn = document.getElementById('chapter-title-input');
    if(titleIn) titleIn.value = c.title || '';
    updateCharCount();
}

async function saveCurrentChapter() {
    if(!currentChapterId) return;
    const editor = document.getElementById('main-editor');
    const titleIn = document.getElementById('chapter-title-input');
    const content = editor ? editor.value : '';
    const title = titleIn ? titleIn.value : '';
    const count = content.replace(/[\s\n]/g, '').length;
    
    await updateDoc(doc(db, `users/${currentUser.uid}/works/${currentWorkId}/chapters`, currentChapterId), {
        content, title, charCount: count, updatedAt: serverTimestamp()
    });
}

function updateCharCount() {
    const editor = document.getElementById('main-editor');
    if(!editor) return;
    const val = editor.value;
    
    const allCountEl = document.getElementById('char-count-all');
    if(allCountEl) allCountEl.textContent = val.length;
    
    const netCountEl = document.getElementById('char-count-net');
    if(netCountEl) netCountEl.textContent = val.replace(/[\s\n]/g, '').length;
}

// エディタ補助
window.insertText = (text, wrap='') => {
    const el = document.getElementById('main-editor');
    if(!el) return;
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
    const titleVal = document.getElementById('edit-work-title').value;
    const catchVal = document.getElementById('edit-work-catchphrase').value;
    const statusVal = document.getElementById('edit-work-status').value;

    await updateDoc(doc(db, `users/${currentUser.uid}/works`, currentWorkId), {
        title: titleVal,
        catchphrase: catchVal,
        status: statusVal,
        updatedAt: serverTimestamp()
    });
    alert("保存しました");
}

// --- 共通メモ ---
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
    if(!currentUser) return;
    const q = query(collection(db, `users/${currentUser.uid}/memos`), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    const list = document.getElementById('memo-list');
    if(!list) return;
    
    list.innerHTML = '';
    
    snap.forEach(d => {
        const m = d.data();
        const div = document.createElement('div');
        div.className = 'memo-card';
        const preview = m.content ? m.content.substring(0, 30) + '...' : '内容なし';
        
        div.innerHTML = `
            <div class="memo-info">
                <span class="memo-title">${m.title || '無題'}</span>
                <div class="memo-preview">${preview}</div>
            </div>
            <div class="memo-actions">
                <button class="memo-btn" onclick="openMemo('${d.id}')">編集</button>
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
    const snap = await getDocs(query(collection(db, `users/${currentUser.uid}/memos`))); 
    const docSnap = snap.docs.find(d => d.id === id);
    if(!docSnap) return;
    
    const memo = docSnap.data();
    
    const titleInput = document.getElementById('memo-edit-title');
    if(titleInput) titleInput.value = memo.title;
    
    const contentInput = document.getElementById('memo-edit-content');
    if(contentInput) contentInput.value = memo.content;
    
    const header = getHeader();
    if(header.backBtn) header.backBtn.style.display = 'block';
    if(header.title) header.title.textContent = 'メモ編集';
    if(header.delBtn) header.delBtn.style.display = 'block';
    
    switchView('memoEdit');
};

async function saveCurrentMemo() {
    if(!currentMemoId) return;
    const titleVal = document.getElementById('memo-edit-title').value;
    const contentVal = document.getElementById('memo-edit-content').value;

    await updateDoc(doc(db, `users/${currentUser.uid}/memos`, currentMemoId), {
        title: titleVal,
        content: contentVal,
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
    // グラフ描画（将来実装）
}