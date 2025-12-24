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
    const setupTitle = document.getElementById('setup-title');
    const submitBtn = document.getElementById('work-f-submit');

    // URLハッシュ更新
    window.location.hash = id ? `${views.setup}?id=${id}` : views.setup;

    adjustFormLayout(id);

    if (id) {
        const work = allWorksCache.find(w => w.id === id);
        if (work) populateWorkForm(work);
        if (setupTitle) setupTitle.textContent = '作品情報の編集';
        if (submitBtn) submitBtn.textContent = '保存';

        toggleElementVisibility('work-f-delete', true);
        const deleteBtn = document.getElementById('work-f-delete');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (confirm("本当にこの作品を削除しますか？")) {
                    await deleteWork(id);
                    window.switchView(views.top);
                }
            };
        }
    } else {
        clearWorkForm();
        if (setupTitle) setupTitle.textContent = '作品情報の入力';
        if (submitBtn) submitBtn.textContent = '保存して開始';
        toggleElementVisibility('work-f-delete', false);
    }
    window.switchView(views.setup, true);
}

/**
 * フォームレイアウトの調整
 */
export function adjustFormLayout(id = null) {
    if (id) {
        // 編集時：[種別 + 状態], [属性]
        const row1 = document.getElementById('setup-row-1');
        const row2 = document.getElementById('setup-row-2');
        const elStatus = document.getElementById('el-f-status');
        const elType = document.getElementById('el-f-type');
        const elRating = document.getElementById('el-f-rating');

        if (row1 && elType && elStatus) {
            row1.innerHTML = '';
            row1.appendChild(elType);
            row1.appendChild(elStatus);
        }
        if (row2 && elRating) {
            row2.innerHTML = '';
            row2.appendChild(elRating);
        }
        toggleElementVisibility('el-f-length', false);
    } else {
        // 新規時：[規模 + 種別], [状態 + 属性]
        const row1 = document.getElementById('setup-row-1');
        const row2 = document.getElementById('setup-row-2');
        const elLength = document.getElementById('el-f-length');
        const elStatus = document.getElementById('el-f-status');
        const elType = document.getElementById('el-f-type');
        const elRating = document.getElementById('el-f-rating');

        if (row1 && elLength && elType) {
            row1.innerHTML = '';
            row1.appendChild(elLength);
            row1.appendChild(elType);
        }
        if (row2 && elStatus && elRating) {
            row2.innerHTML = '';
            row2.appendChild(elStatus);
            row2.appendChild(elRating);
        }
        toggleElementVisibility('el-f-length', true);
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
        uid: getCurrentUser().uid
    };

    if (currentWorkId) {
        await updateWork(currentWorkId, data);
        window.showWorkInfo(currentWorkId);
    } else {
        const id = await createWork(data);
        window.openWork(id);
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
