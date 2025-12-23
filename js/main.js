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
import { initStatsChart, updateStatsChart, updateFullStatsPeriod } from "./stats.js";

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
        } else {
            switchView(views.login);
        }
    });

    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) loginBtn.onclick = login;

    // Global UI Actions
    window.switchView = switchView;
    window.views = views;

    window.showWorkSetup = (id = null) => {
        currentWorkId = id;
        if (id) {
            const work = allWorksCache.find(w => w.id === id);
            if (work) populateForm(work);
        } else {
            clearForm();
        }
        switchView(views.setup);
    };

    window.openWork = (id) => {
        currentWorkId = id;
        switchView(views.workspace);
        setupWorkspace(id);
    };

    window.closeWorkspace = () => {
        if (chaptersUnsubscribe) chaptersUnsubscribe();
        currentWorkId = null;
        setupDashBoard();
    };

    window.updateFullStats = (period) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const activeTab = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.textContent.includes(period === '1W' ? '1週間' : period === '1M' ? '1ヶ月' : '1年'));
        if (activeTab) activeTab.classList.add('active');
        updateFullStatsPeriod(allStatsCache, period);
    };

    window.handleWorkInfoSubmit = async () => {
        const title = document.getElementById('work-f-title').value.trim();
        if (!title) { alert("タイトルを入力してください"); return; }

        const data = {
            title: title,
            catchphrase: document.getElementById('work-f-catchphrase').value,
            description: document.getElementById('work-f-summary').value,
            status: document.getElementById('work-f-status').value,
            length: document.getElementById('work-f-length').value,
            type: document.getElementById('work-f-type').value,
            ai: document.getElementById('work-f-ai').value,
            rating: Array.from(document.querySelectorAll('input[name="rating"]:checked')).map(cb => cb.value),
            uid: getCurrentUser().uid
        };

        if (currentWorkId) {
            await updateWork(currentWorkId, data);
            window.openWork(currentWorkId);
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
    allStatsCache = stats;
    updateStatsChart(stats);

    // Update simple stat display
    const todayStr = new Date().toISOString().split('T')[0];
    const todayStat = stats.find(s => s.date === todayStr);
    const todayCount = todayStat ? todayStat.count : 0;

    const weeklySum = stats.slice(-7).reduce((acc, s) => acc + s.count, 0);

    if (document.getElementById('stat-today-chars')) {
        document.getElementById('stat-today-chars').textContent = todayCount;
    }
    if (document.getElementById('stat-weekly-chars')) {
        document.getElementById('stat-weekly-chars').textContent = weeklySum;
    }

    // Summary screen
    if (document.getElementById('summary-today')) {
        document.getElementById('summary-today').textContent = todayCount;
        document.getElementById('summary-weekly').textContent = weeklySum;
    }
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
    document.getElementById('work-f-length').value = "long";
    document.getElementById('work-f-type').value = "original";
    document.getElementById('work-f-ai').value = "none";
    document.querySelectorAll('input[name="rating"]').forEach(cb => cb.checked = false);
}

function populateForm(work) {
    document.getElementById('work-f-title').value = work.title || "";
    document.getElementById('work-f-catchphrase').value = work.catchphrase || "";
    document.getElementById('work-f-summary').value = work.description || "";
    document.getElementById('work-f-status').value = work.status || "in-progress";
    document.getElementById('work-f-length').value = work.length || "long";
    document.getElementById('work-f-type').value = work.type || "original";
    document.getElementById('work-f-ai').value = work.ai || "none";

    document.querySelectorAll('input[name="rating"]').forEach(cb => {
        cb.checked = (work.rating || []).includes(cb.value);
    });
}

// Start App
init();
