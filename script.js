/**
 * 執筆エディター - Standalone Writing Tool
 * Modular Logic in a Single File for file:// compatibility
 */

// --- 1. CONFIGURATION & GLOBALS ---
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
let chartInstance = null;
let autoSaveTimer = null;

// Initialize Firebase
if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
const auth = firebase.auth();
const db = firebase.firestore();

// --- 2. AUTHENTICATION ---
function initAuth() {
    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(e => console.error(e));
        };
    }

    auth.onAuthStateChanged(user => {
        const loginScreen = document.getElementById('login-screen');
        const mainApp = document.getElementById('main-app');
        if (user) {
            currentUser = user;
            loginScreen.style.display = 'none';
            mainApp.style.display = 'flex';
            switchView('top-view');
        } else {
            currentUser = null;
            loginScreen.style.display = 'flex';
            mainApp.style.display = 'none';
        }
    });
}

// --- 3. VIEW MANAGEMENT ---
window.switchView = function (viewId) {
    document.querySelectorAll('.view-content').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
    });
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        target.style.display = viewId === 'workspace-view' ? 'flex' : 'block';
        if (target.style.display === 'block') target.style.display = ''; // fallback to default
    }

    // Header Updates
    const hT = document.getElementById('header-title-text');
    const bL = document.getElementById('nav-btn-left');
    const bR = document.getElementById('nav-btn-right');

    if (viewId === 'top-view') {
        hT.textContent = "執筆エディター";
        bL.textContent = "ログアウト";
        bR.textContent = "執筆日記";
        loadWorks();
        loadDailyStats();
    } else if (viewId === 'workspace-view') {
        hT.textContent = "執筆中";
        bL.textContent = "◀ TOP";
        bR.textContent = "プレビュー";
    } else if (viewId === 'stats-view') {
        hT.textContent = "執筆日記";
        bL.textContent = "◀ 戻る";
        bR.textContent = "";
        renderStatsChart();
    } else if (viewId === 'info-view') {
        hT.textContent = "作品設定";
        bL.textContent = "◀ 戻る";
        bR.textContent = "保存";
    }
};

window.handleHeaderLeft = function () {
    const cur = document.querySelector('.view-content.active').id;
    if (cur === 'top-view') auth.signOut();
    else if (cur === 'workspace-view') switchView('top-view');
    else if (cur === 'stats-view') switchView('top-view');
    else if (cur === 'info-view') switchView('workspace-view');
};

window.handleHeaderRight = function () {
    const cur = document.querySelector('.view-content.active').id;
    if (cur === 'top-view') switchView('stats-view');
    else if (cur === 'workspace-view') openPreview();
    else if (cur === 'info-view') saveWorkInfo();
};

window.toggleSidebar = function () {
    document.getElementById('sidebar').classList.toggle('open');
};

// --- 4. WORK MANAGEMENT ---
function loadWorks() {
    if (!currentUser) return;
    db.collection("works").where("uid", "==", currentUser.uid).orderBy("updatedAt", "desc")
        .onSnapshot(snap => {
            allWorksCache = [];
            snap.forEach(doc => allWorksCache.push({ id: doc.id, ...doc.data() }));
            renderWorkList();
        });
}

function renderWorkList() {
    const container = document.getElementById('work-list');
    container.innerHTML = '';
    if (allWorksCache.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">作品がありません</div>';
        return;
    }

    // Sort: Pinned first, then updatedAt
    const sorted = [...allWorksCache].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
    });

    sorted.forEach(work => {
        const item = document.createElement('div');
        item.className = 'work-item';
        item.onclick = () => openWork(work.id);
        item.innerHTML = `
            <div class="work-info">
                <div class="work-title">
                    ${work.isPinned ? '<span style="color:var(--accent-blue);margin-right:8px;">📌</span>' : ''}
                    ${escapeHtml(work.title)} 
                    ${work.isFinished ? '<span class="work-badge" style="color:#aaa;border-color:#aaa;">完結</span>' : '<span class="work-badge" style="color:var(--accent-green);border-color:var(--accent-green);">執筆中</span>'}
                </div>
                <div class="work-meta">${work.totalChars || 0} 文字 | 更新: ${work.updatedAt ? formatTime(work.updatedAt.toDate()) : '-'}</div>
            </div>
            <button class="btn-custom btn-small" onclick="togglePinWork(event, '${work.id}', ${work.isPinned || false})">${work.isPinned ? '外す' : '固定'}</button>
        `;
        container.appendChild(item);
    });
}

window.createNewWork = function () {
    const data = {
        uid: currentUser.uid,
        title: "無題の物語",
        description: "",
        totalChars: 0,
        isFinished: false,
        isPinned: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection("works").add(data).then(doc => openWork(doc.id));
};

window.togglePinWork = function (e, id, currentStatus) {
    if (e) e.stopPropagation();
    db.collection("works").doc(id).update({ isPinned: !currentStatus });
};

function openWork(id) {
    currentWorkId = id;
    const work = allWorksCache.find(w => w.id === id);
    if (!work) return;

    document.getElementById('info-title').value = work.title || "";
    document.getElementById('info-summary').value = work.description || "";
    const radios = document.getElementsByName('novel-status');
    radios.forEach(r => { if (r.value === (work.isFinished ? 'completed' : 'in-progress')) r.checked = true; });

    switchView('workspace-view');
    loadChapters();
}

window.saveWorkInfo = function () {
    if (!currentWorkId) return;
    const isFinished = document.querySelector('input[name="novel-status"]:checked').value === 'completed';
    const data = {
        title: document.getElementById('info-title').value,
        description: document.getElementById('info-summary').value,
        isFinished: isFinished,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection("works").doc(currentWorkId).update(data).then(() => {
        alert("設定を保存しました");
        switchView('workspace-view');
    });
};

window.deleteWork = function () {
    if (!currentWorkId) return;
    if (!confirm("本当にこの作品を削除しますか？\n（この操作は取り消せません）")) return;
    db.collection("works").doc(currentWorkId).delete().then(() => {
        switchView('top-view');
    });
};

// --- 5. EDITOR & CHAPTERS ---
function loadChapters() {
    if (!currentWorkId) return;
    db.collection("works").doc(currentWorkId).collection("chapters").orderBy("order", "asc")
        .onSnapshot(snap => {
            const list = document.getElementById('chapter-list');
            list.innerHTML = '';
            if (snap.empty) {
                addNewChapter(); // create first chapter if none
                return;
            }
            snap.forEach(doc => {
                const d = doc.data();
                const item = document.createElement('div');
                item.className = 'chapter-item' + (currentChapterId === doc.id ? ' active' : '');
                item.innerHTML = `<span>${escapeHtml(d.title || "無題の話")}</span><span class="count">${(d.content || "").length}</span>`;
                item.onclick = () => selectChapter(doc.id, d.content);
                list.appendChild(item);
            });
            // If no chapter selected, select the first one
            if (!currentChapterId && !snap.empty) {
                const first = snap.docs[0];
                selectChapter(first.id, first.data().content);
            }
        });
}

window.addNewChapter = function () {
    const order = document.querySelectorAll('.chapter-item').length + 1;
    const data = {
        title: `第${order}話`,
        content: "",
        order: order,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection("works").doc(currentWorkId).collection("chapters").add(data).then(doc => {
        selectChapter(doc.id, "");
    });
};

function selectChapter(id, content) {
    currentChapterId = id;
    document.getElementById('main-editor').value = content || "";
    updateLocalCharCount();
    // Highlight active in list
    document.querySelectorAll('.chapter-item').forEach(el => el.classList.remove('active'));
    // (Snapshot will re-render soon if we change state globally, but manual UI feedback is faster)
}

window.onEditorInput = function () {
    updateLocalCharCount();
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveCurrentChapter, 2000); // Auto-save after 2s of silence
};

function updateLocalCharCount() {
    const val = document.getElementById('main-editor').value;
    document.getElementById('editor-char-count').textContent = `${val.length}字`;
}

window.saveCurrentChapter = function () {
    if (!currentWorkId || !currentChapterId) return;
    const content = document.getElementById('main-editor').value;
    db.collection("works").doc(currentWorkId).collection("chapters").doc(currentChapterId).update({
        content: content,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        trackWritingProgress(content.length);
    });
};

window.toggleVerticalMode = function () {
    document.getElementById('main-editor').classList.toggle('vertical');
};

// --- 6. STATS & CHART ---
async function loadDailyStats() {
    if (!currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    const doc = await db.collection("users").doc(currentUser.uid).collection("dailyProgress").doc(today).get();
    if (doc.exists) {
        document.getElementById('stat-today-chars').textContent = `${doc.data().count || 0}字`;
    }
}

async function trackWritingProgress(currentLength) {
    // This logic is a simplified word count tracker
    // Real implementation would compare with previous save state
    // For now, we update the daily log with current session total
    const today = new Date().toISOString().split('T')[0];
    db.collection("users").doc(currentUser.uid).collection("dailyProgress").doc(today).set({
        count: currentLength,
        date: today
    }, { merge: true });
}

async function renderStatsChart() {
    const ctx = document.getElementById('statsChart');
    if (!ctx) return;
    if (chartInstance) chartInstance.destroy();

    // Fetch last 7 days from Firestore...
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = [1200, 1900, 3000, 500, 2000, 3500, 2400]; // Mock data

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '執筆文字数',
                data: data,
                backgroundColor: '#3d5afe',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#333' } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// --- 7. PREVIEW ---
window.openPreview = function () {
    const content = document.getElementById('main-editor').value;
    const modal = document.getElementById('preview-modal');
    const area = document.getElementById('preview-content');

    // Convert newlines to breaks or handle spacing
    area.innerHTML = content.split('\n').map(line => line.trim() === '' ? '<br>' : `<div>${escapeHtml(line)}</div>`).join('');
    modal.style.display = 'flex';
};

window.closePreview = function () {
    document.getElementById('preview-modal').style.display = 'none';
};

window.togglePreviewWritingMode = function () {
    document.getElementById('preview-content').classList.toggle('vertical-mode'); // need to add CSS for this
};

// --- HELPER FUNCTIONS ---
function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#039;' }[m]));
}

// --- 8. EXPORT ---
window.exportAsTxt = async function () {
    if (!currentWorkId) return;
    const work = allWorksCache.find(w => w.id === currentWorkId);
    const snap = await db.collection("works").doc(currentWorkId).collection("chapters").orderBy("order", "asc").get();
    let text = `${work.title}\n\n`;
    snap.forEach(doc => {
        const d = doc.data();
        text += `■ ${d.title}\n\n${d.content}\n\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${work.title}.txt`;
    a.click();
};

window.exportAsPdf = async function () {
    if (!currentWorkId) return;
    const area = document.getElementById('preview-content');
    window.openPreview(); // Ensure content is loaded
    const opt = {
        margin: 10,
        filename: `${document.getElementById('info-title').value || 'work'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(area).save().then(() => {
        closePreview();
    });
};

function formatTime(date) {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Start
initAuth();