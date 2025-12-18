/* Story Builder V0.06 script.js */

// --- Firebase Config (埋め込み済み) ---
const firebaseConfig = {
  apiKey: "AIzaSyDc5HZ1PVW7H8-Pe8PBoY_bwCMm0jd5_PU",
  authDomain: "story-builder-app.firebaseapp.com",
  projectId: "story-builder-app",
  storageBucket: "story-builder-app.firebasestorage.app",
  messagingSenderId: "763153451684",
  appId: "1:763153451684:web:37a447d4cafb4abe41f431"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

let currentUser = null;
let currentWorkId = null;

// --- Elements ---
const views = {
    top: document.getElementById('top-view'),
    workspace: document.getElementById('workspace-view'),
    stats: document.getElementById('stats-view'),
    memo: document.getElementById('memo-view')
};

// --- Auth ---
document.getElementById('google-login-btn').addEventListener('click', () => {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(alert);
});

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        // ログイン時に統計データも取得（仮実装）
        loadDashboardStats(); 
        loadWorks();
    } else {
        currentUser = null;
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
    }
});

// --- View Switching ---
function switchView(name) {
    Object.values(views).forEach(el => el.style.display = 'none');
    if (views[name]) {
        views[name].style.display = (name === 'workspace') ? 'flex' : 'block';
        if(name === 'top') {
            views[name].style.display = 'flex'; // TOPはflex column
            loadDashboardStats(); // TOPに戻るたびに統計更新
        }
    }
}

// ボタンイベント設定
document.getElementById('back-to-top').addEventListener('click', () => { saveCurrentWork(); switchView('top'); loadWorks(); });
document.getElementById('back-from-stats').addEventListener('click', () => switchView('top'));
document.getElementById('back-from-memo').addEventListener('click', () => switchView('top'));
document.getElementById('btn-common-memo').addEventListener('click', () => switchView('memo'));

// ★ここが修正点：執筆日記クリックで統計へ
document.getElementById('diary-widget').addEventListener('click', () => switchView('stats'));

// --- Dashboard Stats (仮実装) ---
function loadDashboardStats() {
    // 本当はFirestoreから集計するが、今は仮の値または変数を表示
    // ※今後、執筆履歴コレクションを作って集計するロジックを実装します
    document.getElementById('widget-today-count').textContent = "0 字";
    document.getElementById('widget-weekly-count').textContent = "0 字";
}

// --- Works Logic ---
const workListEl = document.getElementById('work-list');

document.getElementById('create-new-work-btn').addEventListener('click', async () => {
    if (!currentUser) return;
    const newWork = {
        uid: currentUser.uid,
        title: "無題の物語",
        catchphrase: "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        const doc = await db.collection('works').add(newWork);
        openWork(doc.id);
    } catch (e) { console.error(e); }
});

function loadWorks() {
    if (!currentUser) return;
    // 更新日順にソート（インデックス作成済み前提）
    db.collection('works')
        .where('uid', '==', currentUser.uid)
        .orderBy('updatedAt', 'desc')
        .get().then(snapshot => {
            workListEl.innerHTML = '';
            snapshot.forEach(doc => {
                workListEl.appendChild(createWorkCard(doc.id, doc.data()));
            });
        });
}

function createWorkCard(id, data) {
    const div = document.createElement('div');
    div.className = 'work-card';
    const dateStr = data.updatedAt ? new Date(data.updatedAt.toDate()).toLocaleString() : '-';
    
    div.innerHTML = `
        <div class="work-card-header">
            <div class="work-title" onclick="openWork('${id}')">${escapeHtml(data.title)}</div>
            <div class="card-actions">
                <button class="primary-btn" onclick="openWork('${id}')">編集</button>
                <button class="mini-btn delete-btn" onclick="deleteWork(event, '${id}')">削除</button>
                <button class="star-btn">☆</button>
            </div>
        </div>
        <div class="work-meta">
            更新日: ${dateStr}
        </div>
    `;
    return div;
}

window.deleteWork = function(e, id) {
    e.stopPropagation();
    if(confirm("削除しますか？")) {
        db.collection('works').doc(id).delete().then(loadWorks);
    }
}

// --- Workspace & Tabs ---
function openWork(id) {
    currentWorkId = id;
    db.collection('works').doc(id).get().then(doc => {
        if(doc.exists) {
            const data = doc.data();
            document.getElementById('work-title-input').value = data.title || "";
            document.getElementById('work-catchphrase').value = data.catchphrase || "";
            document.getElementById('work-desc-input').value = data.description || "";
            document.getElementById('main-editor').value = data.content || "";
            // ...他フィールドも必要に応じて
            switchView('workspace');
        }
    });
}

// 簡易保存
document.getElementById('save-work-info-btn').addEventListener('click', saveCurrentWork);
function saveCurrentWork() {
    if(!currentWorkId) return;
    db.collection('works').doc(currentWorkId).update({
        title: document.getElementById('work-title-input').value,
        catchphrase: document.getElementById('work-catchphrase').value,
        description: document.getElementById('work-desc-input').value,
        content: document.getElementById('main-editor').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => alert("保存しました"));
}

// タブ切り替え
document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// 文字数カウント
document.getElementById('main-editor').addEventListener('input', (e) => {
    document.getElementById('editor-char-count').textContent = e.target.value.replace(/\s/g, '').length + "文字";
});

function escapeHtml(str) {
    if(!str) return "";
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','-':'&#039;','"':'&quot;'}[m]));
}