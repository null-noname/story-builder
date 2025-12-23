/**
 * UI Management and Rendering
 */

export const views = {
    login: 'login-screen',
    top: 'top-view',
    setup: 'setup-view',
    workspace: 'workspace-view',
    memo: 'memo-view'
};

/**
 * Switch between different views
 */
export function switchView(viewId) {
    document.querySelectorAll('.view-content').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
    });

    // Also handle login screen separately if it's not .view-content
    const loginScreen = document.getElementById(views.login);
    const mainApp = document.getElementById('main-app');

    if (viewId === views.login) {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
    } else {
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';

        const target = document.getElementById(viewId);
        if (target) {
            target.classList.add('active');
            if (viewId === views.workspace) target.style.display = 'flex';
            else target.style.display = 'flex'; // Mostly flex for centering
        }
    }
}

/**
 * Render the work list
 */
export function renderWorkList(works, onOpen, onDelete, onPin, filter = 'all', sort = 'updatedAt') {
    const container = document.getElementById('work-list');
    if (!container) return;

    let filtered = works;
    if (filter !== 'all') {
        filtered = works.filter(w => w.status === filter);
    }

    // Sort: Pinned first, then User choice
    filtered.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        const valA = a[sort]?.seconds || 0;
        const valB = b[sort]?.seconds || 0;
        return valB - valA;
    });

    container.innerHTML = '';
    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#888;">作品がありません</div>';
        return;
    }

    filtered.forEach(work => {
        const item = document.createElement('div');
        item.className = 'work-item-card';
        // HTML structure updated for new design rules
        item.innerHTML = `
            <div class="work-header">
                <div class="work-title-link" data-id="${work.id}">${escapeHtml(work.title)}</div>
                <div class="work-actions-inline">
                    <button class="btn-icon edit" data-id="${work.id}">編集</button>
                    <button class="btn-icon red delete" data-id="${work.id}">削除</button>
                    <button class="btn-icon star ${work.isPinned ? 'active' : ''}" data-id="${work.id}" data-pinned="${work.isPinned}">★</button>
                </div>
            </div>
            <div class="work-footer-meta">
                作成日 : ${work.createdAt ? formatDate(work.createdAt.toDate()) : '-'} &nbsp; 
                更新日 : ${work.updatedAt ? formatDate(work.updatedAt.toDate(), true) : '-'}
            </div>
        `;

        // Event delegation or direct binding
        item.querySelector('.work-title-link').onclick = () => onOpen(work.id);
        item.querySelector('.btn-icon.edit').onclick = () => onOpen(work.id);
        item.querySelector('.btn-icon.delete').onclick = () => onDelete(work.id);
        item.querySelector('.btn-icon.star').onclick = (e) => {
            e.stopPropagation();
            onPin(work.id, work.isPinned);
        };

        container.appendChild(item);
    });
}

/**
 * Render the chapter list in the sidebar
 */
export function renderChapterList(chapters, currentChapterId, onSelect) {
    const list = document.getElementById('chapter-list');
    if (!list) return;

    list.innerHTML = '';
    chapters.forEach(d => {
        const div = document.createElement('div');
        div.className = 'chapter-item';
        if (currentChapterId === d.id) div.classList.add('active');
        div.innerHTML = `
            <span class="chapter-title">${escapeHtml(d.title)}</span>
            <span class="chapter-count">${(d.content || "").length}</span>
        `;
        div.onclick = () => onSelect(d.id, d.content);
        list.appendChild(div);
    });
}

/**
 * Helpers
 */
export function escapeHtml(s) {
    if (!s) return "";
    return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#039;' }[m]));
}

export function formatDate(d, time = false) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (!time) return `${y}/${m}/${day}`;
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
}
