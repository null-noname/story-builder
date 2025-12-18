let works = JSON.parse(localStorage.getItem('sb_works')) || [];
let dailyLogs = JSON.parse(localStorage.getItem('sb_daily_logs')) || {};
let currentId = null;
let writingChart = null;

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(id === 'top-screen') updateTopCounters();
}

function updateTopCounters() {
    const today = new Date().toISOString().split('T')[0];
    const todayCount = dailyLogs[today] || 0;
    const todayCountEl = document.getElementById('top-today-count');
    if(todayCountEl) todayCountEl.innerText = todayCount;

    let weekTotal = 0;
    for(let i=0; i<7; i++) {
        let d = new Date(); d.setDate(d.getDate() - i);
        weekTotal += dailyLogs[d.toISOString().split('T')[0]] || 0;
    }
    const weekCountEl = document.getElementById('top-week-count');
    if(weekCountEl) weekCountEl.innerText = weekTotal;
}

function updateCatchCounter(el) {
    document.getElementById('c-count').innerText = `残り ${35 - el.value.length} 文字`;
}

function formatDateTime(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function formatDate(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
}

function renderWorkList() {
    const listEl = document.getElementById('work-list');
    if(!listEl) return;
    const sortBy = document.getElementById('sort-select').value;
    const filter = document.getElementById('filter-status').value;
    let filtered = works.filter(w => filter === 'all' || w.status === filter);
    filtered.sort((a, b) => { if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1; return b[sortBy] - a[sortBy]; });

    listEl.innerHTML = filtered.map(w => `
        <div class="work-item ${w.isPinned ? 'pinned' : ''}">
            <div style="flex:1; cursor:pointer;" onclick="openWorkDetail(${w.id})">
                <div style="font-weight:bold; font-size:20px; color:#fff;">${w.isPinned ? '★ ' : ''}${w.title}</div>
                <div style="font-size:12px; color:var(--sub-text); margin-top:5px;">
                    作成: ${formatDate(w.created)} | 更新: ${formatDateTime(w.updated)} | 全 ${w.totalChars || 0} 字
                </div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn-custom btn-small" onclick="openWorkEditor(${w.id})">編集</button>
                <button class="btn-custom btn-small" style="color:#ff8888;" onclick="deleteWork(${w.id})">削除</button>
                <button class="btn-custom btn-small" onclick="togglePin(${w.id})">${w.isPinned ? '★' : '☆'}</button>
            </div>
        </div>
    `).join('');
}

function deleteWork(id) {
    if(confirm("この作品を削除しますか？")) {
        works = works.filter(w => w.id !== id);
        localStorage.setItem('sb_works', JSON.stringify(works));
        renderWorkList();
    }
}

function openWorkDetail(id) {
    currentId = id;
    const w = works.find(item => item.id === id);
    document.getElementById('detail-title').innerText = w.title;
    document.getElementById('editor-textarea').value = w.content || "";
    updateLiveCount();
    showScreen('detail-screen');
}

function updateLiveCount() {
    const text = document.getElementById('editor-textarea').value;
    document.getElementById('char-count-full').innerText = text.length;
    document.getElementById('char-count-pure').innerText = text.replace(/\s/g, '').length;
}

function saveWriting() {
    const index = works.findIndex(w => w.id === currentId);
    const oldLen = works[index].content ? works[index].content.length : 0;
    const newText = document.getElementById('editor-textarea').value;
    if (newText.length > oldLen) {
        const today = new Date().toISOString().split('T')[0];
        dailyLogs[today] = (dailyLogs[today] || 0) + (newText.length - oldLen);
        localStorage.setItem('sb_daily_logs', JSON.stringify(dailyLogs));
    }
    works[index].content = newText;
    works[index].totalChars = newText.length;
    works[index].updated = Date.now();
    localStorage.setItem('sb_works', JSON.stringify(works));
    alert("保存しました");
}

function showStats() {
    showScreen('stats-screen');
    const today = new Date().toISOString().split('T')[0];
    const todayStat = document.getElementById('stat-today');
    if(todayStat) todayStat.innerText = dailyLogs[today] || 0;
    
    const worksStat = document.getElementById('stat-works');
    if(worksStat) worksStat.innerText = works.length;
    
    let weekTotal = 0;
    for(let i=0; i<7; i++) {
        let d = new Date(); d.setDate(d.getDate() - i);
        weekTotal += dailyLogs[d.toISOString().split('T')[0]] || 0;
    }
    const weekStat = document.getElementById('stat-week');
    if(weekStat) weekStat.innerText = weekTotal;
    updateChart();
}

function updateChart() {
    const ctxEl = document.getElementById('writingChart');
    if(!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    if (writingChart) writingChart.destroy();
    const range = parseInt(document.getElementById('stat-range').value);
    let labels = []; let data = [];
    for(let i=range-1; i>=0; i--) {
        let d = new Date(); d.setDate(d.getDate() - i);
        labels.push((d.getMonth()+1) + "/" + d.getDate());
        data.push(dailyLogs[d.toISOString().split('T')[0]] || 0);
    }
    writingChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: '#89b4fa', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#555' } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
}

function openWorkEditor(id = null) {
    currentId = id;
    if(id) {
        const w = works.find(w => w.id === id);
        document.getElementById('input-title').value = w.title || "";
        document.getElementById('input-summary').value = w.summary || "";
        document.getElementById('input-catch').value = w.catch || "";
        document.getElementById('input-genre-main').value = w.genreMain || "";
        document.getElementById('input-genre-sub').value = w.genreSub || "";
    } else {
        document.getElementById('input-title').value = "";
        document.getElementById('input-summary').value = "";
        document.getElementById('input-catch').value = "";
        document.getElementById('input-genre-main').value = "";
        document.getElementById('input-genre-sub').value = "";
    }
    showScreen('editor-screen');
}

function saveWork() {
    const titleEl = document.getElementById('input-title');
    if (!titleEl || !titleEl.value) return alert("タイトルを入力してください");
    const title = titleEl.value;
    const now = Date.now();
    const data = {
        id: currentId || now, title: title,
        summary: document.getElementById('input-summary').value,
        catch: document.getElementById('input-catch').value,
        genreMain: document.getElementById('input-genre-main').value,
        genreSub: document.getElementById('input-genre-sub').value,
        content: currentId ? (works.find(w => w.id === currentId).content || "") : "",
        totalChars: currentId ? (works.find(w => w.id === currentId).totalChars || 0) : 0,
        status: document.querySelector('input[name="novel-status"]:checked').value,
        updated: now, created: currentId ? works.find(w => w.id === currentId).created : now,
        isPinned: currentId ? works.find(w => w.id === currentId).isPinned : false
    };
    if (currentId) { const idx = works.findIndex(w => w.id === currentId); works[idx] = data; }
    else { works.push(data); }
    localStorage.setItem('sb_works', JSON.stringify(works));
    renderWorkList(); showScreen('top-screen');
}

function togglePin(id) { const idx = works.findIndex(w => w.id === id); works[idx].isPinned = !works[idx].isPinned; localStorage.setItem('sb_works', JSON.stringify(works)); renderWorkList(); }
function switchTab(t) { console.log(t + "タブを表示"); }

window.onload = () => { renderWorkList(); updateTopCounters(); };