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
let memosUnsubscribe = null;
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
    const tabMemo = document.getElementById('tab-memo');
    const contentEditor = document.getElementById('ws-content-editor');
    const contentInfo = document.getElementById('ws-content-info');
    const contentMemo = document.getElementById('ws-content-memo');
    const infoContainer = document.getElementById('ws-info-container');
    const setupForm = document.querySelector('.form-panel');

    // Reset active states
    [tabEditor, tabInfo, tabMemo].forEach(t => t?.classList.remove('active'));
    [contentEditor, contentInfo, contentMemo].forEach(c => c?.classList.remove('active'));

    if (tab === 'editor') {
        tabEditor.classList.add('active');
        contentEditor.classList.add('active');
    } else if (tab === 'info') {
        tabInfo.classList.add('active');
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
    } else if (tab === 'memo') {
        tabMemo.classList.add('active');
        contentMemo.classList.add('active');
    }
}

/**
 * ワークスペースを閉じる
 */
export function closeWorkspace() {
    if (chaptersUnsubscribe) chaptersUnsubscribe();
    if (memosUnsubscribe) memosUnsubscribe();

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
    if (memosUnsubscribe) memosUnsubscribe();

    setupEditor(
        () => { }, // OnInput
        saveCurrentChapter
    );

    // Subscribe Chapters
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

    // Subscribe Memos
    memosUnsubscribe = import("../db.js").then(m => m.subscribeMemos(workId, (memos) => {
        renderMemoList(memos);
    }));
}

/**
 * メモ一覧の描画
 */
function renderMemoList(memos) {
    const listEl = document.getElementById('memo-list');
    if (!listEl) return;

    listEl.innerHTML = memos.map(memo => `
        <div class="memo-card">
            <div class="memo-header">
                <h4 class="memo-title">${memo.title}</h4>
                <div class="memo-actions">
                    <button class="btn-retro edit" onclick="editMemo('${memo.id}')">編集</button>
                    <button class="btn-retro delete" onclick="deleteMemoConfirm('${memo.id}')">削除</button>
                </div>
            </div>
            <div class="memo-content">${memo.content || ""}</div>
        </div>
    `).join('');
}

/**
 * 新規メモ追加
 */
export async function addNewMemo() {
    if (currentWorkId) {
        const title = prompt("メモのタイトルを入力してください", "新規メモ");
        if (title !== null) {
            const { createMemo } = await import("../db.js");
            await createMemo(currentWorkId, title, "");
        }
    }
}

/**
 * メモ編集
 */
window.editMemo = async (memoId) => {
    const title = prompt("新しいタイトルを入力してください（空欄で変更なし）");
    const content = prompt("内容を入力してください");
    if (title !== null || content !== null) {
        const { updateMemo } = await import("../db.js");
        const data = {};
        if (title) data.title = title;
        if (content) data.content = content;
        await updateMemo(currentWorkId, memoId, data);
    }
};

/**
 * メモ削除
 */
window.deleteMemoConfirm = async (memoId) => {
    if (confirm("このメモを削除してもよろしいですか？")) {
        const { deleteMemo } = await import("../db.js");
        await deleteMemo(currentWorkId, memoId);
    }
};

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
