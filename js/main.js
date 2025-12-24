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
    insertDash as workspaceInsertDash // Rename to avoid conflict with editor.js
} from "./pages/workspace.js";
import { loadComponent } from "./core/loader.js";

// App State
let currentWorkId = null;
let currentChapterId = null;
let chaptersUnsubscribe = null;

/**
 * Initialize Application
 */
async function init() {
    // --- 1. グローバル関数の登録 (htmlのonclick属性からの呼び出しに即座に応じるため) ---
    window.switchView = (viewId, skipHash = false) => {
        switchView(viewId);
        if (!skipHash) window.location.hash = viewId;
    };
    window.views = views;
    window.openWork = openWork;
    window.closeWorkspace = closeWorkspace;
    window.switchWorkspaceTab = switchWorkspaceTab;
    window.addNewChapter = addNewChapter;
    window.addNewMemo = addNewMemo;
    window.saveCurrentChapter = saveCurrentChapter;
    window.toggleVerticalMode = workspaceToggleVerticalMode;
    window.insertRuby = workspaceInsertRuby;
    window.insertDash = workspaceInsertDash;
    window.handleWorkInfoSubmit = handleWorkInfoSubmit;
    window.showWorkSetup = (id = null) => {
        const works = getAllWorks();
        showWorkSetup(id, works);
    };
    window.updateFullStats = (period) => {
        const stats = getAllStatsCache();
        updateFullStatsPeriod(stats, period);
    };

    // --- 2. 認証監視を開始 (読み込み待ちをせず、即座に状態を反映) ---
    observeAuth((user) => {
        if (user) {
            setupDashBoard();
            const hash = window.location.hash.replace('#', '');
            if (hash && hash !== views.login) {
                setTimeout(() => handleRouting(hash), 500);
            } else {
                window.switchView(views.top);
            }
        } else {
            window.switchView(views.login);
        }
    });

    // --- 3. ログインボタンの設定 ---
    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) loginBtn.onclick = login;

    // --- 4. 外部コンポーネントを並列に読み込む (バックグラウンドで処理) ---
    await Promise.all([
        loadComponent('stats-view', 'components/stats.html'),
        loadComponent('setup-view', 'components/setup-view.html'),
        loadComponent('info-view', 'components/info-view.html'),
        loadComponent('workspace-view', 'components/workspace-view.html')
    ]).catch(err => console.error("Components load error:", err));

    // 読み込み完了後に必要な初期化 (グラフなど)
    initStatsChart();

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

    // ハッシュ変更監視
    window.onhashchange = () => {
        const hash = window.location.hash.replace('#', '');
        if (hash && hash !== views.login) {
            handleRouting(hash);
        }
    };

    // フィルタ・ソートの監視設定
    const filterEl = document.getElementById('filter-status');
    const sortEl = document.getElementById('sort-order');
    if (filterEl) filterEl.onchange = renderDashboardList;
    if (sortEl) sortEl.onchange = renderDashboardList;

    // キャッチフレーズの文字数カウンター設定
    const cpInput = document.getElementById('work-f-catchphrase');
    if (cpInput) {
        cpInput.addEventListener('input', () => {
            const count = cpInput.value.length;
            const countDisp = document.getElementById('catchphrase-count');
            if (countDisp) countDisp.textContent = `残${35 - count}字`;
        });
    }
}

// Start App
init();
