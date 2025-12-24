import { observeAuth, getCurrentUser, login } from "./auth.js";
import {
    subscribeWorks,
    createWork,
    updateWork,
    deleteWork,
    toggleWorkPin,
    subscribeChapters,
    createChapter,
    updateChapter,
    saveHistoryBackup,
    getRecentDailyProgress
} from "./db.js";
import { setupEditor, setEditorContent, getEditorContent, toggleVerticalMode, insertRuby, insertDash } from "./editor.js";
import { initStatsChart, updateStatsChart, updateFullStatsPeriod, aggregateStats, getTabLabel } from "./stats.js";
import {
    switchView,
    views,
    renderWorkList,
    renderChapterList,
    renderStatsDashboard,
    renderStatsFull,
    updateActiveTab,
    renderWorkInfo,
    getWorkFormData,
    toggleElementVisibility,
    clearWorkForm,
    populateWorkForm
} from "./ui.js";

// App State
let currentWorkId = null;
let currentChapterId = null;
let allWorksCache = [];
let worksUnsubscribe = null;
let chaptersUnsubscribe = null;
let allStatsCache = [];

/**
 * Initialize Application
 */
function init() {
    // Auth Listener
    observeAuth((user) => {
        if (user) {
            setupDashBoard();
            // リロード時のハッシュ復元
            const hash = window.location.hash.replace('#', '');
            if (hash && hash !== views.login) {
                // 少し遅延をおいてデータ読み込み完了を待つ（FireStore購読のため）
                setTimeout(() => handleRouting(hash), 500);
            }
        } else {
            switchView(views.login);
        }
    });

    /**
     * URLハッシュに基づいたルーティング制御
     */
    async function handleRouting(hash) {
        if (!hash) return;
        const [viewId, param] = hash.split('?id=');

        if (viewId === views.workspace && param) {
            window.openWork(param);
        } else if (viewId === views.setup && param) {
            window.showWorkSetup(param);
        } else if (viewId === views.stats) {
            window.switchView(views.stats);
        } else if (viewId === views.memo) {
            window.switchView(views.memo);
        } else {
            window.switchView(views.top);
        }
    }

    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) loginBtn.onclick = login;

    // Global UI Actions
    window.switchView = (viewId, skipHash = false) => {
        switchView(viewId);
        if (!skipHash) window.location.hash = viewId;
    };
    window.views = views;

    // ハッシュ変更監視（手動のURL変更にも対応）
    window.onhashchange = () => {
        const hash = window.location.hash.replace('#', '');
        if (hash && hash !== views.login) {
            handleRouting(hash);
        }
    };

    window.adjustFormLayout = (id = null) => {
        if (id) {
            // Edit Layout: [Type + Status], [Rating]
            const row1 = document.getElementById('setup-row-1');
            const row2 = document.getElementById('setup-row-2');
            const elLength = document.getElementById('el-f-length');
            const elStatus = document.getElementById('el-f-status');
            const elType = document.getElementById('el-f-type');
            const elRating = document.getElementById('el-f-rating');

            if (row1 && elType && elStatus) {
                row1.innerHTML = '';
                row1.appendChild(elType);
                row1.appendChild(elStatus);
            }
            if (row2 && elRating) {
                row2.innerHTML = '';
                row2.appendChild(elRating);
            }
            toggleElementVisibility('el-f-length', false);
        } else {
            // New Layout: [Length + Type], [Status + Rating]
            const row1 = document.getElementById('setup-row-1');
            const row2 = document.getElementById('setup-row-2');
            const elLength = document.getElementById('el-f-length');
            const elStatus = document.getElementById('el-f-status');
            const elType = document.getElementById('el-f-type');
            const elRating = document.getElementById('el-f-rating');

            if (row1 && elLength && elType) {
                row1.innerHTML = '';
                row1.appendChild(elLength);
                row1.appendChild(elType);
            }
            if (row2 && elStatus && elRating) {
                row2.innerHTML = '';
                row2.appendChild(elStatus);
                row2.appendChild(elRating);
            }
            toggleElementVisibility('el-f-length', true);
        }
    };

    window.showWorkSetup = (id = null) => {
        currentWorkId = id;
        const setupTitle = document.getElementById('setup-title');
        const submitBtn = document.getElementById('work-f-submit');

        // ハッシュ更新（リロード対策）
        window.location.hash = id ? `${views.setup}?id=${id}` : views.setup;

        window.adjustFormLayout(id);

        if (id) {
            const work = allWorksCache.find(w => w.id === id);
            if (work) populateWorkForm(work);
            if (setupTitle) setupTitle.textContent = '作品情報の編集';
            if (submitBtn) submitBtn.textContent = '保存';

            toggleElementVisibility('work-f-delete', true);
            const deleteBtn = document.getElementById('work-f-delete');
            if (deleteBtn) {
                deleteBtn.onclick = async () => {
                    if (confirm("本当にこの作品を削除しますか？")) {
                        await deleteWork(id);
                        window.switchView(views.top);
                    }
                };
            }
        } else {
            clearWorkForm();
            if (setupTitle) setupTitle.textContent = '作品情報の入力';
            if (submitBtn) submitBtn.textContent = '保存して開始';
            toggleElementVisibility('work-f-delete', false);
        }
        window.switchView(views.setup, true); // ハッシュは上記でセット済み
    };

    window.switchWorkspaceTab = (tab) => {
        const tabEditor = document.getElementById('tab-editor');
        const tabInfo = document.getElementById('tab-info');
        const contentEditor = document.getElementById('ws-content-editor');
        const contentInfo = document.getElementById('ws-content-info');
        const infoContainer = document.getElementById('ws-info-container');
        const setupForm = document.querySelector('.form-panel');

        if (tab === 'editor') {
            tabEditor.classList.add('active');
            tabInfo.classList.remove('active');
            contentEditor.classList.add('active');
            contentInfo.classList.remove('active');
        } else {
            tabEditor.classList.remove('active');
            tabInfo.classList.add('active');
            contentEditor.classList.remove('active');
            contentInfo.classList.add('active');

            if (setupForm && infoContainer) {
                if (currentWorkId) {
                    const work = allWorksCache.find(w => w.id === currentWorkId);
                    if (work) populateWorkForm(work);
                    window.adjustFormLayout(currentWorkId);
                    const sTitle = document.getElementById('setup-title');
                    if (sTitle) sTitle.textContent = '作品設定';
                    toggleElementVisibility('setup-view-header', false);
                }
                infoContainer.appendChild(setupForm);
            }
        }
    };

    window.openWork = (id) => {
        currentWorkId = id;
        window.location.hash = `${views.workspace}?id=${id}`;
        switchView(views.workspace, true); // ハッシュの二重更新を防ぐため第2引数にtrue
        window.switchWorkspaceTab('editor');
        setupWorkspace(id);
    };

    window.closeWorkspace = () => {
        if (chaptersUnsubscribe) chaptersUnsubscribe();

        // フォームを元の位置（setup-view）に戻す
        const setupForm = document.querySelector('.form-panel');
        const originalSetupView = document.getElementById('setup-view');
        const containerNarrow = originalSetupView?.querySelector('.container-narrow');
        if (setupForm && containerNarrow) {
            containerNarrow.appendChild(setupForm);
            toggleElementVisibility('setup-view-header', true);
        }

        currentWorkId = null;
        window.location.hash = views.top; // ハッシュをリセット
        setupDashBoard();
    };

    window.updateFullStats = (period) => {
        // period is now directly from the select value ('1W', '1M', '1Y')
        updateFullStatsPeriod(allStatsCache, period);
    };

    window.handleWorkInfoSubmit = async () => {
        const formData = getWorkFormData();
        if (!formData.title) { alert("タイトルを入力してください"); return; }

        const data = {
            ...formData,
            uid: getCurrentUser().uid
        };

        if (currentWorkId) {
            await updateWork(currentWorkId, data);
            window.showWorkInfo(currentWorkId);
        } else {
            const id = await createWork(data);
            window.openWork(id);
        }
    };

    window.addNewChapter = async () => {
        if (currentWorkId) {
            const nextOrder = document.querySelectorAll('.chapter-item').length + 1;
            const newId = await createChapter(currentWorkId, nextOrder);
            currentChapterId = newId;
        }
    };

    window.toggleVerticalMode = toggleVerticalMode;
    window.insertRuby = insertRuby;
    window.insertDash = insertDash;
    window.saveCurrentChapter = async () => {
        if (currentWorkId && currentChapterId) {
            const content = getEditorContent();
            await updateChapter(currentWorkId, currentChapterId, content);
            // Optional: backup on explicit save or every N chars
            await saveHistoryBackup(currentWorkId, currentChapterId, content);
        }
    };

    // Listen for filter/sort changes
    document.getElementById('filter-status').onchange = () => {
        renderWorkList(
            allWorksCache,
            window.openWork,
            deleteWork,
            toggleWorkPin,
            document.getElementById('filter-status').value,
            document.getElementById('sort-order').value
        );
    };
    document.getElementById('sort-order').onchange = document.getElementById('filter-status').onchange;

    // Catchphrase Counter
    const cpInput = document.getElementById('work-f-catchphrase');
    if (cpInput) {
        cpInput.addEventListener('input', () => {
            const count = cpInput.value.length;
            const countDisp = document.getElementById('catchphrase-count');
            if (countDisp) countDisp.textContent = `残${35 - count}字`;
        });
    }

    // Initialize Chart
    initStatsChart();
}

/**
 * Setup TOP Dashboard
 */
function setupDashBoard() {
    switchView(views.top);
    const user = getCurrentUser();

    if (worksUnsubscribe) worksUnsubscribe();
    worksUnsubscribe = subscribeWorks(user.uid, (works) => {
        allWorksCache = works;
        renderWorkList(
            works,
            window.showWorkInfo,
            deleteWork,
            toggleWorkPin,
            document.getElementById('filter-status').value,
            document.getElementById('sort-order').value,
            window.openWork // Direct to Editor
        );
    });

    // Load Stats
    updateStats();
}

async function updateStats() {
    const user = getCurrentUser();
    const stats = await getRecentDailyProgress(user.uid, 365); // Fetch up to 1 year
    allStatsCache = stats;
    updateStatsChart(stats);

    const aggregated = aggregateStats(stats);
    renderStatsDashboard(aggregated);
    renderStatsFull(aggregated, allWorksCache.length);
}

/**
 * Setup Workspace
 */
function setupWorkspace(workId) {
    if (chaptersUnsubscribe) chaptersUnsubscribe();

    setupEditor(
        () => { }, // OnInput (auto-save is handled inside editor.js via timer)
        window.saveCurrentChapter
    );

    chaptersUnsubscribe = subscribeChapters(workId, (chapters) => {
        if (chapters.length === 0) {
            createChapter(workId, 1);
            return;
        }
        renderChapterList(chapters, currentChapterId, (id, content) => {
            currentChapterId = id;
            setEditorContent(content);
            renderChapterList(chapters, currentChapterId, null); // Refresh highlight
        });

        // Auto-select first chapter if none selected
        if (!currentChapterId) {
            currentChapterId = chapters[0].id;
            setEditorContent(chapters[0].content);
        }
    });
}

// populateForm, clearForm were moved to ui.js

// Start App
init();
