/**
 * UI Management and Rendering
 */

export const views = {
    login: 'login-screen',
    top: 'top-view',
    setup: 'setup-view',
    workspace: 'workspace-view',
    memo: 'memo-view',
    stats: 'stats-view',
    info: 'info-view'
};

/**
 * Update Statistics on Dashboard (TOP)
 */
export function renderStatsDashboard(data) {
    const todayChars = document.getElementById('stat-today-chars');
    const weeklyChars = document.getElementById('stat-weekly-chars');

    if (todayChars) todayChars.textContent = data.todayCount;
    if (weeklyChars) weeklyChars.textContent = data.weeklySum;
}

/**
 * Update Statistics Summary Grid (Stats View)
 */
export function renderStatsFull(data, totalWorks) {
    const today = document.getElementById('summary-today');
    const weekly = document.getElementById('summary-weekly');
    const monthly = document.getElementById('summary-monthly');
    const total = document.getElementById('summary-total-works');

    if (today) today.textContent = data.todayCount;
    if (weekly) weekly.textContent = data.weeklySum;
    if (monthly) monthly.textContent = data.monthlySum;
    if (total) total.textContent = totalWorks;
}

/**
 * Update Active Tab in Stats View
 */
export function updateActiveTab(label) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === label);
    });
}

/**
 * Render Work Details for View Mode
 */
export function renderWorkInfo(work) {
    const catchphrase = document.getElementById('info-catchphrase');
    const summary = document.getElementById('info-summary');
    const status = document.getElementById('info-status');
    const type = document.getElementById('info-type');
    const ai = document.getElementById('info-ai');
    const rating = document.getElementById('info-rating');

    const statusLabels = { 'in-progress': '制作中', 'completed': '完了', 'suspended': '中断' };
    const typeLabels = { 'original': 'オリジナル', 'derivative': '二次創作' };
    const aiLabels = { 'none': 'なし', 'assist': '補助利用', 'partial': '一部利用（50％以下）', 'main': '本文利用（50％以上）' };
    const ratingLabels = { 'sexual': '性描写', 'violent': '暴力', 'cruel': '残酷' };

    if (catchphrase) catchphrase.textContent = work.catchphrase || '（未設定）';
    if (summary) summary.textContent = work.description || '（未設定）';
    if (status) status.textContent = statusLabels[work.status] || work.status;
    if (type) type.textContent = typeLabels[work.type] || work.type;
    if (ai) ai.textContent = aiLabels[work.ai] || work.ai;
    if (rating) {
        const ratings = (work.rating || []).map(r => ratingLabels[r] || r);
        rating.textContent = ratings.length > 0 ? ratings.join(' / ') : 'なし';
    }
}

/**
 * Get Data from Work Setup Form
 */
export function getWorkFormData() {
    return {
        title: document.getElementById('work-f-title').value.trim(),
        catchphrase: document.getElementById('work-f-catchphrase').value.trim(),
        description: document.getElementById('work-f-summary').value.trim(),
        status: document.querySelector('input[name="work-status"]:checked')?.value || 'in-progress',
        length: document.querySelector('input[name="work-length"]:checked')?.value || 'long',
        type: document.querySelector('input[name="work-type"]:checked')?.value || 'original',
        ai: document.querySelector('input[name="work-ai"]:checked')?.value || 'none',
        rating: Array.from(document.querySelectorAll('input[name="rating"]:checked')).map(cb => cb.value)
    };
}

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
export function renderWorkList(works, onOpen, onDelete, onPin, filter = 'all', sort = 'updatedAt', onEdit = null) {
    const container = document.getElementById('work-list');
    if (!container) return;

    let filtered = [...works];
    if (filter !== 'all') {
        filtered = filtered.filter(w => w.status === filter);
    }

    // Sort: Pinned first, then User choice
    filtered.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;

        if (sort === 'updatedAt') return b.updatedAt - a.updatedAt;
        return b.createdAt - a.createdAt;
    });

    container.innerHTML = '';
    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#888;">作品がありません</div>';
        return;
    }

    filtered.forEach(work => {
        const item = document.createElement('div');
        item.className = 'work-item-card';

        const tagsHtml = `
            <span class="work-tag ${work.length === 'short' ? 'tag-short' : 'tag-long'}">${work.length === 'short' ? '短編' : '長編'}</span>
            <span class="work-tag ${work.type === 'derivative' ? 'tag-derivative' : 'tag-original'}">${work.type === 'derivative' ? '二次創作' : 'オリジナル'}</span>
        `;

        item.innerHTML = `
            <div class="work-header">
                <div style="flex:1;">
                  <span class="work-title-link">${escapeHtml(work.title)}</span>
                  <div style="margin-top:8px;">${tagsHtml}</div>
                </div>
                <div class="work-actions-inline" style="display:flex; align-items:center;">
                    <button class="btn-retro edit" data-action="edit" style="padding:4px 12px; font-size:0.9rem;">編集</button>
                    <button class="btn-retro delete" data-action="delete" style="padding:4px 12px; font-size:0.9rem;">削除</button>
                    <button class="btn-icon star ${work.pinned ? 'active' : ''}" data-action="pin" title="お気に入り">${work.pinned ? '★' : '☆'}</button>
                </div>
            </div>
            <p style="margin:10px 0; font-size:0.9rem; color:#ccc; font-weight:normal;">${escapeHtml(work.catchphrase || '')}</p>
            <div class="work-footer-meta">
                <span>作成日 : ${formatWorkDate(work.createdAt)}</span>
                <span>更新日 : ${formatWorkDate(work.updatedAt, true)}</span>
            </div>
        `;

        // Direct binding for events
        item.querySelector('.work-title-link').onclick = () => onOpen(work.id);
        item.querySelector('[data-action="edit"]').onclick = () => {
            if (onEdit) onEdit(work.id);
            else if (window.showWorkSetup) window.showWorkSetup(work.id);
        };
        item.querySelector('[data-action="delete"]').onclick = () => {
            if (confirm("本当に削除しますか？")) onDelete(work.id);
        };
        item.querySelector('[data-action="pin"]').onclick = (e) => {
            e.stopPropagation();
            onPin(work.id, work.pinned);
        };

        container.appendChild(item);
    });
}

/**
 * Helper to handle Firestore Timestamp vs Date
 */
function formatWorkDate(val, time = false) {
    if (!val) return "-";
    let date;
    if (val.toDate) date = val.toDate(); // Firestore Timestamp
    else if (val instanceof Date) date = val;
    else if (typeof val === 'number') date = new Date(val); // Unix ms
    else if (typeof val === 'string') date = new Date(val);
    else return "-";

    return formatDate(date, time);
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
