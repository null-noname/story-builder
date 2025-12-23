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
import { switchView, views, renderWorkList, renderChapterList, renderStatsDashboard, renderStatsFull, updateActiveTab, renderWorkInfo, getWorkFormData } from "./ui.js";

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
        const groupLength = document.getElementById('group-f-length');
        const setupTitle = document.getElementById('setup-title');
        const submitBtn = document.getElementById('work-f-submit');
        const deleteBtn = document.getElementById('work-f-delete');

        if (id) {
            const work = allWorksCache.find(w => w.id === id);
            if (work) populateForm(work);
            if (groupLength) groupLength.style.display = 'none';
            if (setupTitle) setupTitle.textContent = '作品情報の編集';
            if (submitBtn) submitBtn.textContent = '保存';
            if (deleteBtn) {
                deleteBtn.style.display = 'block';
                deleteBtn.onclick = async () => {
                    if (confirm("本当にこの作品を削除しますか？")) {
                        await deleteWork(id);
                        switchView(views.top);
                    }
                };
            }
        } else {
            clearForm();
            if (groupLength) groupLength.style.display = 'block';
            if (setupTitle) setupTitle.textContent = '作品情報の入力';
            if (submitBtn) submitBtn.textContent = '保存して開始';
            if (deleteBtn) deleteBtn.style.display = 'none';
        }
        switchView(views.setup);
    };

    window.showWorkInfo = (id) => {
        currentWorkId = id;
        const work = allWorksCache.find(w => w.id === id);
        if (work) {
            renderWorkInfo(work);
            const openBtn = document.getElementById('info-open-work');
            if (openBtn) openBtn.onclick = () => window.openWork(id);
            switchView(views.info);
        }
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
        updateActiveTab(getTabLabel(period));
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
            document.getElementById('sort-order').value
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

function clearForm() {
    document.getElementById('work-f-title').value = "";
    document.getElementById('work-f-catchphrase').value = "";
    document.getElementById('work-f-summary').value = "";

    // Reset radios
    document.querySelector('input[name="work-status"][value="in-progress"]').checked = true;
    document.querySelector('input[name="work-length"][value="long"]').checked = true;
    document.querySelector('input[name="work-type"][value="original"]').checked = true;
    document.querySelector('input[name="work-ai"][value="none"]').checked = true;

    document.querySelectorAll('input[name="rating"]').forEach(cb => cb.checked = false);

    const countDisp = document.getElementById('catchphrase-count');
    if (countDisp) countDisp.textContent = "残35字";
}

function populateForm(work) {
    document.getElementById('work-f-title').value = work.title || "";
    document.getElementById('work-f-catchphrase').value = work.catchphrase || "";
    document.getElementById('work-f-summary').value = work.description || "";

    // Set radios
    const statusRadio = document.querySelector(`input[name="work-status"][value="${work.status || 'in-progress'}"]`);
    if (statusRadio) statusRadio.checked = true;

    const lengthRadio = document.querySelector(`input[name="work-length"][value="${work.length || 'long'}"]`);
    if (lengthRadio) lengthRadio.checked = true;

    const typeRadio = document.querySelector(`input[name="work-type"][value="${work.type || 'original'}"]`);
    if (typeRadio) typeRadio.checked = true;

    const aiRadio = document.querySelector(`input[name="work-ai"][value="${work.ai || 'none'}"]`);
    if (aiRadio) aiRadio.checked = true;

    document.querySelectorAll('input[name="rating"]').forEach(cb => {
        cb.checked = (work.rating || []).includes(cb.value);
    });

    const countDisp = document.getElementById('catchphrase-count');
    if (countDisp) countDisp.textContent = `残${35 - (work.catchphrase || "").length}字`;
}

// Start App
init();
