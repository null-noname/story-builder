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
 * フォームレイアウトの調整（新規・編集で共通のフルUIを提供）
 */
export function adjustFormLayout(id = null) {
    const row1 = document.getElementById('setup-row-1');
    const row2 = document.getElementById('setup-row-2');
    const elLength = document.getElementById('el-f-length');
    const elStatus = document.getElementById('el-f-status');
    const elType = document.getElementById('el-f-type');
    const elRating = document.getElementById('el-f-rating');

    // ユーザー要望により、新規・編集問わず全ての項目（長編/短編含む）を出せるようにする
    if (row1 && elLength && elType) {
        row1.innerHTML = '';
        row1.appendChild(elLength);
        row1.appendChild(elType);
        toggleElementVisibility('el-f-length', true);
    }
    if (row2 && elStatus && elRating) {
        row2.innerHTML = '';
        row2.appendChild(elStatus);
        row2.appendChild(elRating);
    }
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

    // 重要：workspace.js等、外部で管理されている currentWorkId も考慮する
    let workId = currentWorkId || (typeof window.getCurrentWorkId === 'function' ? window.getCurrentWorkId() : null);

    try {
        if (workId) {
            await updateWork(workId, data);
        } else {
            workId = await createWork(data);
            currentWorkId = workId;
        }

        // 保存完了後の表示切り替え
        const workspaceView = document.getElementById('workspace-view');
        const isInWorkspace = workspaceView && !workspaceView.classList.contains('hidden');

        if (isInWorkspace) {
            // 執筆画面内の場合は、確実に「閲覧モード」に戻す
            if (typeof window.toggleWorkInfoMode === 'function') {
                window.toggleWorkInfoMode('view');
            }
        } else {
            // 独立した編集画面の場合は詳細（閲覧）ページへ
            if (typeof window.showWorkInfo === 'function') {
                window.showWorkInfo(workId);
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
