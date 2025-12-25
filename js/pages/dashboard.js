/**
 * ダッシュボード画面専用ロジック (js/pages/dashboard.js)
 */
import { getCurrentUser } from "../auth.js";
import { subscribeWorks, getRecentDailyProgress, deleteWork, toggleWorkPin } from "../db.js";
import { renderWorkList, renderStatsDashboard, renderStatsFull, views, switchView } from "../ui.js";
import { updateStatsChart, aggregateStats } from "../stats.js";

let worksUnsubscribe = null;
let allWorksCache = [];
let allStatsCache = [];

/**
 * ダッシュボード（TOP画面）のセットアップ
 */
export function setupDashBoard() {
    // switchView(views.top); // main.js でやっているので不要または冗長
    const user = getCurrentUser();

    if (worksUnsubscribe) worksUnsubscribe();

    // 作品リストの購読
    worksUnsubscribe = subscribeWorks(user.uid, (works) => {
        allWorksCache = works;
        renderDashboardList();
    });

    // 統計情報の読み込み
    updateDashboardStats();
}

/**
 * 作品リストの描画（フィルタ・ソート反映）
 */
export function renderDashboardList() {
    const filter = document.getElementById('filter-status')?.value || 'all';
    const sort = document.getElementById('sort-order')?.value || 'updatedAt';

    renderWorkList(
        allWorksCache,
        window.showWorkInfo, // main.js に残る作品詳細表示
        async (id) => {
            // 削除処理の本体
            await deleteWork(id);
        },
        async (id, currentPinned) => {
            // お気に入り（ピン）処理
            await toggleWorkPin(id, currentPinned);
        },
        filter,
        sort,
        window.openWork // エディタを開く
    );
}

/**
 * 統計情報の更新
 */
async function updateDashboardStats() {
    const user = getCurrentUser();
    const stats = await getRecentDailyProgress(user.uid, 365);
    allStatsCache = stats;

    updateStatsChart(stats);
    const aggregated = aggregateStats(stats);
    renderStatsDashboard(aggregated);
    renderStatsFull(aggregated, allWorksCache.length);
}

/**
 * キャッシュされた作品リストを取得（外部用）
 */
export function getAllWorks() {
    return allWorksCache;
}

/**
 * キャッシュされた統計データを取得（外部用）
 */
export function getAllStatsCache() {
    return allStatsCache;
}

/**
 * 購読を解除
 */
export function cleanupDashboard() {
    if (worksUnsubscribe) {
        worksUnsubscribe();
        worksUnsubscribe = null;
    }
}
