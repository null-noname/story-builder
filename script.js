/* script.js 内の createWorkItem 関数を以下に差し替えてください */

function createWorkItem(id, data) {
    const div = document.createElement('div');
    // ピン留めクラスの付与
    div.className = `work-item ${data.isPinned ? 'pinned' : ''}`;
    
    // 日付フォーマット（短縮版）
    const formatDate = (ts) => {
        if(!ts) return '-';
        const d = new Date(ts.toDate());
        // スマホで見やすいよう、年を省略して月/日だけでも良いですが、一旦そのまま
        return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
    };

    // HTML構造：横並びCSSに合わせて構成
    // メタ情報を一行（または折り返し）で表示するように span で区切ります
    div.innerHTML = `
        <div class="work-info" onclick="openWork('${id}')">
            <div class="work-title">${data.isPinned ? '<span style="color:var(--accent-green)">★</span> ' : ''}${escapeHtml(data.title || '無題')}</div>
            <div class="work-meta">
                <span>更新: ${formatDate(data.updatedAt)}</span>
                <span>全 ${data.totalChars || 0} 字</span>
            </div>
        </div>
        <div class="work-actions">
            <button class="btn-custom btn-small" onclick="openWork('${id}')">編集</button>
            <button class="btn-custom btn-small" style="color:#ff6b6b;" onclick="deleteWork(event, '${id}')">削除</button>
            <button class="btn-custom btn-small" onclick="togglePin(event, '${id}', ${!data.isPinned})">
                ${data.isPinned ? '★' : '☆'}
            </button>
        </div>
    `;
    return div;
}