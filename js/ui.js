/**
 * UI Management and Rendering
 */
import { escapeHtml, formatWorkDate, formatDate } from "./core/utils.js";

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
 * Utility to show/hide elements using CSS classes (No direct style manipulation)
 */
export function toggleElementVisibility(elementId, isVisible) {
    const el = document.getElementById(elementId);
    if (el) {
        if (isVisible) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }
}

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
 * 作品詳細を表示（閲覧モード）
 */
export function renderWorkInfo(work, prefix = "info-") {
    const pf = prefix || "info-";
    const title = document.getElementById(`${pf}title`);
    const catchphrase = document.getElementById(`${pf}catchphrase`);
    const summary = document.getElementById(`${pf}summary`) || document.getElementById(`${pf}description`);
    const length = document.getElementById(`${pf}length`);
    const status = document.getElementById(`${pf}status`);
    const type = document.getElementById(`${pf}type`);
    const ai = document.getElementById(`${pf}ai`);
    const rating = document.getElementById(`${pf}rating`);

    const statusLabels = { 'in-progress': '制作中', 'completed': '完了', 'suspended': '中断' };
    const typeLabels = { 'original': 'オリジナル', 'derivative': '二次創作' };
    const aiLabels = { 'none': 'なし', 'assist': '補助利用', 'partial': '一部利用（50％以下）', 'main': '本文利用（50％以上）' };
    const lengthLabels = { 'long': '長編', 'short': '短編' };
    const ratingLabels = { 'sexual': '性描写', 'violent': '暴力', 'cruel': '残酷' };

    if (title) {
        title.textContent = work.title || '無題';
    }
    if (catchphrase) {
        catchphrase.textContent = work.catchphrase || '（未設定）';
    }
    if (summary) {
        summary.textContent = work.description || '（未設定）';
    }

    // 各項目を表示
    if (length) {
        const val = lengthLabels[work.length] || work.length || '（未設定）';
        length.textContent = val;
    }
    if (status) {
        const val = statusLabels[work.status] || work.status || '（未設定）';
        status.textContent = val;
    }
    if (type) {
        const val = typeLabels[work.type] || work.type || '（未設定）';
        type.textContent = val;
    }
    if (ai) {
        const val = aiLabels[work.ai] || work.ai || '（未設定）';
        ai.textContent = val;
    }
    if (rating) {
        const items = (work.rating || []).map(r => ratingLabels[r] || r);
        const val = items.length > 0 ? items.join(' / ') : 'なし';
        rating.textContent = val;
    }
}

/**
 * Get Data from Work Setup Form
 */
export function getWorkFormData() {
    return {
        title: document.getElementById('work-f-title').value.trim(),
        catchphrase: document.getElementById('work-f-catchphrase').value.trim(),
        description: document.getElementById('work-f-description')?.value.trim() || "",
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
        v.classList.add('hidden'); // hiddenクラスを使用
    });

    const loginScreen = document.getElementById(views.login);
    const mainApp = document.getElementById('main-app');

    if (viewId === views.login) {
        if (loginScreen) {
            loginScreen.classList.remove('hidden');
            loginScreen.style.display = 'flex'; // コンテナ自体はflexを維持
        }
        if (mainApp) mainApp.classList.add('hidden');
    } else {
        if (loginScreen) loginScreen.classList.add('hidden');
        if (mainApp) mainApp.classList.remove('hidden');

        // クリーンアップ処理: 執筆画面内の全画面表示設定が残っていたらリセットする
        document.querySelectorAll('.workspace-full-form').forEach(el => {
            el.classList.remove('workspace-full-form');
        });
        document.querySelectorAll('.info-view-actions').forEach(el => {
            el.style.display = ''; // 隠していたボタンを元に戻す
        });

        const target = document.getElementById(viewId);
        if (target) {
            target.classList.add('active');
            target.classList.remove('hidden');
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
 * Render Selectors or Inputs for Work Info Form
 */
export function clearWorkForm() {
    const fields = {
        'work-f-title': '',
        'work-f-catchphrase': '',
        'work-f-description': ''
    };
    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    // Reset radios
    const defaults = {
        'work-status': 'in-progress',
        'work-length': 'long',
        'work-type': 'original',
        'work-ai': 'none'
    };
    Object.entries(defaults).forEach(([name, val]) => {
        const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (el) el.checked = true;
    });

    document.querySelectorAll('input[name="rating"]').forEach(cb => cb.checked = false);

    const countDisp = document.getElementById('catchphrase-count');
    if (countDisp) countDisp.textContent = "残35字";
}

export function populateWorkForm(work) {
    const fields = {
        'work-f-title': work.title || "",
        'work-f-catchphrase': work.catchphrase || "",
        'work-f-description': work.description || ""
    };
    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    const radios = {
        'work-status': work.status || 'in-progress',
        'work-length': work.length || 'long',
        'work-type': work.type || 'original',
        'work-ai': work.ai || 'none'
    };
    Object.entries(radios).forEach(([name, val]) => {
        const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (el) el.checked = true;
    });

    document.querySelectorAll('input[name="rating"]').forEach(cb => {
        cb.checked = (work.rating || []).includes(cb.value);
    });

    const countDisp = document.getElementById('catchphrase-count');
    if (countDisp) countDisp.textContent = `残${35 - (work.catchphrase || "").length}字`;
}


