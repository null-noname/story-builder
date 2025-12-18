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

// 言語設定を日本語に
auth.languageCode = 'ja';

// --- 状態変数 ---
let currentUser = null;
let currentWorkId = null;
let currentChapterId = null;
let currentMemoId = null;
let worksData = [];
let chaptersData = [];

// --- DOM要素取得 ---
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

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            showApp(); // 先に画面を表示
            loadDashboard(); // その後データを読み込む
        } else {
            currentUser = null;
            showLogin();
        }
    });
}

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
    
    if(header.el) header.el.style.display = (viewName === 'memoEdit') ? 'flex' : 'none';

    // 画面表示の復帰
    if(viewName === 'top' && views.top) views.top.style.display = 'block';
    if(viewName === 'workspace' && views.workspace) views.workspace.style.display = 'flex';
    if(viewName === 'stats' && views.stats) views.stats.style.display = 'block';
    if(viewName === 'commonMemo' && views.commonMemo) views.commonMemo.style.display = 'flex';
    if(viewName === 'memoEdit' && views.memoEdit) views.memoEdit.style.display = 'flex';
}

// --- イベントリスナー ---
function setupEventListeners() {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error("Login Error:", error);
                alert("ログインエラー:\n" + error.message);
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    const headerRight = document.querySelector('.header-right');
    if (!document.getElementById('logout-btn') && headerRight) {
        const btn = document.createElement('button');
        btn.id = 'logout-btn';
        btn.className = 'icon-btn';
        btn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
        headerRight.appendChild(btn);
    }
    const safeLogoutBtn = document.getElementById('logout-btn');
    if (safeLogoutBtn) safeLogoutBtn.addEventListener('click', () => signOut(auth));


    // ヘッダー操作
    const header = getHeader();
    if (header.backBtn) {
        header.backBtn.addEventListener('click', async () => {
            if(currentMemoId) await saveCurrentMemo();
            switchView('commonMemo');
            loadCommonMemos();
        });
    }
    if (header.delBtn) {
        header.delBtn.addEventListener('click', async () => {
            if(confirm("このメモを削除しますか？")) {
                await deleteDoc(doc(db, `users/${currentUser.uid}/memos`, currentMemoId));
                switchView('commonMemo');
                loadCommonMemos();
            }
        });
    }

    // TOP画面
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

// --- 作品管理（エラー対応強化版） ---
async function loadDashboard() {
    if(!currentUser) return;
    try {
        const q = query(collection(db, `users/${currentUser.uid}/works`), orderBy("updatedAt", "desc"));
        const snapshot = await getDocs(q);
        worksData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // 統計表示 (モックデータ)
        const statWorksEl = document.getElementById('stat-works');
        if(statWorksEl) statWorksEl.textContent = worksData.length;

        // リスト描画
        renderWorkList();

    } catch (e) {
        console.error("Data load error:", e);
        
        const listContainer = document.getElementById('work-list');
        if(listContainer) {
            let errorMsg = "通信エラー";
            let subMsg = "コンソールを確認してください。";
            let solution = "";

            // エラーの種類による分岐
            if (e.code === 'unavailable' || e.message.includes('Failed to fetch') || e.message.includes('offline')) {
                // ここが今回の原因である可能性大
                errorMsg = "通信がブロックされました";
                subMsg = "アドブロック（広告ブロック）等の拡張機能が、データベースへの接続を遮断している可能性があります。";
                solution = "ブラウザの拡張機能設定で、このサイトのブロックを解除（オフに）してください。";
            } else if (e.code === 'permission-denied') {
                errorMsg = "アクセス権限がありません";
                subMsg = "Firestoreのルール設定が必要です。";
                solution = "Firebaseコンソールの「Rules」を設定してください。";
            } else if (e.code === 'unimplemented' || e.code === 'not-found') {
                errorMsg = "データベース未作成";
                solution = "Firebaseコンソールで「Firestore Database」を作成してください。";
            }

            listContainer.innerHTML = `
                <div style="padding: 20px; border: 2px solid #ff6b6b; background: #331111; border-radius: 8px;">
                    <h3 style="color: #ff6b6b; margin-top:0;">⚠️ ${errorMsg}</h3>
                    <p>${subMsg}</p>
                    <p style="font-weight:bold; color: #fff;">解決策: ${solution}</p>
                    <hr style="border-color:#555;">
                    <p style="font-size:0.8em; color:#ccc;">エラー詳細: ${e.message}</p>
                </div>
            `;
        }
    }
}

function renderWorkList() {
    const listContainer = document.getElementById('work-list');
    if(!listContainer) return;
    listContainer.innerHTML = '';

    const filterStatusEl = document.getElementById('filter-status');
    const statusFilter = filterStatusEl ? filterStatusEl.value : 'all';
    let filtered = (statusFilter === 'all') ? worksData : worksData.filter(w => w.status === statusFilter);

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
            <div class="work-card-meta">更新: ${dateStr}</div>
        `;
        listContainer.appendChild(card);
    });
}

window.deleteWork = async (id) => {
    if(confirm("削除しますか？")) {
        try {
            await deleteDoc(doc(db, `users/${currentUser.uid}/works`, id));
            loadDashboard();
        } catch(e) { alert("削除エラー: " + e.message); }
    }
};

window.togglePin = async (id, status) => {
    try {
        await updateDoc(doc(db, `users/${currentUser.uid}/works`, id), { pinned: status });
        loadDashboard();
    } catch(e) { console.error(e); }
};

window.openWork = async (workId) => {
    currentWorkId = workId;
    const work = worksData.find(w => w.id === workId);
    
    document.getElementById('edit-work-title').value = work.title;
    document.getElementById('edit-work-catchphrase').value = work.catchphrase || '';
    document.getElementById('edit-work-status').value = work.status || 'writing';
    
    await loadChapters(workId);
    switchView('workspace');
    document.querySelector('.tab-btn[data-target="editor-view"]').click();
};

async function loadChapters(workId) {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/works/${workId}/chapters`), orderBy("order"));
        const snapshot = await getDocs(q);
        chaptersData = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
        
        const list = document.getElementById('chapter-list');
        list.innerHTML = '';
        let total = 0;
        
        chaptersData.forEach((c, i) => {
            const div = document.createElement('div');
            div.className = 'chapter-item';
            div.textContent = c.title || `第${i+1}話`;
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
    } catch(e) { console.error(e); }
}

async function addChapter() {
    try {
        await addDoc(collection(db, `users/${currentUser.uid}/works/${currentWorkId}/chapters`), {
            title: `第${chaptersData.length+1}話`, content: '', order: chaptersData.length, charCount: 0, updatedAt: serverTimestamp()
        });
        loadChapters(currentWorkId);
    } catch(e) { alert("チャプター作成エラー: " + e.message); }
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
    try {
        const content = document.getElementById('main-editor').value;
        const title = document.getElementById('chapter-title-input').value;
        const count = content.replace(/[\s\n]/g, '').length;
        
        await updateDoc(doc(db, `users/${currentUser.uid}/works/${currentWorkId}/chapters`, currentChapterId), {
            content, title, charCount: count, updatedAt: serverTimestamp()
        });
    } catch(e) { alert("保存エラー: " + e.message); }
}

function updateCharCount() {
    const val = document.getElementById('main-editor').value;
    document.getElementById('char-count-all').textContent = val.length;
    document.getElementById('char-count-net').textContent = val.replace(/[\s\n]/g, '').length;
}

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
    try {
        await updateDoc(doc(db, `users/${currentUser.uid}/works`, currentWorkId), {
            title: document.getElementById('edit-work-title').value,
            catchphrase: document.getElementById('edit-work-catchphrase').value,
            status: document.getElementById('edit-work-status').value,
            updatedAt: serverTimestamp()
        });
        alert("保存しました");
    } catch(e) { alert("更新エラー: " + e.message); }
}

// --- 共通メモ ---
async function createNewWork() {
    const title = prompt("作品タイトル");
    if(!title) return;
    try {
        await addDoc(collection(db, `users/${currentUser.uid}/works`), {
            title, status: 'writing', pinned: false, totalCharCount: 0, 
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        loadDashboard();
    } catch(e) { alert("作成エラー: " + e.message); }
}

async function loadCommonMemos() {
    if(!currentUser) return;
    try {
        const q = query(collection(db, `users/${currentUser.uid}/memos`), orderBy("updatedAt", "desc"));
        const snap = await getDocs(q);
        const list = document.getElementById('memo-list');
        list.innerHTML = '';
        
        snap.forEach(d => {
            const m = d.data();
            const div = document.createElement('div');
            div.className = 'memo-card';
            const preview = m.content ? m.content.substring(0, 30) + '...' : '内容なし';
            div.innerHTML = `
                <div class="memo-info"><span class="memo-title">${m.title||'無題'}</span><div class="memo-preview">${preview}</div></div>
                <div class="memo-actions">
                    <button class="memo-btn" onclick="openMemo('${d.id}')">編集</button>
                    <button class="memo-btn green" onclick="deleteMemo('${d.id}')">－</button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch(e) { console.error(e); }
}

async function createNewMemo() {
    try {
        const ref = await addDoc(collection(db, `users/${currentUser.uid}/memos`), {
            title: '新規メモ', content: '', updatedAt: serverTimestamp()
        });
        openMemo(ref.id);
    } catch(e) { alert("メモ作成エラー: " + e.message); }
}

window.openMemo = async (id) => {
    currentMemoId = id;
    const snap = await getDocs(query(collection(db, `users/${currentUser.uid}/memos`)));
    const memo = snap.docs.find(d => d.id === id).data();
    document.getElementById('memo-edit-title').value = memo.title;
    document.getElementById('memo-edit-content').value = memo.content;
    
    const h = getHeader();
    h.backBtn.style.display = 'block'; h.title.textContent = 'メモ編集'; h.delBtn.style.display = 'block';
    switchView('memoEdit');
};

async function saveCurrentMemo() {
    if(!currentMemoId) return;
    try {
        await updateDoc(doc(db, `users/${currentUser.uid}/memos`, currentMemoId), {
            title: document.getElementById('memo-edit-title').value,
            content: document.getElementById('memo-edit-content').value,
            updatedAt: serverTimestamp()
        });
    } catch(e) { console.error(e); }
}

window.deleteMemo = async (id) => {
    if(confirm("削除しますか？")) {
        try {
            await deleteDoc(doc(db, `users/${currentUser.uid}/memos`, id));
            loadCommonMemos();
        } catch(e) { alert("削除エラー: " + e.message); }
    }
};

function loadStats() {}