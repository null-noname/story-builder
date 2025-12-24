/**
 * エディタ画面（Workspace）専用ロジック (js/pages/workspace.js)
 */
import {
    subscribeChapters,
    createChapter,
    updateChapter,
    saveHistoryBackup
} from "../db.js";
import {
    setupEditor,
    setEditorContent,
    getEditorContent,
    toggleVerticalMode,
    insertRuby,
    insertDash
} from "../editor.js";
import {
    renderChapterList,
    switchView,
    views,
    populateWorkForm,
    toggleElementVisibility
} from "../ui.js";
import { adjustFormLayout } from "./setup.js";
import { getAllWorks, setupDashBoard } from "./dashboard.js";

let chaptersUnsubscribe = null;
let currentWorkId = null;
let currentChapterId = null;

/**
 * ワークスペースを開く
 */
export function openWork(id) {
    currentWorkId = id;
    window.location.hash = `${views.workspace}?id=${id}`;
    switchView(views.workspace, true);
    switchWorkspaceTab('editor');
    setupWorkspace(id);
}

/**
 * ワークスペース内のタブ切り替え
 */
export function switchWorkspaceTab(tab) {
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
                const works = getAllWorks();
                const work = works.find(w => w.id === currentWorkId);
                if (work) populateWorkForm(work);
                adjustFormLayout(currentWorkId);
                const sTitle = document.getElementById('setup-title');
                if (sTitle) sTitle.textContent = '作品設定';
                toggleElementVisibility('setup-view-header', false);
            }
            infoContainer.appendChild(setupForm);
        }
    }
}

/**
 * ワークスペースを閉じる
 */
export function closeWorkspace() {
    if (chaptersUnsubscribe) chaptersUnsubscribe();

    const setupForm = document.querySelector('.form-panel');
    const originalSetupView = document.getElementById('setup-view');
    const containerNarrow = originalSetupView?.querySelector('.container-narrow');
    if (setupForm && containerNarrow) {
        containerNarrow.appendChild(setupForm);
        toggleElementVisibility('setup-view-header', true);
    }

    currentWorkId = null;
    currentChapterId = null;
    window.location.hash = views.top;
    setupDashBoard();
}

/**
 * チャプター管理とエディタのセットアップ
 */
function setupWorkspace(workId) {
    if (chaptersUnsubscribe) chaptersUnsubscribe();

    setupEditor(
        () => { }, // OnInput
        saveCurrentChapter
    );

    chaptersUnsubscribe = subscribeChapters(workId, (chapters) => {
        if (chapters.length === 0) {
            createChapter(workId, 1);
            return;
        }
        renderChapterList(chapters, currentChapterId, (id, content) => {
            currentChapterId = id;
            setEditorContent(content);
            renderChapterList(chapters, currentChapterId, null);
        });

        if (!currentChapterId) {
            currentChapterId = chapters[0].id;
            setEditorContent(chapters[0].content);
        }
    });
}

/**
 * 現在のチャプターを保存
 */
export async function saveCurrentChapter() {
    if (currentWorkId && currentChapterId) {
        const content = getEditorContent();
        await updateChapter(currentWorkId, currentChapterId, content);
        await saveHistoryBackup(currentWorkId, currentChapterId, content);
    }
}

/**
 * 新規チャプター追加
 */
export async function addNewChapter() {
    if (currentWorkId) {
        const nextOrder = document.querySelectorAll('.chapter-item').length + 1;
        const newId = await createChapter(currentWorkId, nextOrder);
        currentChapterId = newId;
    }
}

// エディタ便利機能の委譲
export { toggleVerticalMode, insertRuby, insertDash };
