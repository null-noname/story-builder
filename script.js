/* Story Builder Prototype V0.05 script.js
 - キャッチコピー35文字制限と残り文字数表示
 - ジャンル2枠、形式選択、レーティング複数選択、AI利用単一選択
 - ステータス管理
 - Firebase設定反映済み
*/

// --- Firebase Configuration ---
// いただいた設定情報をここに埋め込みました
const firebaseConfig = {
  apiKey: "AIzaSyDc5HZ1PVW7H8-Pe8PBoY_bwCMm0jd5_PU",
  authDomain: "story-builder-app.firebaseapp.com",
  projectId: "story-builder-app",
  storageBucket: "story-builder-app.firebasestorage.app",
  messagingSenderId: "763153451684",
  appId: "1:763153451684:web:37a447d4cafb4abe41f431"
};

// Initialize Firebase
// (HTML側で読み込んだcompatライブラリを使用するため、firebase.xxxの形式で初期化します)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// --- Global Variables ---
let currentUser = null;
let currentWorkId = null;

// --- DOM Elements ---
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const loginBtn = document.getElementById('google-login-btn');

// Views
const views = {
    top: document.getElementById('top-view'),
    workspace: document.getElementById('workspace-view'),
    stats: document.getElementById('stats-view'),
    memo: document.getElementById('memo-view')
};

// --- Auth Handling ---
loginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        console.error("Login failed:", error);
        alert("ログインに失敗しました: " + error.message);
    });
});

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        loginScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        switchView('top');
        loadWorks();
    } else {
        currentUser = null;
        loginScreen.style.display = 'flex';
        mainApp.style.display = 'none';
    }
});

// --- Navigation & View Switching ---
function switchView(viewName) {
    Object.values(views).forEach(el => el.style.display = 'none');
    if (views[viewName]) {
        views[viewName].style.display = (viewName === 'workspace') ? 'flex' : 'block';
        if(viewName === 'top') views[viewName].style.display = 'block';
        if(viewName === 'stats' || viewName === 'memo') views[viewName].style.display = 'block';
    }
}

document.getElementById('back-to-top').addEventListener('click', () => {
    saveCurrentWork(); // 戻る前に自動保存
    switchView('top');
    loadWorks(); // リスト更新
});

document.getElementById('btn-stats').addEventListener('click', () => switchView('stats'));
document.getElementById('back-from-stats').addEventListener('click', () => switchView('top'));
document.getElementById('btn-common-memo').addEventListener('click', () => switchView('memo'));
document.getElementById('back-from-memo').addEventListener('click', () => switchView('top'));

// --- Workspace Tabs ---
const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        // Add active class
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// --- Works Logic ---
const workListEl = document.getElementById('work-list');
const createWorkBtn = document.getElementById('create-new-work-btn');

// 新規作成
createWorkBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    const newWork = {
        uid: currentUser.uid,
        title: "無題の物語",
        catchphrase: "",
        genreMain: "",
        genreSub: "",
        type: "original", // original or fanfic
        description: "",
        ratings: [], // array of values
        aiUsage: "none",
        status: "in_progress",
        isPinned: false, // ピン留めフラグ
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        const docRef = await db.collection('works').add(newWork);
        openWork(docRef.id);
    } catch (e) {
        console.error("Error creating work:", e);
    }
});

// 作品リスト読み込み
function loadWorks() {
    if (!currentUser) return;
    
    let query = db.collection('works')
        .where('uid', '==', currentUser.uid);

    // ソート処理（簡易版：クライアントサイドで並び替え推奨だが今回はクエリ構築例）
    const sortVal = document.getElementById('sort-order').value;
    // Firestoreの複合インデックスが必要になるため、ここでは簡易的にupdatedの降順のみ適用
    query = query.orderBy('updatedAt', 'desc');

    query.get().then(snapshot => {
        workListEl.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const el = createWorkCard(doc.id, data);
            workListEl.appendChild(el);
        });
    });
}

// 作品カード生成
function createWorkCard(id, data) {
    const div = document.createElement('div');
    div.className = 'work-card';
    
    // ステータス表示
    let statusLabel = "制作中";
    if(data.status === 'completed') statusLabel = "完結";
    if(data.status === 'suspended') statusLabel = "中断";

    const isPinnedClass = data.isPinned ? 'active' : '';

    div.innerHTML = `
        <div class="work-card-header">
            <div class="work-card-title" onclick="openWork('${id}')">${escapeHtml(data.title)}</div>
            <div class="work-card-actions">
                <button class="star-btn ${isPinnedClass}" onclick="togglePin(event, '${id}', ${!data.isPinned})">☆</button>
                <button class="mini-btn delete" onclick="deleteWork(event, '${id}')">削除</button>
            </div>
        </div>
        <div class="work-card-meta">
            [${statusLabel}] ${escapeHtml(data.genreMain || '未設定')} / ${escapeHtml(data.genreSub || '')}<br>
            最終更新: ${data.updatedAt ? new Date(data.updatedAt.toDate()).toLocaleString() : '-'}
        </div>
    `;
    return div;
}

// ピン留め切り替え
window.togglePin = function(e, id, newState) {
    e.stopPropagation();
    db.collection('works').doc(id).update({ isPinned: newState, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
    .then(() => loadWorks());
};

// 作品削除
window.deleteWork = function(e, id) {
    e.stopPropagation();
    if(confirm("本当に削除しますか？この操作は取り消せません。")) {
        db.collection('works').doc(id).delete().then(() => loadWorks());
    }
};

// 作品を開く
function openWork(id) {
    currentWorkId = id;
    
    db.collection('works').doc(id).get().then(doc => {
        if(doc.exists) {
            const data = doc.data();
            fillWorkspace(data);
            switchView('workspace');
        }
    });
}

// ワークスペースへのデータ反映
function fillWorkspace(data) {
    document.getElementById('work-title-input').value = data.title || "";
    document.getElementById('work-catchphrase').value = data.catchphrase || "";
    updateCatchphraseCount(); // 文字数表示更新
    
    document.getElementById('work-genre-main').value = data.genreMain || "";
    document.getElementById('work-genre-sub').value = data.genreSub || "";
    document.getElementById('work-type').value = data.type || "original";
    document.getElementById('work-desc-input').value = data.description || "";
    document.getElementById('work-status').value = data.status || "in_progress";

    // チェックボックス (Ratings)
    const ratings = data.ratings || [];
    document.querySelectorAll('.rating-chk').forEach(chk => {
        chk.checked = ratings.includes(chk.value);
    });

    // ラジオボタン (AI)
    const aiVal = data.aiUsage || "none";
    const aiRadio = document.querySelector(`input[name="ai_usage"][value="${aiVal}"]`);
    if(aiRadio) aiRadio.checked = true;

    // エディタ類（実際は別コレクション管理推奨ですが、今はフィールドで）
    document.getElementById('plot-editor').value = data.plot || "";
    document.getElementById('char-editor').value = data.characterNotes || "";
    document.getElementById('main-editor').value = data.content || "";
    
    updateEditorCharCount();
}

// キャッチコピー文字数カウンター
const catchInput = document.getElementById('work-catchphrase');
const catchCounter = document.getElementById('catchphrase-counter');

catchInput.addEventListener('input', updateCatchphraseCount);

function updateCatchphraseCount() {
    const len = catchInput.value.length;
    const remaining = 35 - len;
    catchCounter.textContent = `(残り ${remaining}文字)`;
    if(remaining < 0) catchCounter.style.color = '#ff6b6b';
    else catchCounter.style.color = '#89b4fa';
}

// 執筆画面の文字数カウント
document.getElementById('main-editor').addEventListener('input', updateEditorCharCount);
function updateEditorCharCount() {
    const text = document.getElementById('main-editor').value;
    // 空白・改行を除く簡易カウント
    const count = text.replace(/\s/g, '').length;
    document.getElementById('editor-char-count').textContent = count + "文字";
}

// 保存処理
document.getElementById('save-work-info-btn').addEventListener('click', saveCurrentWork);

function saveCurrentWork() {
    if (!currentWorkId) return;

    // レーティング収集
    const selectedRatings = [];
    document.querySelectorAll('.rating-chk:checked').forEach(chk => {
        selectedRatings.push(chk.value);
    });

    // AI利用収集
    const selectedAI = document.querySelector('input[name="ai_usage"]:checked')?.value || "none";

    const updateData = {
        title: document.getElementById('work-title-input').value,
        catchphrase: document.getElementById('work-catchphrase').value,
        genreMain: document.getElementById('work-genre-main').value,
        genreSub: document.getElementById('work-genre-sub').value,
        type: document.getElementById('work-type').value,
        description: document.getElementById('work-desc-input').value,
        status: document.getElementById('work-status').value,
        ratings: selectedRatings,
        aiUsage: selectedAI,
        
        // 簡易的に本体に保存
        plot: document.getElementById('plot-editor').value,
        characterNotes: document.getElementById('char-editor').value,
        content: document.getElementById('main-editor').value,
        
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection('works').doc(currentWorkId).update(updateData)
        .then(() => {
            alert("保存しました"); // ここは後でトースト通知に変えましょう
        })
        .catch(err => console.error("Save error:", err));
}

// Utility
function escapeHtml(str) {
    if(!str) return "";
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}