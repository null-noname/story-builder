/* Story Builder V0.07 script.js - Design Replication Edition */

// --- Firebase Config ---
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

// --- DOM Elements ---
const views = {
    top: document.getElementById('top-view'),
    workspace: document.getElementById('workspace-view'),
    stats: document.getElementById('stats-view'),
    memo: document.getElementById('memo-view')
};
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');

// --- Auth ---
document.getElementById('google-login-btn').addEventListener('click', () => {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(alert);
});

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        loginScreen.style.display = 'none';
        mainApp.style.display = 'block';
        switchView('top');
        loadWorks();
    } else {
        currentUser = null;
        loginScreen.style.display = 'flex';
        mainApp.style.display = 'none';
    }
});

// --- Navigation ---
function switchView(name) {
    Object.values(views).forEach(el => el.style.display = 'none');
    if (views[name]) {
        views[name].style.display = (name === 'top') ? 'flex' : 'flex'; 
        if(name === 'top') loadWorks();
    }
}

// Event Listeners for Navigation
document.getElementById('diary-widget').addEventListener('click', () => switchView('stats'));
document.getElementById('btn-common-memo').addEventListener('click', () => switchView('memo'));
document.getElementById('back-to-top').addEventListener('click', () => { saveCurrentWork(); switchView('top'); });
document.getElementById('back-from-stats').addEventListener('click', () => switchView('top'));
document.getElementById('back-from-memo').addEventListener('click', () => switchView('top'));

// --- Work Management ---
document.getElementById('create-new-work-btn').addEventListener('click', async () => {
    if (!currentUser) return;
    const newWork = {
        uid: currentUser.uid,
        title: "無題の物語",
        catchphrase: "",
        status: "in_progress",
        isPinned: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        const doc = await db.collection('works').add(newWork);
        openWork(doc.id);
    } catch (e) { console.error(e); }
});

// 作品リスト描画 (提供されたデザインを再現)
function loadWorks() {
    if (!currentUser) return;
    const sortKey = document.getElementById('sort-order').value === 'created' ? 'createdAt' : 'updatedAt';
    
    db.collection('works')
        .where('uid', '==', currentUser.uid)
        .orderBy(sortKey, 'desc')
        .get().then(snapshot => {
            const listEl = document.getElementById('work-list');
            listEl.innerHTML = '';
            snapshot.forEach(doc => {
                listEl.appendChild(createWorkItem(doc.id, doc.data()));
            });
        });
}

// カード生成HTML (いただいたコードのHTML構造をJSで生成)
function createWorkItem(id, data) {
    const div = document.createElement('div');
    // ピン留めクラスの付与
    div.className = `work-item ${data.isPinned ? 'pinned' : ''}`;
    
    // 日付フォーマット (YYYY/MM/DD HH:MM:SS)
    const formatDate = (ts) => {
        if(!ts) return '-';
        const d = new Date(ts.toDate());
        return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
    };

    const pinnedStar = data.isPinned ? '★' : '☆';
    const titlePrefix = data.isPinned ? '★ ' : '';

    div.innerHTML = `
        <div class="work-info" onclick="openWork('${id}')">
            <div class="work-title">${titlePrefix}${escapeHtml(data.title)}</div>
            <div class="work-meta">
                作成: ${formatDate(data.createdAt)} | 更新: ${formatDate(data.updatedAt)} | 全 ${data.totalChars || 0} 字
            </div>
        </div>
        <div class="work-actions">
            <button class="btn-custom btn-small" onclick="openWork('${id}')">編集</button>
            <button class="btn-custom btn-small" style="color:#ff8888;" onclick="deleteWork(event, '${id}')">削除</button>
            <button class="btn-custom btn-small" onclick="togglePin(event, '${id}', ${!data.isPinned})">${pinnedStar}</button>
        </div>
    `;
    return div;
}

// 削除
window.deleteWork = function(e, id) {
    e.stopPropagation();
    if(confirm("削除しますか？")) {
        db.collection('works').doc(id).delete().then(loadWorks);
    }
};

// ピン留め
window.togglePin = function(e, id, newState) {
    e.stopPropagation();
    db.collection('works').doc(id).update({ isPinned: newState }).then(loadWorks);
};

// --- Editor Logic ---
window.openWork = function(id) {
    currentWorkId = id;
    db.collection('works').doc(id).get().then(doc => {
        if(doc.exists) {
            const data = doc.data();
            fillWorkspace(data);
            switchView('workspace');
        }
    });
};

function fillWorkspace(data) {
    document.getElementById('work-title-input').value = data.title || "";
    document.getElementById('work-catchphrase').value = data.catchphrase || "";
    document.getElementById('work-genre-main').value = data.genreMain || "";
    document.getElementById('work-genre-sub').value = data.genreSub || "";
    document.getElementById('work-desc-input').value = data.description || "";
    document.getElementById('main-editor').value = data.content || "";
    
    // ラジオボタン
    const statusVal = data.status || "in_progress";
    const radio = document.querySelector(`input[name="status"][value="${statusVal}"]`);
    if(radio) radio.checked = true;

    updateCharCount();
    updateCatchCount();
}

// 保存
document.getElementById('save-work-info-btn').addEventListener('click', saveCurrentWork);
document.getElementById('quick-save-btn').addEventListener('click', saveCurrentWork);

function saveCurrentWork() {
    if(!currentWorkId) return;
    
    const content = document.getElementById('main-editor').value;
    const status = document.querySelector('input[name="status"]:checked')?.value || "in_progress";

    const data = {
        title: document.getElementById('work-title-input').value,
        catchphrase: document.getElementById('work-catchphrase').value,
        genreMain: document.getElementById('work-genre-main').value,
        genreSub: document.getElementById('work-genre-sub').value,
        description: document.getElementById('work-desc-input').value,
        status: status,
        content: content,
        totalChars: content.length,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection('works').doc(currentWorkId).update(data)
        .then(() => alert("保存しました"));
}

// 文字数カウントなど
document.getElementById('main-editor').addEventListener('input', updateCharCount);
function updateCharCount() {
    const len = document.getElementById('main-editor').value.length;
    document.getElementById('editor-char-count').textContent = len;
}

document.getElementById('work-catchphrase').addEventListener('input', updateCatchCount);
function updateCatchCount() {
    const len = document.getElementById('work-catchphrase').value.length;
    document.getElementById('catch-remain').textContent = 35 - len;
}

// タブ切り替え
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const contentId = btn.getAttribute('data-tab');
        const content = document.getElementById(contentId);
        content.style.display = (contentId === 'tab-editor') ? 'flex' : 'block';
    });
});

function escapeHtml(str) {
    if(!str) return "";
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','-':'&#039;','"':'&quot;'}[m]));
}