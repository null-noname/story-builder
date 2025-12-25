/**
 * 作品設定画面専用ロジック (js/pages/setup.js)
 */
import { getCurrentUser } from "../auth.js";
import { createWork, updateWork, deleteWork } from "../db.js";
import {
    views,
    switchView,
    clearWorkForm,
    populateWorkForm,
    getWorkFormData,
    toggleElementVisibility
} from "../ui.js";

let currentWorkId = null;

/**
 * 設定フォームの表示（新規/編集）
 * @param {string|null} id 作品ID（nullの場合は新規作成）
 * @param {Array} allWorksCache 作品リストのキャッシュ（編集時のデータ取得用）
 */
export function showWorkSetup(id = null, allWorksCache = []) {
    currentWorkId = id;
    const setupView = document.getElementById('setup-view');
    const formPanel = setupView?.querySelector('.form-panel');
    const setupTitle = document.getElementById('setup-title');
    const submitBtn = document.getElementById('work-f-submit');

    // 全画面表示用のクラスを付与
    if (formPanel) {
        formPanel.classList.add('workspace-full-form');
    }

    // 全てのレイアウト（長さ選択など）を表示状態にする
    adjustFormLayout(id);

    if (id) {
        const works = allWorksCache.length > 0 ? allWorksCache : (typeof window.getAllWorks === 'function' ? window.getAllWorks() : []);
        const work = works.find(w => w.id === id);
        if (work) populateWorkForm(work);
        if (setupTitle) {
            setupTitle.textContent = '作品情報の編集';
            setupTitle.style.display = 'none'; // 要望に基づき文字を消す場合は非表示
        }
        if (submitBtn) submitBtn.textContent = '保存する';

        toggleElementVisibility('work-f-delete', true);
        const deleteBtn = document.getElementById('work-f-delete');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (confirm("本当にこの作品を削除しますか？")) {
                    await deleteWork(id);
                    window.location.hash = views.top;
                }
            };
        }
    } else {
        clearWorkForm();
        if (setupTitle) {
            setupTitle.textContent = '新しい作品の作成';
            setupTitle.style.display = 'none'; // 要望に基づき文字を消す場合は非表示
        }
        if (submitBtn) submitBtn.textContent = '作成して開始';
        toggleElementVisibility('work-f-delete', false);
    }

    // URLハッシュ更新 (リロード対応)
    const hash = id ? `${views.setup}?id=${id}` : views.setup;
    if (window.location.hash !== '#' + hash) {
        window.location.hash = hash;
    }

    window.switchView(views.setup, true);
}

/**
 * フォームレイアウトの調整（現在はHTML側で固定しているため、表示状態の維持のみ）
 */
export function adjustFormLayout(id = null) {
    // 全ての項目を表示状態にする（toggleElementVisibilityは念のため）
    toggleElementVisibility('el-f-length', true);
    toggleElementVisibility('el-f-type', true);
    toggleElementVisibility('el-f-status', true);
    toggleElementVisibility('el-f-rating', true);
}

/**
 * フォーム送信処理
 */
export async function handleWorkInfoSubmit() {
    const formData = getWorkFormData();
    if (!formData.title) {
        alert("タイトルを入力してください");
        return;
    }

    const data = {
        ...formData,
        uid: getCurrentUser().uid,
        updatedAt: new Date().getTime()
    };

    // 事前に既存IDがあったか記録しておく
    const wasExistingId = !!(currentWorkId || (typeof window.getCurrentWorkId === 'function' ? window.getCurrentWorkId() : null));

    try {
        if (wasExistingId) {
            const workIdToUpdate = currentWorkId || window.getCurrentWorkId();
            await updateWork(workIdToUpdate, data);
            workId = workIdToUpdate;
        } else {
            workId = await createWork(data);
            currentWorkId = workId;
        }

        // 保存完了後の表示切り替え
        const workspaceView = document.getElementById('workspace-view');
        const isInWorkspace = workspaceView && !workspaceView.classList.contains('hidden');

        if (isInWorkspace) {
            // 執筆画面内の編集から保存した場合は、閲覧モードに戻る
            if (typeof window.toggleWorkInfoMode === 'function') {
                window.toggleWorkInfoMode('view');
            }
        } else {
            // 新規作成、または一覧からの編集の場合
            if (typeof window.openWork === 'function') {
                // 新規ならエディタータブ、一覧からの編集（既存IDあり）なら作品情報タブへ
                const targetTab = wasExistingId ? 'info' : 'editor';
                window.openWork(workId, targetTab);
            }
        }
    } catch (error) {
        console.error("作品情報の保存に失敗しました:", error);
        alert("保存中にエラーが発生しました。");
    }
}

/**
 * キャッチコピー文字数カウンターの初期化
 */
export function initSetupListeners() {
    const cpInput = document.getElementById('work-f-catchphrase');
    if (cpInput) {
        cpInput.addEventListener('input', () => {
            const count = cpInput.value.length;
            const countDisp = document.getElementById('catchphrase-count');
            if (countDisp) countDisp.textContent = `残${35 - count}字`;
        });
    }
}

/**
 * 現在編集中の作品IDを取得
 */
export function getCurrentSetupWorkId() {
    return currentWorkId;
}
