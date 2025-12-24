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

// --- モジュール移行 ---
import { setupDashBoard, renderDashboardList, getAllStatsCache, getAllWorks } from "./pages/dashboard.js";
import { showWorkSetup, adjustFormLayout, handleWorkInfoSubmit, initSetupListeners } from "./pages/setup.js";
import {
    openWork,
    closeWorkspace,
    switchWorkspaceTab,
    addNewChapter,
    saveCurrentChapter,
    toggleVerticalMode as workspaceToggleVerticalMode, // Rename to avoid conflict with editor.js
    insertRuby as workspaceInsertRuby, // Rename to avoid conflict with editor.js
    insertDash as workspaceInsertDash, // Rename to avoid conflict with editor.js
    setupWorkspace // Import setupWorkspace
} from "./pages/workspace.js";

// App State
let currentWorkId = null;
let currentChapterId = null;
let chaptersUnsubscribe = null;

/**
 * Initialize Application
 */
function init() {
    // Auth Listener
    observeAuth((user) => {
        if (user) {
            setupDashBoard(); // モジュール版を呼び出し
            // リロード時のハッシュ復元
            const hash = window.location.hash.replace('#', '');
            if (hash && hash !== views.login) {
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

    // ハッシュ変更監視
    window.onhashchange = () => {
        const hash = window.location.hash.replace('#', '');
        if (hash && hash !== views.login) {
            handleRouting(hash);
        }
    };

    // --- 各画面モジュールへの委譲 ---
    window.showWorkSetup = (id = null) => {
        const works = getAllWorks();
        showWorkSetup(id, works);
    };

    window.openWork = openWork;
    window.closeWorkspace = closeWorkspace;
    window.switchWorkspaceTab = switchWorkspaceTab;
    window.addNewChapter = addNewChapter;
    window.saveCurrentChapter = saveCurrentChapter;
    window.toggleVerticalMode = workspaceToggleVerticalMode;
    window.insertRuby = workspaceInsertRuby;
    window.insertDash = workspaceInsertDash;

    window.updateFullStats = (period) => {
        const stats = getAllStatsCache();
        updateFullStatsPeriod(stats, period);
    };

    window.handleWorkInfoSubmit = handleWorkInfoSubmit;

    // 共通初期化
    initSetupListeners();

    // フィルタ・ソートの監視
    const filterEl = document.getElementById('filter-status');
    const sortEl = document.getElementById('sort-order');
    if (filterEl) filterEl.onchange = renderDashboardList;
    if (sortEl) sortEl.onchange = renderDashboardList;

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

// Start App
init();
