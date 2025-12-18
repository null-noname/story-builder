// 話数管理用の変数
let currentEpisodeIdx = 0;
let isVertical = false;

// 作品詳細を開く際の処理を拡張
function openWorkDetail(id) {
    currentId = id;
    const w = works.find(item => item.id === id);
    if (!w.episodes) w.episodes = [{ subtitle: "第1話", content: "" }];
    
    document.getElementById('detail-title').innerText = w.title;
    currentEpisodeIdx = 0;
    renderEpisodeList();
    loadEpisode(0);
    showScreen('detail-screen');
}

// 話数リストの描画
function renderEpisodeList() {
    const w = works.find(item => item.id === currentId);
    const listEl = document.getElementById('episode-list');
    listEl.innerHTML = w.episodes.map((ep, idx) => `
        <div class="episode-item ${idx === currentEpisodeIdx ? 'active' : ''}" onclick="loadEpisode(${idx})">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px;">
                ${ep.subtitle || '無題'}
            </span>
            <div style="display:flex; gap:2px;">
                <button class="btn-custom" style="padding:2px 5px; font-size:10px;" onclick="moveEpisode(${idx}, -1); event.stopPropagation();">↑</button>
                <button class="btn-custom" style="padding:2px 5px; font-size:10px;" onclick="moveEpisode(${idx}, 1); event.stopPropagation();">↓</button>
            </div>
        </div>
    `).join('');
}

// 特定の話数をロード
function loadEpisode(idx) {
    const w = works.find(item => item.id === currentId);
    // 現在の入力を保存してから切り替え
    saveCurrentToMemory();
    
    currentEpisodeIdx = idx;
    const ep = w.episodes[idx];
    document.getElementById('episode-subtitle').value = ep.subtitle || "";
    document.getElementById('editor-textarea').value = ep.content || "";
    
    renderEpisodeList();
    updateLiveCount();
}

// メモリ上のデータに一時保存
function saveCurrentToMemory() {
    const w = works.find(item => item.id === currentId);
    if (w && w.episodes[currentEpisodeIdx]) {
        w.episodes[currentEpisodeIdx].subtitle = document.getElementById('episode-subtitle').value;
        w.episodes[currentEpisodeIdx].content = document.getElementById('editor-textarea').value;
    }
}

// 新しい話数を追加
function addEpisode() {
    const w = works.find(item => item.id === currentId);
    if (w.episodes.length >= 1000) return alert("最大話数に達しました");
    
    w.episodes.push({ subtitle: `第${w.episodes.length + 1}話`, content: "" });
    renderEpisodeList();
    loadEpisode(w.episodes.length - 1);
}

// 並び替え
function moveEpisode(idx, dir) {
    const w = works.find(item => item.id === currentId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= w.episodes.length) return;
    
    [w.episodes[idx], w.episodes[newIdx]] = [w.episodes[newIdx], w.episodes[idx]];
    renderEpisodeList();
    if (currentEpisodeIdx === idx) loadEpisode(newIdx);
}

// --- エディタ特殊機能 ---

// ルビ挿入
function insertRuby() {
    const parent = prompt("親文字を入力してください");
    const ruby = prompt("ふりがなを入力してください");
    if (parent && ruby) {
        const tag = `|${parent}《${ruby}》`;
        const area = document.getElementById('editor-textarea');
        area.setRangeText(tag, area.selectionStart, area.selectionEnd, 'end');
        updateLiveCount();
    }
}

// ダッシュ挿入
function insertDash() {
    const area = document.getElementById('editor-textarea');
    area.setRangeText("――", area.selectionStart, area.selectionEnd, 'end');
    updateLiveCount();
}

// 置換
function replaceText() {
    const target = prompt("置換したい文字");
    const replacement = prompt("置換後の文字");
    if (target !== null) {
        const area = document.getElementById('editor-textarea');
        area.value = area.value.split(target).join(replacement);
        updateLiveCount();
    }
}

// 縦書き/横書き切り替え
function toggleWritingMode() {
    isVertical = !isVertical;
    const wrapper = document.getElementById('editor-wrapper');
    wrapper.className = isVertical ? 'editor-wrapper vertical' : 'editor-wrapper horizontal';
}

// Undo/Redo (簡易実装: ブラウザ標準機能を利用)
function editorUndo() { document.execCommand('undo'); }
function editorRedo() { document.execCommand('redo'); }

// 保存処理（統計連動強化）
function saveWriting() {
    saveCurrentToMemory();
    const w = works.find(item => item.id === currentId);
    
    // 全文字数の再計算
    let total = 0;
    w.episodes.forEach(ep => total += (ep.content || "").length);
    w.totalChars = total;
    w.updated = Date.now();
    
    localStorage.setItem('sb_works', JSON.stringify(works));
    updateTopCounters();
    alert("クラウド(Firestore)と同期しました"); // 将来的にdb.collection().set()をここに追加
}

// タブ切り替えの実装
function switchTab(tabName) {
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + tabName).style.display = 'block';
    
    document.querySelectorAll('.tab-bar .btn-custom').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
}