/* Story Builder V0.16 script.js */

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
let writingChart = null;
let editingMemoId = null; 
let previousView = 'top';

const views = {
    top: document.getElementById('top-view'),
    workspace: document.getElementById('workspace-view'),
    stats: document.getElementById('stats-view'),
    memo: document.getElementById('memo-view'),
    memoEditor: document.getElementById('memo-editor-view')
};
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');

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

function switchView(name) {
    Object.values(views).forEach(el => el.style.display = 'none');
    if (views[name]) {
        views[name].style.display = 'flex';
        if(name === 'top') loadWorks();
        if(name === 'memo') loadMemoList();
        if(name === 'stats') { loadStats(); renderChart(); }
        if(name === 'workspace') loadMemoListForWorkspace(); 
    }
}

document.getElementById('diary-widget').addEventListener('click', () => switchView('stats'));
document.getElementById('btn-common-memo').addEventListener('click', () => switchView('memo'));
document.getElementById('back-to-top').addEventListener('click', () => { saveCurrentWork(); switchView('top'); });
document.getElementById('back-from-stats').addEventListener('click', () => switchView('top'));
document.getElementById('back-from-memo').addEventListener('click', () => switchView('top'));

// --- Work Management ---
document.getElementById('create-new-work-btn').addEventListener('click', async () => {
    if (!currentUser) return;
    const newWork = {
        uid: currentUser.uid, title: "無題の物語", status: "in-progress", isPinned: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try { const doc = await db.collection('works').add(newWork); openWork(doc.id); } catch (e) { console.error(e); }
});

function loadWorks() {
    if (!currentUser) return;
    const sortKey = document.getElementById('sort-order').value === 'created' ? 'createdAt' : 'updatedAt';
    const filterStatus = document.getElementById('filter-status').value;
    
    db.collection('works').where('uid', '==', currentUser.uid).get().then(snapshot => {
        const listEl = document.getElementById('work-list');
        listEl.innerHTML = '';
        let worksData = [];
        snapshot.forEach(doc => { worksData.push({ ...doc.data(), id: doc.id }); });
        if(filterStatus !== 'all') worksData = worksData.filter(w => w.status === filterStatus);
        worksData.sort((a, b) => {
            if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
            const tA = a[sortKey] ? a[sortKey].toMillis() : 0;
            const tB = b[sortKey] ? b[sortKey].toMillis() : 0;
            return tB - tA;
        });
        worksData.forEach(d => listEl.appendChild(createWorkItem(d.id, d)));
    });
}

function createWorkItem(id, data) {
    const div = document.createElement('div');
    div.className = `work-item ${data.isPinned ? 'pinned' : ''}`;
    const formatDate = (ts) => ts ? new Date(ts.toDate()).toLocaleString() : '-';
    div.innerHTML = `
        <div class="work-info" onclick="openWork('${id}')">
            <div class="work-title">${data.isPinned ? '★ ' : ''}${escapeHtml(data.title || '無題')}</div>
            <div class="work-meta">更新: ${formatDate(data.updatedAt)} | 全 ${data.totalChars || 0} 字</div>
        </div>
        <div class="work-actions">
            <button class="btn-custom btn-small" onclick="openWork('${id}')">編集</button>
            <button class="btn-custom btn-small" style="color:#ff8888;" onclick="deleteWork(event, '${id}')">削除</button>
            <button class="btn-custom btn-small" onclick="togglePin(event, '${id}', ${!data.isPinned})">${data.isPinned ? '★' : '☆'}</button>
        </div>
    `;
    return div;
}

window.deleteWork = function(e, id) { e.stopPropagation(); if(confirm("削除しますか？")) db.collection('works').doc(id).delete().then(loadWorks); };
window.togglePin = function(e, id, newState) { e.stopPropagation(); db.collection('works').doc(id).update({ isPinned: newState }).then(loadWorks); };

window.openWork = function(id) {
    currentWorkId = id;
    db.collection('works').doc(id).get().then(doc => {
        if(doc.exists) { fillWorkspace(doc.data()); switchView('workspace'); }
    });
};

function fillWorkspace(data) {
    document.getElementById('input-title').value = data.title || "";
    document.getElementById('input-summary').value = data.description || "";
    document.getElementById('input-catch').value = data.catchphrase || "";
    document.getElementById('input-genre-main').value = data.genreMain || "";
    document.getElementById('input-genre-sub').value = data.genreSub || "";
    document.getElementById('main-editor').value = data.content || "";
    document.getElementById('plot-editor').value = data.plot || "";
    document.getElementById('char-editor').value = data.characterNotes || "";
    const setRadio = (name, val) => { const r = document.querySelector(`input[name="${name}"][value="${val}"]`); if(r) r.checked = true; };
    setRadio("novel-status", data.status || "in-progress");
    setRadio("novel-type", data.type || "original");
    setRadio("ai-usage", data.aiUsage || "none");
    const ratings = data.ratings || [];
    document.querySelectorAll('input[name="rating"]').forEach(c => c.checked = ratings.includes(c.value));
    updateCharCount();
    updateCatchCounter(document.getElementById('input-catch'));
    loadMemoListForWorkspace(); 
}

document.getElementById('save-work-info-btn').addEventListener('click', saveCurrentWork);
document.getElementById('quick-save-btn').addEventListener('click', saveCurrentWork);
function saveCurrentWork() {
    if(!currentWorkId) return;
    const content = document.getElementById('main-editor').value;
    const selectedRatings = [];
    document.querySelectorAll('input[name="rating"]:checked').forEach(c => selectedRatings.push(c.value));
    const data = {
        title: document.getElementById('input-title').value,
        description: document.getElementById('input-summary').value,
        catchphrase: document.getElementById('input-catch').value,
        genreMain: document.getElementById('input-genre-main').value,
        genreSub: document.getElementById('input-genre-sub').value,
        status: document.querySelector('input[name="novel-status"]:checked')?.value || "in-progress",
        type: document.querySelector('input[name="novel-type"]:checked')?.value || "original",
        aiUsage: document.querySelector('input[name="ai-usage"]:checked')?.value || "none",
        ratings: selectedRatings,
        content: content,
        plot: document.getElementById('plot-editor').value,
        characterNotes: document.getElementById('char-editor').value,
        totalChars: content.length,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection('works').doc(currentWorkId).update(data).then(() => alert("保存しました"));
}
document.getElementById('main-editor').addEventListener('input', updateCharCount);
function updateCharCount() { document.getElementById('editor-char-count').textContent = document.getElementById('main-editor').value.length; }
document.getElementById('input-catch').addEventListener('input', function() { updateCatchCounter(this); });
function updateCatchCounter(el) {
    const remain = 35 - el.value.length;
    const c = document.getElementById('c-count');
    c.textContent = `残り ${remain} 文字`;
    c.style.color = remain < 0 ? '#ff6b6b' : '#89b4fa';
}
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const contentId = btn.getAttribute('data-tab');
        document.getElementById(contentId).style.display = (contentId === 'tab-editor') ? 'flex' : 'block';
    });
});

// --- Common Memo Logic (With Save Button) ---

document.getElementById('add-new-memo-btn').addEventListener('click', () => openMemoEditor(null, 'memo'));
document.getElementById('ws-add-new-memo-btn').addEventListener('click', () => openMemoEditor(null, 'workspace'));

function loadMemoList() {
    if(!currentUser) return;
    db.collection('memos').where('uid', '==', currentUser.uid)
        .orderBy('updatedAt', 'desc').get().then(snap => {
            const container = document.getElementById('memo-list-container');
            container.innerHTML = '';
            snap.forEach(doc => container.appendChild(createMemoCard(doc.id, doc.data(), 'memo')));
        });
}
function loadMemoListForWorkspace() {
    if(!currentUser) return;
    db.collection('memos').where('uid', '==', currentUser.uid)
        .orderBy('updatedAt', 'desc').get().then(snap => {
            const container = document.getElementById('ws-memo-list-container');
            if(container) {
                container.innerHTML = '';
                snap.forEach(doc => container.appendChild(createMemoCard(doc.id, doc.data(), 'workspace')));
            }
        });
}

function createMemoCard(id, data, originView) {
    const div = document.createElement('div');
    div.className = 'memo-card';
    div.innerHTML = `
        <div class="memo-header">
            <span class="memo-title">${escapeHtml(data.title)}</span>
            <div class="memo-controls">
                <button class="memo-btn" onclick="openMemoEditor('${id}', '${originView}')">✎ 編集</button>
                <button class="memo-btn memo-btn-green-icon" onclick="deleteMemo('${id}', '${originView}')">-</button>
            </div>
        </div>
        <div class="memo-divider"></div>
        <div class="memo-text">${escapeHtml(data.content)}</div>
    `;
    return div;
}

window.deleteMemo = function(id, origin) {
    if(confirm("このメモを削除しますか？")) {
        db.collection('memos').doc(id).delete().then(() => {
            if(origin === 'memo') loadMemoList();
            else loadMemoListForWorkspace();
        });
    }
};

window.openMemoEditor = function(id, fromView) {
    editingMemoId = id;
    previousView = fromView; 
    
    if(id) {
        db.collection('memos').doc(id).get().then(doc => {
            if(doc.exists) {
                const data = doc.data();
                document.getElementById('memo-editor-title').value = data.title;
                document.getElementById('memo-editor-content').value = data.content;
                switchView('memoEditor');
            }
        });
    } else {
        document.getElementById('memo-editor-title').value = "";
        document.getElementById('memo-editor-content').value = "";
        switchView('memoEditor');
    }
};

// ★修正: ボタン処理
// 保存ボタン
document.getElementById('memo-editor-save').addEventListener('click', saveMemo);
// キャンセルボタン
document.getElementById('memo-editor-cancel').addEventListener('click', () => switchView(previousView));
// 削除ボタン
document.getElementById('memo-editor-delete').addEventListener('click', () => {
    if(editingMemoId) deleteMemo(editingMemoId, previousView);
    else switchView(previousView);
});

function saveMemo() {
    const title = document.getElementById('memo-editor-title').value || "新規メモ";
    const content = document.getElementById('memo-editor-content').value;
    const memoData = {
        uid: currentUser.uid, title: title, content: content,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const onComplete = () => {
        // 保存後は前の画面に戻り、リストを再読み込みする
        switchView(previousView);
    };

    if(editingMemoId) {
        db.collection('memos').doc(editingMemoId).update(memoData).then(onComplete);
    } else {
        // ★修正: 新規作成時もupdatedAtを入れてリストに即反映させる
        memoData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        db.collection('memos').add(memoData).then(onComplete);
    }
}

function loadStats() {
    db.collection('works').where('uid', '==', currentUser.uid).get().then(snap => {
        document.getElementById('stat-works').innerHTML = `${snap.size}<span class="unit">作品</span>`;
    });
}
function renderChart() {
    const ctx = document.getElementById('writingChart').getContext('2d');
    if (writingChart) writingChart.destroy();
    writingChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['12/13', '12/14', '12/15', '12/16', '12/17', '12/18', '12/19'],
            datasets: [{ data: [100, 450, 300, 0, 800, 200, 530], backgroundColor: '#89b4fa', borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: '#444' }, ticks: { color: '#aaa' } }, x: { grid: { display: false }, ticks: { color: '#aaa' } } }
        }
    });
}

function escapeHtml(str) {
    if(!str) return "";
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','-':'&#039;','"':'&quot;'}[m]));
}