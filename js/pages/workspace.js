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
    toggleElementVisibility,
    renderWorkInfo
} from "../ui.js";
import { adjustFormLayout } from "./setup.js";
import { getAllWorks, setupDashBoard } from "./dashboard.js";

let chaptersUnsubscribe = null;
let memosUnsubscribe = null;
let currentWorkId = null;
let currentChapterId = null;
let editingMemoId = null; // 現在編集中のメモID（nullなら新規）
let currentMemosList = []; // 現在のメモリストを保持

/**
 * ワークスペースを開く
 */
export async function openWork(id, tab = 'editor') {
    currentWorkId = id;
    // URLハッシュの更新 (main.js経由でのルーティングを想定)
    const hash = `${views.workspace}?id=${id}${tab ? '&tab=' + tab : ''}`;
    if (window.location.hash !== '#' + hash) {
        window.location.hash = hash;
    }

    switchView(views.workspace, true);
    setupWorkspace(id);
    switchWorkspaceTab(tab);
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

    if (!tabEditor) return;

    // URLハッシュの更新 (現在のタブを記憶させる)
    const currentHash = window.location.hash;
    if (currentHash.includes(views.workspace)) {
        const params = new URLSearchParams(currentHash.split('?')[1] || '');
        if (params.get('tab') !== tab) {
            params.set('tab', tab);
            window.location.hash = `${views.workspace}?${params.toString()}`;
        }
    }

    // Reset active states
    [tabEditor, tabInfo, tabMemo].forEach(t => t?.classList.remove('active'));
    [contentEditor, contentInfo, contentMemo].forEach(c => c?.classList.remove('active'));

    if (tab === 'editor') {
        tabEditor.classList.add('active');
        contentEditor.classList.add('active');
    } else if (tab === 'info') {
        tabInfo.classList.add('active');
        contentInfo.classList.add('active');
        toggleWorkInfoMode('view');
    } else if (tab === 'memo') {
        tabMemo.classList.add('active');
        contentMemo.classList.add('active');
        if (typeof window.closeMemoEdit === 'function') window.closeMemoEdit();
    }
}

/**
 * ワークスペースを閉じる
 */
export function closeWorkspace() {
    console.log("Closing workspace...");
    if (chaptersUnsubscribe) chaptersUnsubscribe();
    if (memosUnsubscribe) memosUnsubscribe();

    const infoContainer = document.getElementById('ws-info-container');
    const setupForm = document.querySelector('#setup-view .form-panel'); // 編集用フォーム
    const infoPanel = document.querySelector('#info-view .form-panel');   // 閲覧用パネル

    // 編集フォームの返却
    const setupContainer = document.querySelector('#setup-view .container-narrow');
    if (setupForm && setupContainer) {
        setupContainer.appendChild(setupForm);
        setupForm.classList.remove('workspace-full-form');
        toggleElementVisibility('setup-view-header', true);
    }

    // 閲覧パネルの返却
    const infoContainerNarrow = document.querySelector('#info-view .container-narrow');
    if (infoPanel && infoContainerNarrow) {
        infoContainerNarrow.appendChild(infoPanel);
        infoPanel.classList.remove('workspace-full-form');
    }

    // 執筆画面内の器を空にする
    if (infoContainer) infoContainer.innerHTML = '';

    currentWorkId = null;
    currentChapterId = null;

    // TOPへ戻る (ハッシュを書き換えて main.js のルーティングを走らせる)
    window.location.hash = views.top;
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
            console.log("No chapters found, creating first chapter...");
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
        currentMemosList = memos;
        renderMemoList(memos);
    }));
}

/**
 * メモ一覧の描画
 */
function renderMemoList(memos) {
    const listEl = document.getElementById('memo-list');
    if (!listEl) return;

    if (memos.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#666; padding: 20px;">メモがありません</p>';
        return;
    }

    // orderプロパティで昇順ソート（手動並び替え用）
    const sortedMemos = [...memos].sort((a, b) => (a.order || 0) - (b.order || 0));

    listEl.innerHTML = sortedMemos.map((memo, index) => {
        const escapedTitle = (memo.title || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const escapedContent = (memo.content || "").replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, "\\n");

        return `
            <div class="memo-card">
                <div class="memo-header" onclick="editMemo('${memo.id}', '${escapedTitle}', '${escapedContent}')">
                    <h4 class="memo-title">${memo.title}</h4>
                    <div class="memo-actions">
                        <button class="btn-retro edit">編集</button>
                        <button class="btn-retro move-up" onclick="event.stopPropagation(); moveMemoUp(${index})">▲</button>
                        <button class="btn-retro move-down" onclick="event.stopPropagation(); moveMemoDown(${index})">▼</button>
                    </div>
                </div>
                <div class="memo-content" onclick="editMemo('${memo.id}', '${escapedTitle}', '${escapedContent}')">${memo.content || ""}</div>
            </div>
        `;
    }).join('');
}

/**
 * メモを上に移動
 */
export async function moveMemoUp(index) {
    if (index <= 0) return;
    const { updateMemoOrder } = await import("../db.js");
    const m1 = currentMemosList[index];
    const m2 = currentMemosList[index - 1];
    await updateMemoOrder(currentWorkId, m1.id, m1.order, m2.id, m2.order);
}

/**
 * メモを下に移動
 */
export async function moveMemoDown(index) {
    if (index >= currentMemosList.length - 1) return;
    const { updateMemoOrder } = await import("../db.js");
    const m1 = currentMemosList[index];
    const m2 = currentMemosList[index + 1];
    await updateMemoOrder(currentWorkId, m1.id, m1.order, m2.id, m2.order);
}

/**
 * 新規メモ作成画面を開く
 */
export function addNewMemo() {
    editingMemoId = null;
    document.getElementById('memo-title-input').value = "";
    document.getElementById('memo-content-input').value = "";
    document.getElementById('memo-delete-btn').classList.add('hidden');

    toggleMemoSubview('edit');
}

/**
 * メモ編集画面を開く
 */
export const editMemo = (memoId, title, content) => {
    editingMemoId = memoId;
    document.getElementById('memo-title-input').value = title || "";
    document.getElementById('memo-content-input').value = content || "";
    document.getElementById('memo-delete-btn').classList.remove('hidden');

    toggleMemoSubview('edit');
};

/**
 * メモ編集画面を閉じて一覧に戻る
 */
export const closeMemoEdit = () => {
    toggleMemoSubview('list');
};

/**
 * メモの保存
 */
export const saveMemoCurrent = async () => {
    const title = document.getElementById('memo-title-input').value.trim() || "無題のメモ";
    const content = document.getElementById('memo-content-input').value;
    const { createMemo, updateMemo } = await import("../db.js");

    if (editingMemoId) {
        await updateMemo(currentWorkId, editingMemoId, { title, content });
    } else {
        await createMemo(currentWorkId, title, content);
    }

    closeMemoEdit();
};

// 全体から現在の作品IDを参照できるようにする（保存ミス防止）
window.getCurrentWorkId = () => currentWorkId;

/**
 * 作品情報の「閲覧」と「編集」を切り替える
 */
export function toggleWorkInfoMode(mode) {
    const infoContainer = document.getElementById('ws-info-container');
    const infoView = document.getElementById('info-view');
    const setupView = document.getElementById('setup-view');

    if (!infoContainer) return;

    // 以前のパネルを元の場所へ戻す（innerHTML=''による破壊を防ぐ）
    const currentPanel = infoContainer.querySelector('.form-panel');
    if (currentPanel) {
        if (currentPanel.classList.contains('info-view-container')) {
            document.querySelector('#info-view .container-narrow')?.appendChild(currentPanel);
        } else if (currentPanel.classList.contains('setup-view-container')) {
            document.querySelector('#setup-view .container-narrow')?.appendChild(currentPanel);
        }
        currentPanel.classList.remove('workspace-full-form');
    }

    const works = getAllWorks();
    const work = works.find(w => w.id === currentWorkId);

    if (mode === 'edit') {
        // 編集モード
        const setupForm = setupView?.querySelector('.form-panel');
        if (setupForm) {
            setupForm.classList.add('workspace-full-form');
            infoContainer.appendChild(setupForm);

            // データの流し込み
            if (work) populateWorkForm(work);
            if (typeof adjustFormLayout === 'function') adjustFormLayout(currentWorkId);

            // ボタンなどの微調整
            const sTitle = setupForm.querySelector('#setup-title');
            const submitBtn = setupForm.querySelector('#work-f-submit');
            if (sTitle) sTitle.textContent = '作品情報の編集';
            if (submitBtn) submitBtn.textContent = '保存する';

            toggleElementVisibility('setup-view-header', false);
        }
    } else {
        // 閲覧モード
        const infoPanel = infoView?.querySelector('.form-panel');
        if (infoPanel) {
            infoPanel.classList.add('workspace-full-form');
            infoContainer.appendChild(infoPanel);

            // データの流し込み
            if (work) renderWorkInfo(work);

            // 「この作品を書く」ボタンは非表示（エディタタブがあるため）
            const writeBtn = infoPanel.querySelector('#info-write-btn-top');
            if (writeBtn) writeBtn.style.display = 'none';

            // 「作品情報を編集する」ボタン（一番下に移動させたもの）へのイベント割り当て
            const editBtn = infoPanel.querySelector('.info-bottom-actions button') || infoPanel.querySelector('button.small');
            if (editBtn) {
                editBtn.onclick = (e) => {
                    e.preventDefault();
                    toggleWorkInfoMode('edit');
                };
            }
        }
    }
}

/**
 * 現在編集中のメモを削除
 */
export const deleteMemoCurrent = async () => {
    if (editingMemoId && confirm("このメモを削除してもよろしいですか？")) {
        const { deleteMemo } = await import("../db.js");
        await deleteMemo(currentWorkId, editingMemoId);
        closeMemoEdit();
    }
};

/**
 * メモのサブビュー（一覧/編集）を切り替え
 */
function toggleMemoSubview(view) {
    const listView = document.getElementById('memo-view-list');
    const editView = document.getElementById('memo-view-edit');

    if (view === 'list') {
        listView?.classList.add('active-subview');
        listView?.classList.remove('hidden');
        editView?.classList.add('hidden');
    } else {
        listView?.classList.remove('active-subview');
        listView?.classList.add('hidden');
        editView?.classList.remove('hidden');
    }
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

// エディタ便利機能の委譲
export { toggleVerticalMode, insertRuby, insertDash };
