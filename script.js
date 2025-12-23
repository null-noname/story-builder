/**
 * エディター - Standalone Writing Tool
 * Logic for Work Info Setup, Sorting, Filtering, and Retro UI
 */

const CONFIG = {
    firebase: {
        apiKey: "AIzaSyDc5HZ1PVW7H8-Pe8PBoY_bwCMm0jd5_PU",
        authDomain: "story-builder-app.firebaseapp.com",
        projectId: "story-builder-app",
        storageBucket: "story-builder-app.firebasestorage.app",
        messagingSenderId: "763153451684",
        appId: "1:763153451684:web:37a447d4cafb4abe41f431"
    }
};

// State
let currentUser = null;
let currentWorkId = null;
let currentChapterId = null;
let allWorksCache = [];
let autoSaveTimer = null;

// Initialize Firebase
if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
const auth = firebase.auth();
const db = firebase.firestore();

// --- 1. AUTH & INIT ---
function initAuth() {
    const loginBtn = document.getElementById('google-login-btn');
    loginBtn.onclick = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => console.error(e));
    };

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'block';
            switchView('top-view');
        } else {
            currentUser = null;
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('main-app').style.display = 'none';
        }
    });
}

// --- 2. VIEW MANAGEMENT ---
window.switchView = function (viewId) {
    document.querySelectorAll('.view-content').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
    });
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        // Custom display handling
        if (viewId === 'workspace-view') target.style.display = 'flex';
        else if (viewId === 'top-view' || viewId === 'setup-view') target.style.display = 'flex'; // flex for centering
        else target.style.display = 'block';
    }

    if (viewId === 'top-view') {
        loadWorks();
        loadDailyStats();
    }
};

// --- 3. WORK MANAGEMENT (SETUP & INFO) ---
window.showWorkSetup = function () {
    currentWorkId = null; // New work mode
    clearForm();
    switchView('setup-view');
};

window.openInfoEditor = function () {
    // Edit existing work info
    const work = allWorksCache.find(w => w.id === currentWorkId);
    if (work) {
        fillForm(work);
        switchView('setup-view');
    }
};

function clearForm() {
    document.getElementById('work-f-title').value = "";
    document.getElementById('work-f-catchphrase').value = "";
    document.getElementById('work-f-summary').value = "";
    document.getElementById('work-f-genre-m').value = "";
    document.getElementById('work-f-genre-s').value = "";
    document.getElementById('work-f-length').value = "long";
    document.getElementById('work-f-status').value = "in-progress";
    document.getElementById('work-f-type').value = "original";
    document.getElementById('work-f-ai').value = "none";
    document.querySelectorAll('input[name="rating"]').forEach(c => c.checked = false);
}

function fillForm(w) {
    document.getElementById('work-f-title').value = w.title || "";
    document.getElementById('work-f-catchphrase').value = w.catchphrase || "";
    document.getElementById('work-f-summary').value = w.description || "";
    document.getElementById('work-f-genre-m').value = w.mainGenre || "";
    document.getElementById('work-f-genre-s').value = w.subGenre || "";
    document.getElementById('work-f-length').value = w.novelLength || "long";
    document.getElementById('work-f-status').value = w.status || "in-progress";
    document.getElementById('work-f-type').value = w.type || "original";
    document.getElementById('work-f-ai').value = w.aiUsage || "none";
    const ratings = w.ratings || [];
    document.querySelectorAll('input[name="rating"]').forEach(c => {
        c.checked = ratings.includes(c.value);
    });
}

window.handleWorkInfoSubmit = async function () {
    const title = document.getElementById('work-f-title').value.trim();
    if (!title) { alert("タイトルを入力してください"); return; }

    const ratings = [];
    document.querySelectorAll('input[name="rating"]:checked').forEach(c => ratings.push(c.value));

    const data = {
        uid: currentUser.uid,
        title: title,
        catchphrase: document.getElementById('work-f-catchphrase').value,
        description: document.getElementById('work-f-summary').value,
        mainGenre: document.getElementById('work-f-genre-m').value,
        subGenre: document.getElementById('work-f-genre-s').value,
        novelLength: document.getElementById('work-f-length').value,
        status: document.getElementById('work-f-status').value,
        type: document.getElementById('work-f-type').value,
        aiUsage: document.getElementById('work-f-ai').value,
        ratings: ratings,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (currentWorkId) {
        // Update
        await db.collection("works").doc(currentWorkId).update(data);
        switchView('workspace-view');
    } else {
        // Create
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        data.totalChars = 0;
        data.isPinned = false;
        const doc = await db.collection("works").add(data);
        currentWorkId = doc.id;
        switchView('workspace-view');
        loadChapters();
    }
};

// --- 4. WORK LIST (SORT & FILTER) ---
function loadWorks() {
    if (!currentUser) return;
    db.collection("works").where("uid", "==", currentUser.uid)
        .onSnapshot(snap => {
            allWorksCache = [];
            snap.forEach(doc => allWorksCache.push({ id: doc.id, ...doc.data() }));
            renderWorkList();
        });
}

window.renderWorkList = function () {
    const container = document.getElementById('work-list');
    const filter = document.getElementById('filter-status').value;
    const sort = document.getElementById('sort-order').value;

    let filtered = allWorksCache;
    if (filter !== 'all') {
        filtered = filtered.filter(w => w.status === filter);
    }

    // Sort: Pinned first, then User choice
    filtered.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        const valA = a[sort]?.seconds || 0;
        const valB = b[sort]?.seconds || 0;
        return valB - valA;
    });

    container.innerHTML = '';
    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#666;">作品がありません</div>';
        return;
    }

    filtered.forEach(work => {
        const item = document.createElement('div');
        item.className = 'work-item-card';
        item.innerHTML = `
            <div class="work-header">
                <div class="work-title-link" onclick="openWork('${work.id}')">${escapeHtml(work.title)}</div>
                <div class="work-actions-inline">
                    <button class="btn-icon" onclick="openWork('${work.id}')">編集</button>
                    <button class="btn-icon red" onclick="deleteWork('${work.id}')">削除</button>
                    <button class="btn-icon star ${work.isPinned ? 'active' : ''}" onclick="togglePin(event, '${work.id}', ${work.isPinned})">★</button>
                </div>
            </div>
            <div class="work-footer-meta">
                作成日 : ${work.createdAt ? formatDate(work.createdAt.toDate()) : '-'} &nbsp; 
                更新日 : ${work.updatedAt ? formatDate(work.updatedAt.toDate(), true) : '-'}
            </div>
        `;
        container.appendChild(item);
    });
};

window.openWork = function (id) {
    currentWorkId = id;
    switchView('workspace-view');
    loadChapters();
};

window.togglePin = function (e, id, cur) {
    if (e) e.stopPropagation();
    db.collection("works").doc(id).update({ isPinned: !cur });
};

window.deleteWork = function (id) {
    if (confirm("本当にこの作品を削除しますか？")) {
        db.collection("works").doc(id).delete();
    }
};

// --- 5. EDITOR ---
function loadChapters() {
    if (!currentWorkId) return;
    db.collection("works").doc(currentWorkId).collection("chapters").orderBy("order", "asc")
        .onSnapshot(snap => {
            const list = document.getElementById('chapter-list');
            list.innerHTML = '';
            if (snap.empty) {
                addNewChapter();
                return;
            }
            snap.forEach(doc => {
                const d = doc.data();
                const div = document.createElement('div');
                div.style.padding = "12px 16px";
                div.style.borderBottom = "1px solid #000";
                div.style.cursor = "pointer";
                if (currentChapterId === doc.id) div.style.background = "#2b4034";
                div.innerHTML = `${escapeHtml(d.title)} <span style="float:right; color:#666; font-size:0.8rem;">${(d.content || "").length}</span>`;
                div.onclick = () => selectChapter(doc.id, d.content);
                list.appendChild(div);
            });
            if (!currentChapterId) {
                const f = snap.docs[0];
                selectChapter(f.id, f.data().content);
            }
        });
}

window.addNewChapter = function () {
    const order = document.querySelectorAll('#chapter-list div').length + 1;
    db.collection("works").doc(currentWorkId).collection("chapters").add({
        title: `第${order}話`,
        content: "",
        order: order,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(doc => {
        currentChapterId = doc.id;
        selectChapter(doc.id, "");
    });
};

function selectChapter(id, content) {
    currentChapterId = id;
    document.getElementById('main-editor').value = content || "";
    updateCharCount();
    // Highlight UI
    document.querySelectorAll('#chapter-list div').forEach(el => {
        el.style.background = "transparent";
    });
    // The snapshot will handle the background color in the next render cycle, 
    // but we can manually force it for better UX if needed.
}

window.onEditorInput = function () {
    updateCharCount();
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveCurrentChapter, 2000);
};

function updateCharCount() {
    document.getElementById('editor-char-count').textContent = `${document.getElementById('main-editor').value.length} 字`;
}

window.saveCurrentChapter = function () {
    if (!currentWorkId || !currentChapterId) return;
    const content = document.getElementById('main-editor').value;
    db.collection("works").doc(currentWorkId).collection("chapters").doc(currentChapterId).update({
        content: content,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        updateDailyProgress(content.length);
    });
};

window.toggleVerticalMode = function () {
    document.getElementById('main-editor').classList.toggle('vertical');
};

// --- 6. STATS & PREVIEW ---
async function loadDailyStats() {
    if (!currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    const doc = await db.collection("users").doc(currentUser.uid).collection("dailyProgress").doc(today).get();
    if (doc.exists) document.getElementById('stat-today-chars').textContent = `${doc.data().count || 0} 字`;
}

async function updateDailyProgress(count) {
    const today = new Date().toISOString().split('T')[0];
    db.collection("users").doc(currentUser.uid).collection("dailyProgress").doc(today).set({
        count: count,
        date: today
    }, { merge: true });
}

window.openPreview = function () {
    const content = document.getElementById('main-editor').value;
    const modal = document.getElementById('preview-modal');
    const area = document.getElementById('preview-content');
    area.innerHTML = content.split('\n').map(l => l.trim() === "" ? "<br>" : `<div>${escapeHtml(l)}</div>`).join('');
    modal.style.display = 'flex';
};

// --- HELPERS ---
function escapeHtml(s) {
    if (!s) return "";
    return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#039;' }[m]));
}
function formatDate(d, time = false) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (!time) return `${y}/${m}/${day}`;
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
}

initAuth();
