let works = JSON.parse(localStorage.getItem('sb_works')) || [];
let dailyLogs = JSON.parse(localStorage.getItem('sb_daily_logs')) || {};
let currentId = null;
let currentEpisodeIdx = 0;
let writingChart = null;

// 画面表示の基本関数
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if(target) {
        target.classList.add('active');
        if(id === 'top-screen') updateTopCounters();
    }
    window.scrollTo(0, 0);
}

// TOP画面の文字数表示更新
function updateTopCounters() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('top-today-count').innerText = dailyLogs[today] || 0;
    
    let weekTotal = 0;
    for(let i=0; i<7; i++) {
        let d = new Date(); d.setDate(d.getDate() - i);
        weekTotal += dailyLogs[d.toISOString().split('T')[0]] || 0;
    }
    document.getElementById('top-week-count').innerText = weekTotal;
}

// 作品リストの描画
function renderWorkList() {
    const listEl = document.getElementById('work-list');
    if(!listEl) return;
    const sortBy = document.getElementById('sort-select').value;
    const filter = document.getElementById('filter-status').value;
    
    let filtered = works.filter(w => filter === 'all' || w.status === filter);
    filtered.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
        return (b[sortBy] || 0) - (a[sortBy] || 0);
    });

    listEl.innerHTML = filtered.map(w => `
        <div class="work-item ${w.isPinned ? 'pinned' : ''}">
            <div style="flex:1; cursor:pointer;" onclick="openWorkDetail(${w.id})">
                <div style="font-weight:bold; font-size:20px; color:#fff;">${w.isPinned ? '★ ' : ''}${w.title}</div>
                <div style="font-size:12px; color:var(--sub-text); margin-top:5px;">
                    作成: ${new Date(w.created).toLocaleDateString()} | 更新: ${new Date(w.updated).toLocaleDateString()} | 全 ${w.totalChars || 0} 字
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

// 作品編集画面（作成・編集）を開く
function openWorkEditor(id = null) {
    currentId = id;
    if(id) {
        const w = works.find(item => item.id === id);
        document.getElementById('info-editor-title').innerText = "作品情報の編集";
        document.getElementById('input-title').value = w.title || "";
        document.getElementById('input-summary').value = w.summary || "";
        document.getElementById('input-catch').value = w.catch || "";
        document.getElementById('input-genre-main').value = w.genreMain || "";
        document.getElementById('input-genre-sub').value = w.genreSub || "";
        if(w.status) document.querySelector(`input[name="novel-status"][value="${w.status}"]`).checked = true;
    } else {
        document.getElementById('info-editor-title').innerText = "新規作品作成";
        document.getElementById('input-title').value = "";
        document.getElementById('input-summary').value = "";
        document.getElementById('input-catch').value = "";
        document.getElementById('input-genre-main').value = "";
        document.getElementById('input-genre-sub').value = "";
    }
    showScreen('editor-screen');
}

// 作品情報の保存
function saveWork() {
    const title = document.getElementById('input-title').value;
    if (!title) return alert("タイトルを入力してください");
    const now = Date.now();
    const data = {
        id: currentId || now,
        title: title,
        summary: document.getElementById('input-summary').value,
        catch: document.getElementById('input-catch').value,
        genreMain: document.getElementById('input-genre-main').value,
        genreSub: document.getElementById('input-genre-sub').value,
        status: document.querySelector('input[name="novel-status"]:checked').value,
        updated: now,
        created: currentId ? works.find(w => w.id === currentId).created : now,
        isPinned: currentId ? works.find(w => w.id === currentId).isPinned : false,
        totalChars: currentId ? (works.find(w => w.id === currentId).totalChars || 0) : 0,
        episodes: currentId ? (works.find(w => w.id === currentId).episodes || []) : []
    };
    if (currentId) {
        const idx = works.findIndex(w => w.id === currentId);
        works[idx] = data;
    } else {
        works.push(data);
    }
    localStorage.setItem('sb_works', JSON.stringify(works));
    renderWorkList();
    showScreen('top-screen');
}

// 執筆詳細画面を開く
function openWorkDetail(id) {
    currentId = id;
    const w = works.find(item => item.id === id);
    if (!w.episodes || w.episodes.length === 0) w.episodes = [{ subtitle: "第1話", content: "" }];
    
    document.getElementById('detail-title').innerText = w.title;
    currentEpisodeIdx = 0;
    renderEpisodeList();
    loadEpisode(0);
    showScreen('detail-screen');
}

// エピソード一覧の描画
function renderEpisodeList() {
    const w = works.find(item => item.id === currentId);
    const listEl = document.getElementById('episode-list');
    listEl.innerHTML = w.episodes.map((ep, idx) => `
        <div class="episode-item ${idx === currentEpisodeIdx ? 'active' : ''}" onclick="loadEpisode(${idx})">
            ${ep.subtitle || '無題'}
        </div>
    `).join('');
}

// エピソードの読み込み
function loadEpisode(idx) {
    const w = works.find(item => item.id === currentId);
    currentEpisodeIdx = idx;
    const ep = w.episodes[idx];
    document.getElementById('episode-subtitle').value = ep.subtitle || "";
    document.getElementById('editor-textarea').value = ep.content || "";
    renderEpisodeList();
    updateLiveCount();
}

// エピソードの追加
function addEpisode() {
    const w = works.find(item => item.id === currentId);
    w.episodes.push({ subtitle: `第${w.episodes.length + 1}話`, content: "" });
    renderEpisodeList();
    loadEpisode(w.episodes.length - 1);
}

// 執筆内容の保存（統計連動）
function saveWriting() {
    const w = works.find(item => item.id === currentId);
    const ep = w.episodes[currentEpisodeIdx];
    const oldLen = ep.content ? ep.content.length : 0;
    const newText = document.getElementById('editor-textarea').value;
    
    ep.subtitle = document.getElementById('episode-subtitle').value;
    ep.content = newText;
    
    if (newText.length > oldLen) {
        const today = new Date().toISOString().split('T')[0];
        dailyLogs[today] = (dailyLogs[today] || 0) + (newText.length - oldLen);
        localStorage.setItem('sb_daily_logs', JSON.stringify(dailyLogs));
    }
    
    // 全文字数計算
    let total = 0;
    w.episodes.forEach(e => total += (e.content || "").length);
    w.totalChars = total;
    w.updated = Date.now();
    
    localStorage.setItem('sb_works', JSON.stringify(works));
    alert("保存しました");
}

// 文字数カウント
function updateLiveCount() {
    const text = document.getElementById('editor-textarea').value;
    document.getElementById('char-count-full').innerText = text.length;
    document.getElementById('char-count-pure').innerText = text.replace(/\s/g, '').length;
}

// 縦書き切り替え
function toggleVertical() {
    document.getElementById('editor-textarea').classList.toggle('vertical-mode');
}

// 統計画面
function showStats() {
    showScreen('stats-screen');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('stat-today').innerText = dailyLogs[today] || 0;
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
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// その他の補助関数
function togglePin(id) { const idx = works.findIndex(w => w.id === id); works[idx].isPinned = !works[idx].isPinned; localStorage.setItem('sb_works', JSON.stringify(works)); renderWorkList(); }
function deleteWork(id) { if(confirm("削除しますか？")) { works = works.filter(w => w.id !== id); localStorage.setItem('sb_works', JSON.stringify(works)); renderWorkList(); } }
function updateCatchCounter(el) { document.getElementById('c-count').innerText = `残り ${35 - el.value.length} 文字`; }
function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + t).style.display = 'block';
    document.querySelectorAll('.tab-bar .btn-custom').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-tab-' + t).classList.add('active');
}

window.onload = () => { renderWorkList(); updateTopCounters(); };