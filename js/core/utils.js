/**
 * 共通ユーティリティ (js/core/utils.js)
 * 画面に依存しない純粋なデータ処理ロジックを集計
 */

/**
 * HTMLのエスケープ処理
 * @param {string} s 
 * @returns {string}
 */
export function escapeHtml(s) {
    if (!s) return "";
    return s.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#039;'
    }[m]));
}

/**
 * 日付のフォーマット (YYYY/MM/DD)
 * @param {Date} d 
 * @param {boolean} includeTime 
 * @returns {string}
 */
export function formatDate(d, includeTime = false) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (!includeTime) return `${y}/${m}/${day}`;
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
}

/**
 * FirestoreのTimestampまたはDate/Numberを正規化してフォーマット
 * @param {any} val 
 * @param {boolean} includeTime 
 * @returns {string}
 */
export function formatWorkDate(val, includeTime = false) {
    if (!val) return "-";
    let date;
    if (val.toDate) date = val.toDate(); // Firestore Timestamp用
    else if (val instanceof Date) date = val;
    else if (typeof val === 'number') date = new Date(val);
    else if (typeof val === 'string') date = new Date(val);
    else return "-";

    return formatDate(date, includeTime);
}
