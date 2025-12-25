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
    addNewMemo,
    closeMemoEdit,
    saveMemoCurrent,
    deleteMemoCurrent,
    saveCurrentChapter,
    toggleVerticalMode as workspaceToggleVerticalMode, // Rename to avoid conflict with editor.js
    insertRuby as workspaceInsertRuby, // Rename to avoid conflict with editor.js
    insertDash as workspaceInsertDash, // Rename to avoid conflict with editor.js
    toggleWorkInfoMode
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
    // --- 1. グローバル関数の登録 (安全な一括管理) ---
    const safeRegister = (name, fn) => {
        if (typeof fn === 'function') {
            window[name] = fn;
        } else {
            console.warn(`[System] 注意: ${name} の登録に失敗しました（部品が壊れている可能性があります）`);
        }
    };

    safeRegister('switchView', (viewId, skipHash = false) => {
        switchView(viewId);
        if (!skipHash) window.location.hash = viewId;
    });

    window.views = views; // 定数はそのまま

    safeRegister('openWork', (id, tab = 'editor') => {
        window.location.hash = `${views.workspace}?id=${id}${tab ? '&tab=' + tab : ''}`;
    });
    safeRegister('closeWorkspace', () => {
        window.location.hash = views.top;
    });
    safeRegister('showWorkInfo', (id) => {
        if (!id) return;
        window.location.hash = `${views.info}?id=${id}`;
    });
    safeRegister('showWorkSetup', (id = null) => {
        window.location.hash = id ? `${views.setup}?id=${id}` : views.setup;
    });

    // 画面固有の機能登録
    safeRegister('switchWorkspaceTab', switchWorkspaceTab);
    safeRegister('addNewChapter', addNewChapter);
    safeRegister('addNewMemo', addNewMemo);
    safeRegister('closeMemoEdit', closeMemoEdit);
    safeRegister('saveMemoCurrent', saveMemoCurrent);
    safeRegister('deleteMemoCurrent', deleteMemoCurrent);
    safeRegister('saveCurrentChapter', saveCurrentChapter);
    safeRegister('toggleVerticalMode', workspaceToggleVerticalMode);
    safeRegister('insertRuby', workspaceInsertRuby);
    safeRegister('insertDash', workspaceInsertDash);
    safeRegister('handleWorkInfoSubmit', handleWorkInfoSubmit);
    safeRegister('toggleWorkInfoMode', toggleWorkInfoMode);

    window.updateFullStats = (period) => {
        const stats = getAllStatsCache();
        updateFullStatsPeriod(stats, period);
    };

    // --- 2. 認証監視を開始 ---
    observeAuth((user) => {
        if (user) {
            setupDashBoard();
            const hash = window.location.hash.replace('#', '');
            handleRouting(hash || views.top);
        } else {
            window.switchView(views.login, true);
        }
    });

    // --- 3. ログインボタンの設定 ---
    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) loginBtn.onclick = login;

    // --- 4. 外部コンポーネントを並列に読み込む ---
    await Promise.all([
        loadComponent('stats-view', 'components/stats.html'),
        loadComponent('setup-view', 'components/setup-view.html'),
        loadComponent('info-view', 'components/info-view.html'),
        loadComponent('workspace-view', 'components/workspace-view.html')
    ]).catch(err => console.error("Components load error:", err));

    initStatsChart();

    /**
     * URLハッシュに基づいたルーティング制御 (リロード対応)
     */
    async function handleRouting(hash) {
        if (!hash) {
            window.switchView(views.top, true);
            return;
        }

        const parts = hash.split('?');
        const viewId = parts[0];
        const params = new URLSearchParams(parts[1] || '');
        const id = params.get('id');
        const tab = params.get('tab');

        // 各ビューへの切り替えとデータ表示
        if (viewId === views.workspace && id) {
            // openWork はワークスペースを表示しデータをロードする
            await openWork(id, tab || 'editor');
        } else if (viewId === views.info && id) {
            window.switchView(views.info, true);
            const works = getAllWorks();
            const work = works.find(w => w.id === id);
            if (work) {
                renderWorkInfo(work);
                const openBtn = document.getElementById('info-open-work');
                if (openBtn) openBtn.onclick = () => window.openWork(id);
            }
        } else if (viewId === views.setup) {
            const works = getAllWorks();
            showWorkSetup(id, works);
        } else if (viewId === views.stats) {
            window.switchView(views.stats, true);
        } else if (viewId === views.memo) {
            window.switchView(views.memo, true);
        } else {
            window.switchView(views.top, true);
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
