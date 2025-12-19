/* Story Builder V1.00 script.js - Part 1/3 */
document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Firebase Configuration ---
    const firebaseConfig = {
        apiKey: "AIzaSyDc5HZ1PVW7H8-Pe8PBoY_bwCMm0jd5_PU",
        authDomain: "story-builder-app.firebaseapp.com",
        projectId: "story-builder-app",
        storageBucket: "story-builder-app.firebasestorage.app",
        messagingSenderId: "763153451684",
        appId: "1:763153451684:web:37a447d4cafb4abe41f431"
    };

    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    } else if (typeof firebase === 'undefined') {
        alert("Firebaseの読み込みに失敗しました。リロードしてください。");
        return;
    }

    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- 2. Global State ---
    window.currentUser = null;
    window.currentWorkId = null;
    window.currentChapterId = null;
    window.editingMemoId = null;
    window.editingPlotId = null;
    window.editingCharId = null;
    window.previousView = 'top';
    window.charCountMode = 'total';
    window.unsubscribeWorks = null;
    window.chapterListMode = 'normal';
    window.lastContentLength = 0;
    window.todayAddedCount = 0;
    window.pendingLogSave = null;
    window.writingChart = null;
    window.dailyHistory = [0,0,0,0,0,0,0];
    window.dragSrcEl = null;
    window.currentHistoryData = null;

    // 設定初期値
    window.appSettings = {
        edLetterSpacing: 0, edLineHeight: 1.8, edWidth: 100, edFontSize: 16,
        prVerticalChars: 20, prLinesPage: 20, prFontScale: 1.0
    };

    // --- 3. DOM Elements & Views ---
    const views = {
        top: document.getElementById('top-view'),
        workspace: document.getElementById('workspace-view'),
        stats: document.getElementById('stats-view'),
        memo: document.getElementById('memo-view'),
        memoEditor: document.getElementById('memo-editor-view')
    };

    // --- 4. Core Functions (Definitions) ---
    // 画面切り替え
    window.switchView = function(name) {
        Object.values(views).forEach(el => { if(el) el.style.display = 'none'; });
        if (views[name]) {
            views[name].style.display = 'flex';
            if(name === 'top') {
                initWorkListener();
                loadDailyLog();
                window.currentWorkId = null;
            } else {
                if(window.unsubscribeWorks) { window.unsubscribeWorks(); window.unsubscribeWorks = null; }
            }
            if(name === 'memo') loadMemoList();
            if(name === 'stats') loadStats();
            if(name === 'workspace') loadMemoListForWorkspace();
            saveAppState(name);
        }
    };

    function saveAppState(viewName) {
        if(!viewName) return;
        localStorage.setItem('sb_last_view', viewName);
        if(window.currentWorkId) localStorage.setItem('sb_last_work', window.currentWorkId);
        if(window.currentChapterId) localStorage.setItem('sb_last_chapter', window.currentChapterId);
        const activeTab = document.querySelector('.tab-btn.active');
        if(activeTab) localStorage.setItem('sb_last_tab', activeTab.getAttribute('data-tab'));
    }

    // 作品管理
    window.openWork = async function(id, initTab = 'tab-info') {
        window.currentWorkId = id;
        window.currentChapterId = null;
        saveAppState('workspace');
        const workDoc = await db.collection('works').doc(id).get();
        if(!workDoc.exists) return;
        const data = workDoc.data();
        fillWorkInfo(data);
        // 初回章作成
        if (data.content && data.content.length > 0) {
            const chaptersSnap = await db.collection('works').doc(id).collection('chapters').get();
            if (chaptersSnap.empty) {
                await db.collection('works').doc(id).collection('chapters').add({
                    title: "第1話", content: data.content, order: 1, updatedAt: new Date()
                });
                await db.collection('works').doc(id).update({ content: "" });
            }
        }
        await loadChapters();
        switchView('workspace');
        activateTab(initTab);
    };

    window.createNewWork = async function() {
        if (!window.currentUser) return;
        const newWork = {
            uid: window.currentUser.uid, title: "無題の物語", status: "in-progress", isPinned: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            totalChars: 0
        };
        try {
            const doc = await db.collection('works').add(newWork);
            await db.collection('works').doc(doc.id).collection('chapters').add({
                title: "第1話", content: "", order: 1, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            openWork(doc.id);
        } catch (e) { console.error(e); }
    };

    window.saveWorkInfo = function() {
        if(!window.currentWorkId) return;
        const selectedRatings = [];
        document.querySelectorAll('input[name="rating"]:checked').forEach(c => selectedRatings.push(c.value));
        const data = {
            title: document.getElementById('input-title').value,
            description: document.getElementById('input-summary').value,
            catchphrase: document.getElementById('input-catch').value,
            genreMain: document.getElementById('input-genre-main').value,
            genreSub: document.getElementById('input-genre-sub').value,
            status: document.querySelector('input[name="novel-status"]:checked')?.value || "in-progress",
            type: document.querySelector('input[name="novel-type"]:checked')?.value || "original",
            aiUsage: document.querySelector('input[name="ai-usage"]:checked')?.value || "none",
            ratings: selectedRatings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        db.collection('works').doc(window.currentWorkId).update(data).then(() => alert("保存しました"));
    };

    function fillWorkInfo(data) {
        document.getElementById('input-title').value = data.title || "";
        document.getElementById('input-summary').value = data.description || "";
        document.getElementById('input-catch').value = data.catchphrase || "";
        document.getElementById('input-genre-main').value = data.genreMain || "";
        document.getElementById('input-genre-sub').value = data.genreSub || "";
        const setRadio = (name, val) => { const r = document.querySelector(`input[name="${name}"][value="${val}"]`); if(r) r.checked = true; };
        setRadio("novel-status", data.status || "in-progress");
        setRadio("novel-type", data.type || "original");
        setRadio("ai-usage", data.aiUsage || "none");
        const ratings = data.ratings || [];
        document.querySelectorAll('input[name="rating"]').forEach(c => c.checked = ratings.includes(c.value));
        updateCatchCounter(document.getElementById('input-catch'));
    }

    function initWorkListener() {
        if(window.unsubscribeWorks) window.unsubscribeWorks();
        if (!window.currentUser) return;
        const sortKey = document.getElementById('sort-order').value === 'created' ? 'createdAt' : 'updatedAt';
        const filterStatus = document.getElementById('filter-status').value;
        let query = db.collection('works').where('uid', '==', window.currentUser.uid);
        window.unsubscribeWorks = query.onSnapshot(snapshot => {
            const listEl = document.getElementById('work-list');
            if(!listEl) return;
            listEl.innerHTML = '';
            let worksData = [];
            snapshot.forEach(doc => { worksData.push({ ...doc.data(), id: doc.id }); });
            if(filterStatus !== 'all') worksData = worksData.filter(w => w.status === filterStatus);
            worksData.sort((a, b) => {
                if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
                const tA = a[sortKey] ? a[sortKey].toMillis() : 0;
                const tB = b[sortKey] ? b[sortKey].toMillis() : 0;
                return tB - tA;
            });
            worksData.forEach(d => listEl.appendChild(createWorkItem(d.id, d)));
        });
    }

    function createWorkItem(id, data) {
        const div = document.createElement('div');
        div.className = `work-item ${data.isPinned ? 'pinned' : ''}`;
        const formatDate = (ts) => {
            if(!ts) return '-';
            const d = new Date(ts.toDate());
            const pad = n => n.toString().padStart(2, '0');
            return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        const titleStar = data.isPinned ? '<span style="color:var(--accent-green); margin-right:4px;">★</span>' : '';
        const pinBtnIcon = data.isPinned ? '★' : '☆';
        div.innerHTML = `
            <div class="work-info" onclick="openWork('${id}')">
                <div class="work-title">${titleStar}${escapeHtml(data.title || '無題')}</div>
                <div class="work-meta-container"><div class="work-meta-row">更新: ${formatDate(data.updatedAt)} / 全 ${data.totalChars || 0} 字</div></div>
            </div>
            <div class="work-actions">
                <button class="btn-custom btn-card-action" onclick="openWork('${id}')">編集</button>
                <button class="btn-custom btn-card-action btn-card-delete" onclick="deleteWork(event, '${id}')">削除</button>
                <button class="btn-custom btn-card-action" onclick="togglePin(event, '${id}', ${!data.isPinned})">${pinBtnIcon}</button>
            </div>`;
        return div;
    }
    window.deleteWork = function(e, id) { e.stopPropagation(); if(confirm("削除しますか？")) db.collection('works').doc(id).delete(); };
    window.togglePin = function(e, id, newState) { e.stopPropagation(); db.collection('works').doc(id).update({ isPinned: newState }); };

/* Story Builder V1.00 script.js - Part 2/3 */

    // --- Editor & Chapter Logic ---
    window.initEditorToolbar = function() {
        const editorTab = document.getElementById('tab-editor');
        if(!editorTab) return;
        editorTab.innerHTML = ''; editorTab.style.flexDirection = 'row'; editorTab.classList.remove('mobile-editor-active');
        // サイドバー
        const sidebar = document.createElement('div'); sidebar.id = 'chapter-sidebar'; sidebar.className = 'chapter-sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header"><div style="display:flex; align-items:center; flex:1;"><span style="font-weight:bold;">話一覧</span><div style="flex:1;"></div><button class="btn-custom btn-small" id="add-chapter-btn" style="padding:2px 8px;">＋</button><button class="chapter-menu-btn" id="chapter-menu-toggle">≡</button><div id="chapter-menu-overlay" class="chapter-menu-overlay"><div class="chapter-menu-item" onclick="setChapterMode('reorder')">原稿の並び替え</div><div class="chapter-menu-item" onclick="setChapterMode('delete')">原稿を削除する</div><div class="chapter-menu-item" onclick="setChapterMode('normal')">メニューを閉じる</div></div></div></div>
            <div id="chapter-list" class="chapter-list scrollable"></div>
            <div class="sidebar-footer"><small id="total-work-chars">合計: 0文字</small><button id="sidebar-toggle-close" class="sidebar-toggle-btn">◀</button></div>`;
        editorTab.appendChild(sidebar);
        // メインエリア
        const mainArea = document.createElement('div'); mainArea.className = 'editor-main-area';
        const header = document.createElement('div'); header.className = 'editor-header';
        const openSidebarBtn = document.createElement('button'); openSidebarBtn.id = 'sidebar-toggle-open'; openSidebarBtn.className = 'sidebar-toggle-open-btn'; openSidebarBtn.textContent = '▶'; openSidebarBtn.style.display = 'none';
        // ツールバー
        const toolbar = document.createElement('div'); toolbar.className = 'editor-toolbar';
        const tools = [{icon:'📖',action:showPreview},{icon:'⚙️',action:openEditorSettings},{spacer:true},{id:'btn-writing-mode',icon:'縦',action:toggleVerticalMode},{icon:'置換',action:openReplaceModal},{icon:'ﾙﾋﾞ',action:insertRuby},{icon:'―',action:insertDash},{icon:'🕒',action:openHistoryModal}];
        tools.forEach(t=>{ if(t.spacer){const sp=document.createElement('span');sp.style.cssText="color:#555;margin:0 5px;";sp.textContent='|';toolbar.appendChild(sp);}else{const btn=document.createElement('button');btn.className='toolbar-btn';if(t.id)btn.id=t.id;btn.textContent=t.icon;btn.onclick=t.action;toolbar.appendChild(btn);}});
        const counter = document.createElement('div'); counter.className = 'char-count-display'; counter.id = 'editor-char-counter'; counter.textContent = '0文字';
        header.appendChild(openSidebarBtn); header.appendChild(toolbar); header.appendChild(counter);
        // エディタ本体
        const titleRow = document.createElement('div'); titleRow.className = 'chapter-title-row'; titleRow.innerHTML = `<textarea id="chapter-title-input" class="chapter-title-input" placeholder="サブタイトル" rows="1"></textarea>`;
        const editorContainer = document.createElement('div'); editorContainer.id = 'editor-container'; editorContainer.style.cssText = "flex:1;position:relative;border:1px solid #555;background:#111;overflow:hidden;";
        editorContainer.innerHTML = `<textarea id="main-editor" class="main-textarea" style="width:100%;height:100%;border:none;" placeholder="章を選択するか、新しい章を追加してください..."></textarea>`;
        const footerRow = document.createElement('div'); footerRow.className = 'editor-footer-row';
        footerRow.innerHTML = `<button class="btn-custom btn-small btn-red" id="del-ch-btn">削除</button><div style="display:flex;gap:8px;align-items:center;"><button class="toolbar-btn-footer" id="undo-btn">◀️</button><button class="toolbar-btn-footer" id="redo-btn">▶️</button><span style="color:#555;">|</span><button class="toolbar-btn-footer mobile-only" id="back-list-btn">🔙</button><button class="btn-custom btn-small" id="quick-save-btn">保存</button></div>`;
        mainArea.appendChild(header); mainArea.appendChild(titleRow); mainArea.appendChild(editorContainer); mainArea.appendChild(footerRow);
        editorTab.appendChild(mainArea);
        // イベント付与 (HTML生成後にID取得)
        document.getElementById('chapter-menu-toggle').onclick=(e)=>{e.stopPropagation();const o=document.getElementById('chapter-menu-overlay');o.style.display=o.style.display==='flex'?'none':'flex';};
        document.addEventListener('click',()=>document.getElementById('chapter-menu-overlay').style.display='none');
        document.getElementById('add-chapter-btn').onclick=addNewChapter;
        document.getElementById('sidebar-toggle-close').onclick=toggleSidebar;
        document.getElementById('sidebar-toggle-open').onclick=toggleSidebar;
        document.getElementById('editor-char-counter').onclick=toggleCharCountMode;
        document.getElementById('del-ch-btn').onclick=deleteCurrentChapter;
        document.getElementById('quick-save-btn').onclick=()=>saveCurrentChapter(null,false);
        document.getElementById('back-list-btn').onclick=showMobileChapterList;
        document.getElementById('undo-btn').onclick=()=>{const e=document.getElementById('main-editor');if(e){e.focus();document.execCommand('undo');}};
        document.getElementById('redo-btn').onclick=()=>{const e=document.getElementById('main-editor');if(e){e.focus();document.execCommand('redo');}};
    };

    window.setChapterMode = function(mode) { window.chapterListMode = mode; loadChapters(); };
    window.toggleSidebar = function() { const s=document.getElementById('chapter-sidebar'); const b=document.getElementById('sidebar-toggle-open'); if(s){s.classList.toggle('collapsed'); if(b)b.style.display=s.classList.contains('collapsed')?'block':'none';}};
    window.showMobileEditor = function() { const t=document.getElementById('tab-editor'); if(window.innerWidth<=600&&t)t.classList.add('mobile-editor-active'); };
    window.showMobileChapterList = function() { const t=document.getElementById('tab-editor'); if(t)t.classList.remove('mobile-editor-active'); };

    window.loadChapters = function() {
        if(!window.currentWorkId) return Promise.resolve();
        const listEl = document.getElementById('chapter-list'); listEl.innerHTML = '読み込み中...';
        return db.collection('works').doc(window.currentWorkId).collection('chapters').orderBy('order','asc').get().then(snap=>{
            listEl.innerHTML = ''; let total=0;
            if(snap.empty) { listEl.innerHTML='<div style="padding:10px;color:#aaa;">章がありません</div>'; return; }
            snap.forEach((doc,i)=>{
                const d=doc.data(); const item=document.createElement('div'); item.className='chapter-item'; item.setAttribute('data-id',doc.id);
                if(window.currentChapterId===doc.id) item.classList.add('active');
                total += (d.content||"").replace(/\s/g,'').length;
                if(window.chapterListMode==='reorder'){
                    item.setAttribute('draggable','true'); item.innerHTML=`<span class="chapter-list-title">${escapeHtml(d.title)}</span><span class="drag-handle">||</span>`;
                    item.querySelector('.drag-handle').addEventListener('touchstart',handleTouchStart,{passive:false});item.querySelector('.drag-handle').addEventListener('touchmove',handleTouchMove,{passive:false});item.querySelector('.drag-handle').addEventListener('touchend',handleTouchEnd);
                    addDragEvents(item);
                } else if(window.chapterListMode==='delete'){
                    item.innerHTML=`<span class="chapter-list-title">${escapeHtml(d.title)}</span><span class="chapter-delete-icon" onclick="deleteTargetChapter('${doc.id}')">🗑️</span>`;
                } else {
                    item.innerHTML=`<span class="chapter-list-title">${escapeHtml(d.title)}</span><span class="chapter-list-count">(${(d.content||"").length}字)</span>`;
                    item.onclick=()=>selectChapter(doc.id,d);
                }
                listEl.appendChild(item);
            });
            document.getElementById('total-work-chars').textContent=`合計: ${total}文字`;
        });
    };

    window.selectChapter = function(id, data) {
        window.currentChapterId = id; saveAppState('workspace');
        document.getElementById('main-editor').value = data.content||""; window.lastContentLength = (data.content||"").length;
        if(document.getElementById('chapter-title-input')) document.getElementById('chapter-title-input').value = data.title||"";
        updateCharCount();
        document.querySelectorAll('.chapter-item').forEach(e=>e.classList.remove('active'));
        const activeItem = document.querySelector(`.chapter-item[data-id="${id}"]`); if(activeItem) activeItem.classList.add('active');
        showMobileEditor();
    };

    window.saveCurrentChapter = async function(nextView, showAlert) {
        if(!window.currentWorkId || !window.currentChapterId) { if(nextView)switchView(nextView); return; }
        const content = document.getElementById('main-editor').value; const title = document.getElementById('chapter-title-input').value||"無題";
        if(content.length>20000){alert("文字数オーバー(2万字まで)");return;}
        const ref = db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId);
        await ref.collection('history').add({content:content,savedAt:firebase.firestore.FieldValue.serverTimestamp()});
        await ref.update({title:title,content:content,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        saveDailyLogToFirestore();
        loadChapters();
        if(nextView) switchView(nextView); else if(showAlert) alert("保存しました");
    };

    window.addNewChapter = async function() {
        if(!window.currentWorkId) return;
        const snap = await db.collection('works').doc(window.currentWorkId).collection('chapters').get();
        const title = prompt("新しい章のタイトル", `第${snap.size+1}話`);
        if(title) { await db.collection('works').doc(window.currentWorkId).collection('chapters').add({title:title,content:"",order:snap.size+1,updatedAt:new Date()}); loadChapters(); }
    };
    window.deleteCurrentChapter = async function() {
        if(!window.currentWorkId || !window.currentChapterId || !confirm("削除しますか？")) return;
        await db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId).delete();
        window.currentChapterId=null; document.getElementById('main-editor').value=""; showMobileChapterList(); loadChapters();
    };
    window.deleteTargetChapter = async function(id) { if(confirm("削除しますか？")){ await db.collection('works').doc(window.currentWorkId).collection('chapters').doc(id).delete(); loadChapters(); } };

    // --- Plot & Char Logic ---
    window.loadPlots = function() {
        const c=document.getElementById('plot-items-container'); if(!c||!window.currentWorkId)return;
        db.collection('works').doc(window.currentWorkId).collection('plots').orderBy('order','asc').get().then(snap=>{
            c.innerHTML=''; if(snap.empty){c.innerHTML='<div style="padding:20px;text-align:center;color:#555;">プロットなし</div>';return;}
            snap.forEach(doc=>{
                const d=doc.data(); const div=document.createElement('div'); div.className='plot-card';
                div.innerHTML=`<div class="plot-card-header"><div class="plot-card-title">${escapeHtml(d.title)}</div><div class="plot-actions"><div class="sort-btn" onclick="event.stopPropagation();movePlot('${doc.id}',-1)">▲</div><div class="sort-btn" onclick="event.stopPropagation();movePlot('${doc.id}',1)">▼</div></div></div><div class="plot-card-preview">${escapeHtml(d.content)}</div>`;
                div.onclick=()=>openPlotEditor(doc.id); c.appendChild(div);
            });
        });
    };
    window.openPlotEditor = function(id) {
        window.editingPlotId=id; const t=document.getElementById('plot-edit-title'); const c=document.getElementById('plot-edit-content'); const ty=document.getElementById('plot-edit-type');
        if(id){db.collection('works').doc(window.currentWorkId).collection('plots').doc(id).get().then(d=>{if(d.exists){const data=d.data();t.value=data.title;c.value=data.content;if(ty)ty.value=data.type||'memo';}});}
        else{t.value="";c.value="";if(ty)ty.value='memo';}
        document.getElementById('plot-edit-view').style.display='flex';
    };
    window.savePlotItem = async function() {
        const t=document.getElementById('plot-edit-title').value; const c=document.getElementById('plot-edit-content').value; const ty=document.getElementById('plot-edit-type').value;
        const d={title:t,content:c,type:ty,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
        if(window.editingPlotId) await db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId).update(d);
        else { const s=await db.collection('works').doc(window.currentWorkId).collection('plots').get(); d.order=s.size+1; d.createdAt=firebase.firestore.FieldValue.serverTimestamp(); await db.collection('works').doc(window.currentWorkId).collection('plots').add(d); }
        document.getElementById('plot-edit-view').style.display='none'; loadPlots();
    };
    window.deletePlotItem = async function() { if(window.editingPlotId && confirm("削除しますか？")){ await db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId).delete(); document.getElementById('plot-edit-view').style.display='none'; loadPlots(); } };
    window.movePlot = async function(id, dir) { await moveItem('plots', id, dir); loadPlots(); };

    window.loadCharacters = function() {
        const c=document.getElementById('char-items-container'); if(!c||!window.currentWorkId)return;
        db.collection('works').doc(window.currentWorkId).collection('characters').orderBy('order','asc').get().then(snap=>{
            c.innerHTML=''; if(snap.empty){c.innerHTML='<div style="padding:20px;text-align:center;color:#555;">キャラなし</div>';return;}
            snap.forEach(doc=>{
                const d=doc.data(); const card=document.createElement('div'); card.className='char-card';
                const img = d.iconBase64 ? `<img src="${d.iconBase64}" class="char-icon">` : '<div class="char-icon">👤</div>';
                card.innerHTML=`<div class="char-sort-controls"><button class="char-sort-btn" onclick="event.stopPropagation();moveChar('${doc.id}',-1)">▲</button><button class="char-sort-btn" onclick="event.stopPropagation();moveChar('${doc.id}',1)">▼</button></div>${img}<div class="char-name">${escapeHtml(d.name)}</div><div class="char-role">${escapeHtml(d.role)}</div>`;
                card.onclick=()=>openCharEditor(doc.id); c.appendChild(card);
            });
            document.getElementById('stat-chars').textContent = snap.size + "体";
        });
    };
    window.openCharEditor = function(id) {
        window.editingCharId=id; const fields=['name','ruby','alias','age','birth','role','height','appearance','personality','ability','background','memo']; const p=document.getElementById('char-icon-preview');
        if(id){db.collection('works').doc(window.currentWorkId).collection('characters').doc(id).get().then(doc=>{if(doc.exists){const d=doc.data();fields.forEach(f=>{const e=document.getElementById('char-'+f);if(e)e.value=d[f]||"";});if(d.iconBase64){p.innerHTML=`<img src="${d.iconBase64}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;p.setAttribute('data-base64',d.iconBase64);}else{p.innerHTML='👤';p.removeAttribute('data-base64');}}});}
        else{fields.forEach(f=>{const e=document.getElementById('char-'+f);if(e)e.value="";});p.innerHTML='👤';p.removeAttribute('data-base64');}
        document.getElementById('char-edit-view').style.display='flex';
    };
    window.saveCharItem = async function() {
        const getData=id=>document.getElementById('char-'+id)?.value||""; const ib=document.getElementById('char-icon-preview').getAttribute('data-base64')||"";
        const d={name:getData('name'),ruby:getData('ruby'),alias:getData('alias'),age:getData('age'),birth:getData('birth'),role:getData('role'),height:getData('height'),appearance:getData('appearance'),personality:getData('personality'),ability:getData('ability'),background:getData('background'),memo:getData('memo'),iconBase64:ib,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
        if(window.editingCharId) await db.collection('works').doc(window.currentWorkId).collection('characters').doc(window.editingCharId).update(d);
        else { const s=await db.collection('works').doc(window.currentWorkId).collection('characters').get(); d.order=s.size+1; d.createdAt=firebase.firestore.FieldValue.serverTimestamp(); await db.collection('works').doc(window.currentWorkId).collection('characters').add(d); }
        document.getElementById('char-edit-view').style.display='none'; loadCharacters();
    };
    window.deleteCharItem = async function() { if(window.editingCharId&&confirm("削除？")){ await db.collection('works').doc(window.currentWorkId).collection('characters').doc(window.editingCharId).delete(); document.getElementById('char-edit-view').style.display='none'; loadCharacters(); } };
    window.moveChar = async function(id, dir) { await moveItem('characters', id, dir); loadCharacters(); };

    // Helper: Move Item
    async function moveItem(col, id, dir) {
        const snap = await db.collection('works').doc(window.currentWorkId).collection(col).orderBy('order','asc').get();
        let items=[]; snap.forEach(d=>items.push({id:d.id,...d.data()}));
        const idx = items.findIndex(i=>i.id===id); if(idx===-1)return; const tIdx=idx+dir; if(tIdx<0||tIdx>=items.length)return;
        [items[idx], items[tIdx]] = [items[tIdx], items[idx]];
        const batch=db.batch(); items.forEach((it,i)=>{batch.update(db.collection('works').doc(window.currentWorkId).collection(col).doc(it.id),{order:i+1});});
        await batch.commit();
    }

/* Story Builder V1.00 script.js - Part 3/3 */

    // --- Memo Logic ---
    window.loadMemoList = function() {
        if(!window.currentUser) return;
        const c=document.getElementById('memo-list-container'); if(!c)return; c.innerHTML='';
        db.collection('memos').where('uid','==',window.currentUser.uid).get().then(s=>{
            let m=[]; s.forEach(d=>m.push({id:d.id,...d.data()})); m.sort((a,b)=>(b.updatedAt?.toMillis()||0)-(a.updatedAt?.toMillis()||0));
            m.forEach(d=>c.appendChild(createMemoCard(d.id,d,'memo')));
        });
    };
    window.loadMemoListForWorkspace = function() {
        if(!window.currentUser) return;
        const c=document.getElementById('ws-memo-list-container'); if(!c)return; c.innerHTML='';
        db.collection('memos').where('uid','==',window.currentUser.uid).get().then(s=>{
            let m=[]; s.forEach(d=>m.push({id:d.id,...d.data()})); m.sort((a,b)=>(b.updatedAt?.toMillis()||0)-(a.updatedAt?.toMillis()||0));
            m.forEach(d=>c.appendChild(createMemoCard(d.id,d,'workspace')));
        });
    };
    function createMemoCard(id,data,view){
        const d=document.createElement('div'); d.className='memo-card';
        d.innerHTML=`<div class="memo-header"><span class="memo-title">${escapeHtml(data.title)}</span><div><button class="memo-btn" onclick="openMemoEditor('${id}','${view}')">編集</button><button class="memo-btn memo-btn-delete" onclick="deleteMemo('${id}','${view}')">削除</button></div></div><div class="memo-divider"></div><div class="memo-text">${escapeHtml(data.content)}</div>`;
        return d;
    }
    window.openMemoEditor=function(id,v){ window.editingMemoId=id;window.previousView=v; if(id){db.collection('memos').doc(id).get().then(d=>{const da=d.data();document.getElementById('memo-editor-title').value=da.title;document.getElementById('memo-editor-content').value=da.content;switchView('memoEditor');});}else{document.getElementById('memo-editor-title').value="";document.getElementById('memo-editor-content').value="";switchView('memoEditor');} };
    window.saveMemo=function(){
        const t=document.getElementById('memo-editor-title').value||"新規メモ"; const c=document.getElementById('memo-editor-content').value;
        const d={uid:window.currentUser.uid,title:t,content:c,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
        if(window.editingMemoId) db.collection('memos').doc(window.editingMemoId).update(d).then(()=>switchView(window.previousView));
        else { d.createdAt=firebase.firestore.FieldValue.serverTimestamp(); db.collection('memos').add(d).then(()=>switchView(window.previousView)); }
    };
    window.deleteMemo=function(id,v){ if(confirm("削除？")) db.collection('memos').doc(id).delete().then(()=>(v==='memo'?loadMemoList:loadMemoListForWorkspace)()); };

    // --- Utils & Stats ---
    window.loadDailyLog = async function() {
        if(!window.currentUser) return;
        let p=[], l=[]; for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const s=`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;l.push(`${d.getMonth()+1}/${d.getDate()}`);p.push(db.collection('daily_logs').doc(`${window.currentUser.uid}_${s}`).get());}
        const s=await Promise.all(p); let w=0; window.dailyHistory=s.map(d=>{const v=d.exists?(d.data().count||0):0;w+=v;return v;});
        window.todayAddedCount=window.dailyHistory[6]; window.graphLabels=l;
        document.getElementById('widget-today-count').innerHTML=`${window.todayAddedCount}<span class="unit">字</span>`; document.getElementById('widget-weekly-count').innerHTML=`${w}<span class="unit">字</span>`;
    };
    window.loadStats = function() {
        db.collection('works').where('uid','==',window.currentUser.uid).get().then(s=>document.getElementById('stat-works').innerHTML=`${s.size}<span class="unit">作品</span>`);
        loadDailyLog(); const ctx=document.getElementById('writingChart').getContext('2d'); if(window.writingChart)window.writingChart.destroy();
        window.writingChart=new Chart(ctx,{type:'bar',data:{labels:window.graphLabels,datasets:[{data:window.dailyHistory,backgroundColor:'#89b4fa',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#444'}},x:{grid:{display:false}}}}});
    };
    window.trackDailyProgress = function() {
        const e=document.getElementById('main-editor'); if(!e)return; const diff=e.value.length-window.lastContentLength;
        if(diff>0){ window.todayAddedCount+=diff; window.dailyHistory[6]=window.todayAddedCount; document.getElementById('widget-today-count').innerHTML=`${window.todayAddedCount}<span class="unit">字</span>`; if(window.pendingLogSave)clearTimeout(window.pendingLogSave); window.pendingLogSave=setTimeout(saveDailyLogToFirestore,3000); }
        window.lastContentLength=e.value.length;
    };
    function saveDailyLogToFirestore(){ if(!window.currentUser)return; const d=new Date();const s=`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`; db.collection('daily_logs').doc(`${window.currentUser.uid}_${s}`).set({uid:window.currentUser.uid,date:s,count:window.todayAddedCount,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); }
    
    // UI Helpers
    window.showPreview=function(){const e=document.getElementById('main-editor');const c=document.getElementById('preview-content');document.getElementById('preview-modal').style.display='flex';c.innerHTML=escapeHtml(e.value).replace(/\n/g,'<br>').replace(/[\|｜]([^《]+?)《(.+?)》/g,'<ruby>$1<rt>$2</rt></ruby>');applyPreviewLayout();};
    window.closePreview=function(){document.getElementById('preview-modal').style.display='none';};
    window.togglePreviewMode=function(){const c=document.getElementById('preview-content');c.classList.toggle('vertical-mode');document.getElementById('preview-mode-btn').textContent=c.classList.contains('vertical-mode')?'横読み':'縦読み';};
    window.openPreviewSettings=function(){document.getElementById('preview-settings-modal').style.display='flex';};
    window.savePreviewSettings=function(){window.appSettings.prVerticalChars=document.getElementById('ps-vertical-chars').value;window.appSettings.prLinesPage=document.getElementById('ps-lines-page').value;window.appSettings.prFontScale=document.getElementById('ps-font-scale').value;localStorage.setItem('sb_app_settings',JSON.stringify(window.appSettings));applyPreviewLayout();document.getElementById('preview-settings-modal').style.display='none';};
    function applyPreviewLayout(){const r=document.documentElement.style;const s=18*parseFloat(window.appSettings.prFontScale);r.setProperty('--pr-font-size',s+'px');r.setProperty('--pr-height',(s*parseInt(window.appSettings.prVerticalChars))+'px');}
    
    window.openEditorSettings=function(){document.getElementById('editor-settings-modal').style.display='flex';};
    window.saveEditorSettings=function(){window.appSettings.edLetterSpacing=document.getElementById('es-letter-spacing').value;window.appSettings.edLineHeight=document.getElementById('es-line-height').value;window.appSettings.edWidth=document.getElementById('es-width').value;window.appSettings.edFontSize=document.getElementById('es-font-size').value;localStorage.setItem('sb_app_settings',JSON.stringify(window.appSettings));applySettingsToDOM();document.getElementById('editor-settings-modal').style.display='none';};
    window.loadLocalSettings=function(){const s=localStorage.getItem('sb_app_settings');if(s)try{window.appSettings={...window.appSettings,...JSON.parse(s)};}catch(e){}applySettingsToDOM();};
    function applySettingsToDOM(){const r=document.documentElement.style;r.setProperty('--ed-font-size',window.appSettings.edFontSize+'px');r.setProperty('--ed-line-height',window.appSettings.edLineHeight);r.setProperty('--ed-letter-spacing',window.appSettings.edLetterSpacing+'em');r.setProperty('--ed-width',window.appSettings.edWidth+'%');}

    window.openReplaceModal=function(){document.getElementById('replace-modal').style.display='flex';};
    window.executeReplace=function(){const s=document.getElementById('replace-search-input').value;const r=document.getElementById('replace-target-input').value;if(!s)return;const e=document.getElementById('main-editor');const rg=new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');const c=(e.value.match(rg)||[]).length;if(c===0){alert("なし");return;}e.value=e.value.replace(rg,r);alert(c+"件置換");document.getElementById('replace-modal').style.display='none';updateCharCount();};

    window.openHistoryModal=function(){if(!window.currentWorkId||!window.currentChapterId)return;document.getElementById('history-modal').style.display='flex';loadHistoryList();};
    function loadHistoryList(){const l=document.getElementById('history-list');l.innerHTML='Loading...';db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId).collection('history').orderBy('savedAt','desc').limit(20).get().then(s=>{l.innerHTML='';s.forEach((d,i)=>{const dt=d.data();const date=dt.savedAt?new Date(dt.savedAt.toDate()):new Date();const div=document.createElement('div');div.className='history-item';div.textContent=`${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes()} (${dt.content.length}字)`;div.onclick=()=>showDiff(dt.content,div);l.appendChild(div);if(i===0)div.click();});});}
    function showDiff(old,el){document.querySelectorAll('.history-item').forEach(e=>e.classList.remove('active'));el.classList.add('active');window.currentHistoryData=old;const cur=document.getElementById('main-editor').value;const diff=Diff.diffChars(old,cur);const d=document.getElementById('history-diff-view');d.innerHTML='';diff.forEach(p=>{const s=document.createElement('span');s.className=p.added?'diff-added':p.removed?'diff-removed':'';s.textContent=p.value;d.appendChild(s);});}
    window.restoreHistory=async function(){if(window.currentHistoryData!==null&&confirm("復元？")){document.getElementById('main-editor').value=window.currentHistoryData;document.getElementById('history-modal').style.display='none';await saveCurrentChapter(null,false);}};

    // Common Utils
    window.toggleVerticalMode=function(){const e=document.getElementById('main-editor');const b=document.getElementById('btn-writing-mode');if(e){e.classList.toggle('vertical-mode');b.textContent=e.classList.contains('vertical-mode')?'横':'縦';}};
    window.insertTextAtCursor=function(t){const e=document.getElementById('main-editor');if(!e)return;const s=e.selectionStart;const end=e.selectionEnd;e.value=e.value.substring(0,s)+t+e.value.substring(end);e.selectionStart=e.selectionEnd=s+t.length;e.focus();updateCharCount();trackDailyProgress();};
    window.insertRuby=function(){const p=prompt("親文字");if(!p)return;const r=prompt("ルビ");if(!r)return;insertTextAtCursor(`｜${p}《${r}》`);};
    window.insertDash=function(){insertTextAtCursor("――");};
    window.toggleCharCountMode=function(){window.charCountMode=window.charCountMode==='total'?'pure':'total';updateCharCount();};
    window.updateCharCount=function(){const e=document.getElementById('main-editor');const c=document.getElementById('editor-char-counter');if(!c)return;if(window.charCountMode==='total'){c.textContent=`総: ${e.value.length}`;c.style.color='#fff';}else{c.textContent=`全: ${e.value.replace(/\s/g,'').length}`;c.style.color='#89b4fa';}};
    window.updateCatchCounter=function(el){const r=35-el.value.length;const c=document.getElementById('c-count');if(c){c.textContent=`(残${r})`;c.style.color=r<0?'#f66':'#89b4fa';}};
    window.escapeHtml=function(s){if(!s)return"";return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','-':'&#039;','"':'&quot;'}[m]));};
    window.activateTab=function(id){document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.tab-content').forEach(c=>c.style.display='none');const b=document.querySelector(`.tab-btn[data-tab="${id}"]`);if(b)b.classList.add('active');const c=document.getElementById(id);if(c)c.style.display=id==='tab-editor'?'flex':'block';if(id==='tab-plot')loadPlots();if(id==='tab-char')loadCharacters();if(id==='tab-common-memo')loadMemoListForWorkspace();saveAppState('workspace');};

    // Helper for binding clicks
    const bindClick = (id, handler) => { const el = document.getElementById(id); if(el) el.addEventListener('click', handler); };
    function addDragEvents(item){item.addEventListener('dragstart',function(e){window.dragSrcEl=this;e.dataTransfer.effectAllowed='move';this.classList.add('dragging');});item.addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='move';return false;});item.addEventListener('dragenter',function(){this.classList.add('over');});item.addEventListener('dragleave',function(){this.classList.remove('over');});item.addEventListener('drop',function(e){e.stopPropagation();if(window.dragSrcEl!==this){swapNodes(window.dragSrcEl,this);updateOrderInDB();}return false;});item.addEventListener('dragend',function(){this.classList.remove('dragging');document.querySelectorAll('.chapter-item').forEach(e=>e.classList.remove('over'));});}
    function swapNodes(n1,n2){const p1=n1.parentNode;const p2=n2.parentNode;if(p1!==p2)return;const t=document.createElement("div");p1.insertBefore(t,n1);p2.insertBefore(n1,n2);p1.insertBefore(n2,t);p1.removeChild(t);}
    function handleTouchStart(e){window.touchSrcEl=e.target.closest('.chapter-item');if(window.touchSrcEl){window.touchSrcEl.classList.add('dragging');e.preventDefault();}}
    function handleTouchMove(e){if(!window.touchSrcEl)return;e.preventDefault();const t=e.touches[0];const el=document.elementFromPoint(t.clientX,t.clientY)?.closest('.chapter-item');if(el&&el!==window.touchSrcEl&&el.parentNode===window.touchSrcEl.parentNode)swapNodes(window.touchSrcEl,el);}
    function handleTouchEnd(e){if(window.touchSrcEl){window.touchSrcEl.classList.remove('dragging');updateOrderInDB();window.touchSrcEl=null;}}
    async function updateOrderInDB(){const b=db.batch();document.querySelectorAll('.chapter-item').forEach((e,i)=>{b.update(db.collection('works').doc(window.currentWorkId).collection('chapters').doc(e.getAttribute('data-id')),{order:i+1});});await b.commit();}


    // --- 5. INITIALIZATION (Events & Bindings) ---
    // ここで初めてイベントをバインドします（関数定義後なのでエラーになりません）
    
    // Auth Listener
    auth.onAuthStateChanged(async user => {
        if (user) {
            window.currentUser = user;
            if(loginScreen) loginScreen.style.display = 'none';
            if(mainApp) mainApp.style.display = 'block';
            await loadDailyLog(); loadLocalSettings();
            const lv = localStorage.getItem('sb_last_view');
            if (lv === 'workspace') {
                const lw = localStorage.getItem('sb_last_work');
                const lc = localStorage.getItem('sb_last_chapter');
                const lt = localStorage.getItem('sb_last_tab') || 'tab-editor';
                if (lw) { await openWork(lw, lt); if (lc) setTimeout(()=>document.querySelector(`.chapter-item[data-id="${lc}"]`)?.click(), 500); }
                else switchView('top');
            } else if (lv && views[lv]) switchView(lv); else switchView('top');
        } else {
            window.currentUser = null;
            if(loginScreen) loginScreen.style.display = 'flex';
            if(mainApp) mainApp.style.display = 'none';
        }
    });

    // Static Event Bindings
    bindClick('diary-widget', () => switchView('stats'));
    bindClick('btn-common-memo', () => switchView('memo'));
    bindClick('back-to-top', () => saveCurrentChapter('top'));
    bindClick('back-from-stats', () => switchView('top'));
    bindClick('back-from-memo', () => switchView('top'));
    bindClick('create-new-work-btn', createNewWork);
    bindClick('save-work-info-btn', saveWorkInfo);

    bindClick('preview-close-btn', closePreview);
    bindClick('preview-mode-btn', togglePreviewMode);
    bindClick('preview-setting-btn', openPreviewSettings);
    bindClick('history-close-btn', () => document.getElementById('history-modal').style.display = 'none');
    bindClick('history-restore-btn', restoreHistory);
    
    bindClick('es-cancel', () => document.getElementById('editor-settings-modal').style.display = 'none');
    bindClick('es-save', saveEditorSettings);
    bindClick('ps-cancel', () => document.getElementById('preview-settings-modal').style.display = 'none');
    bindClick('ps-save', savePreviewSettings);
    bindClick('replace-cancel-btn', () => document.getElementById('replace-modal').style.display = 'none');
    bindClick('replace-execute-btn', executeReplace);

    bindClick('add-new-memo-btn', () => openMemoEditor(null, 'memo'));
    bindClick('ws-add-new-memo-btn', () => openMemoEditor(null, 'workspace'));
    bindClick('memo-editor-save', saveMemo);
    bindClick('memo-editor-cancel', () => switchView(window.previousView));
    bindClick('memo-editor-delete', () => { if(window.editingMemoId) deleteMemo(window.editingMemoId, window.previousView); else switchView(window.previousView); });

    bindClick('plot-add-new-btn', () => openPlotEditor(null));
    bindClick('plot-edit-back', () => document.getElementById('plot-edit-view').style.display = 'none');
    bindClick('plot-edit-save', savePlotItem);
    bindClick('plot-edit-delete', deletePlotItem);

    bindClick('char-add-new-btn', () => openCharEditor(null));
    bindClick('char-edit-back', () => document.getElementById('char-edit-view').style.display = 'none');
    bindClick('char-edit-save', saveCharItem);
    bindClick('char-edit-delete', deleteCharItem);

    // Dynamic listeners
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => activateTab(btn.getAttribute('data-tab'))));
    const sEl = document.getElementById('sort-order'); if(sEl) sEl.addEventListener('change', initWorkListener);
    const fEl = document.getElementById('filter-status'); if(fEl) fEl.addEventListener('change', initWorkListener);
    const edEl = document.getElementById('main-editor'); if(edEl) edEl.addEventListener('input', ()=>{updateCharCount();trackDailyProgress();});
    const cEl = document.getElementById('input-catch'); if(cEl) cEl.addEventListener('input', function(){updateCatchCounter(this);});
    
    const iconInput = document.getElementById('char-icon-input');
    if(iconInput) {
        iconInput.addEventListener('change', function(e) {
            const file = e.target.files[0]; if(!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                    const MAX=150; let w=img.width; let h=img.height; if(w>h){if(w>MAX){h*=MAX/w;w=MAX;}}else{if(h>MAX){w*=MAX/h;h=MAX;}}
                    canvas.width=w; canvas.height=h; ctx.drawImage(img,0,0,w,h);
                    const d=canvas.toDataURL('image/jpeg',0.8); const p=document.getElementById('char-icon-preview');
                    p.innerHTML=`<img src="${d}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`; p.setAttribute('data-base64',d);
                }; img.src = ev.target.result;
            }; reader.readAsDataURL(file);
        });
    }

    // Call initEditorToolbar (to bind toolbar events)
    initEditorToolbar();

}); // End DOMContentLoaded