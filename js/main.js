import { observeAuth, getCurrentUser, login } from "./auth.js";
import { switchView, views, renderWorkList, renderChapterList } from "./ui.js";
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
import { initStatsChart, updateStatsChart } from "./stats.js";

// App State
let currentWorkId = null;
let currentChapterId = null;
let allWorksCache = [];
let worksUnsubscribe = null;
let chaptersUnsubscribe = null;

/**
 * Initialize Application
 */
function init() {
    // Auth Listener
    observeAuth((user) => {
        if (user) {
            setupDashBoard();
        } else {
            switchView(views.login);
        }
    });

    // Login Button
    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) loginBtn.onclick = login;

    // Global UI Actions
    window.showWorkSetup = () => {
        currentWorkId = null;
        clearForm();
        switchView(views.setup);
    };

    window.openWork = (id) => {
        currentWorkId = id;
        switchView(views.workspace);
        setupWorkspace(id);
    };

    window.closeWorkspace = () => {
        if (chaptersUnsubscribe) chaptersUnsubscribe();
        switchView(views.top);
    };

    window.handleWorkInfoSubmit = async () => {
        const title = document.getElementById('work-f-title').value.trim();
        if (!title) { alert("タイトルを入力してください"); return; }

        const data = {
            title: title,
            catchphrase: document.getElementById('work-f-catchphrase').value,
            description: document.getElementById('work-f-summary').value,
            status: document.getElementById('work-f-status').value,
            uid: getCurrentUser().uid
        };

        if (currentWorkId) {
            await updateWork(currentWorkId, data);
            switchView(views.workspace);
        } else {
            const id = await createWork(data);
            window.openWork(id);
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
            window.openWork,
            deleteWork,
            toggleWorkPin,
            document.getElementById('filter-status').value,
            document.getElementById('sort-order').value
        );
    });

    // Load Stats
    updateStats();
}

async function updateStats() {
    const user = getCurrentUser();
    const stats = await getRecentDailyProgress(user.uid);
    updateStatsChart(stats);

    // Update simple stat display
    const todayStr = new Date().toISOString().split('T')[0];
    const todayStat = stats.find(s => s.date === todayStr);
    document.getElementById('stat-today-chars').textContent = `${todayStat ? todayStat.count : 0} 字`;
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

function clearForm() {
    document.getElementById('work-f-title').value = "";
    document.getElementById('work-f-catchphrase').value = "";
    document.getElementById('work-f-summary').value = "";
    document.getElementById('work-f-status').value = "in-progress";
}

// Start App
init();
