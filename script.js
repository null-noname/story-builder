/* script.js - Part 1 */
document.addEventListener('DOMContentLoaded', () => {
    // --- [Section 1] System & Config ---
    const firebaseConfig = { apiKey: "AIzaSyDc5HZ1PVW7H8-Pe8PBoY_bwCMm0jd5_PU", authDomain: "story-builder-app.firebaseapp.com", projectId: "story-builder-app", storageBucket: "story-builder-app.firebasestorage.app", messagingSenderId: "763153451684", appId: "1:763153451684:web:37a447d4cafb4abe41f431" };
    if (typeof firebase !== 'undefined' && !firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore(); const auth = firebase.auth();
    window.currentUser = null; window.currentWorkId = null; window.currentChapterId = null; window.currentWorkLength = 'long';
    window.editingMemoId = null; window.editingPlotId = null; window.editingCharId = null;
    window.allWorksCache = []; window.unsubscribeWorks = null;
    window.chapterListMode = 'normal'; window.lastContentLength = 0; window.todayAddedCount = 0; window.pendingLogSave = null;
    window.writingChart = null; window.dailyHistory = []; window.graphLabels = [];
    window.tempTimelineData = [];
    window.appSettings = { edLetterSpacing:0, edLineHeight:1.8, edWidth:100, edFontSize:16, prVerticalChars:20, prLinesPage:20, prFontScale:1.0 };
    
    // --- [Section 2] Auth & View Helpers ---
    const views = { top: document.getElementById('top-view'), workspace: document.getElementById('workspace-view'), stats: document.getElementById('stats-view'), memo: document.getElementById('memo-view'), memoEditor: document.getElementById('memo-editor-view') };
    window.escapeHtml = (s) => { if(!s) return ""; return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','-':'&#039;','"':'&quot;'}[m])); };
    window.updateCatchCounter = (el) => { const r = 35 - el.value.length; const c = document.getElementById('c-count'); if(c){ c.textContent = `（残${r}）`; c.style.color = r <= 0 ? '#ff5252' : '#fdd835'; } };
    window.updateCharCount = () => { const e = document.getElementById('main-editor'); const c = document.getElementById('editor-char-counter'); if(!c) return; if(window.charCountMode === 'total'){ c.textContent = `総: ${e.value.length}`; c.style.color = '#fff'; } else { c.textContent = `全: ${e.value.replace(/\s/g,'').length}`; c.style.color = ''; } };
    const loginScreen = document.getElementById('login-screen'); const mainApp = document.getElementById('main-app'); const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(error => { console.error("Popup login failed", error); auth.signInWithRedirect(provider).catch(e => console.error("Login failed", e)); });
        });
    }
    auth.getRedirectResult().catch(e => console.error("Redirect Login Error:", e));
    
    // --- [Section 3] Navigation ---
    window.switchView = function(name) {
        Object.values(views).forEach(el => { if(el) el.style.display = 'none'; });
        if (views[name]) {
            views[name].style.display = 'flex';
            if(name === 'top') { window.loadDailyLog(); window.currentWorkId = null; if(window.allWorksCache.length > 0) window.renderWorkList(); window.loadStats(); }
            if(name === 'memo') window.loadMemoList(); if(name === 'stats') window.loadStats(); if(name === 'workspace') window.loadMemoListForWorkspace();
            if(!(name === 'workspace' && !window.currentWorkId)) { localStorage.setItem('sb_last_view', name); }
        }
    };
    window.saveAppState = function(viewName) { localStorage.setItem('sb_last_view', viewName); if(window.currentWorkId) localStorage.setItem('sb_last_work', window.currentWorkId); if(window.currentChapterId) localStorage.setItem('sb_last_chapter', window.currentChapterId); const activeTab = document.querySelector('.tab-btn.active'); if(activeTab) localStorage.setItem('sb_last_tab', activeTab.getAttribute('data-tab')); };
    window.toggleTabVisibility = function(enable) { const tabs = ['tab-editor', 'tab-plot', 'tab-char', 'tab-common-memo']; tabs.forEach(tid => { const btn = document.querySelector(`.tab-btn[data-tab="${tid}"]`); if(btn) { btn.style.opacity = enable ? "1" : "0.3"; btn.style.pointerEvents = enable ? "auto" : "none"; } }); };
    window.activateTab = function(id) { document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.tab-content').forEach(c=>c.style.display='none'); const b = document.querySelector(`.tab-btn[data-tab="${id}"]`); if(b) b.classList.add('active'); const c = document.getElementById(id); if(c) c.style.display = id === 'tab-editor' ? 'flex' : 'block'; if(id === 'tab-plot') window.loadPlots(); if(id === 'tab-char') window.loadCharacters(); if(id === 'tab-common-memo') window.loadMemoListForWorkspace(); window.saveAppState('workspace'); };
    
    // --- [Section 4] Work Management ---
    window.initWorkListener = function() { if(window.unsubscribeWorks) return; if(!window.currentUser) return; window.unsubscribeWorks = db.collection('works').where('uid','==',window.currentUser.uid).onSnapshot(snap => { window.allWorksCache = []; snap.forEach(doc => { window.allWorksCache.push({ id: doc.id, ...doc.data() }); }); window.renderWorkList(); window.loadStats(); }); };
    window.renderWorkList = function() { const listEl = document.getElementById('work-list'); if(!listEl) return; if (!window.allWorksCache || window.allWorksCache.length === 0) { listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">作品がありません</div>'; return; } const sortKey = document.getElementById('sort-order').value; const filterStatus = document.getElementById('filter-status').value; let works = window.allWorksCache.filter(w => { if(filterStatus === 'all') return true; return w.status === filterStatus; }); works.sort((a, b) => { if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1; const timeA = (sortKey === 'created' ? a.createdAt : a.updatedAt)?.toMillis() || 0; const timeB = (sortKey === 'created' ? b.createdAt : b.updatedAt)?.toMillis() || 0; return timeB - timeA; }); listEl.innerHTML = ''; works.forEach(d => listEl.appendChild(window.createWorkItem(d.id, d))); };
    window.createWorkItem = function(id, data) { const div = document.createElement('div'); div.className = `work-item ${data.isPinned?'pinned':''}`; const fmt = (ts) => { if(!ts) return '-'; const d=new Date(ts.toDate()); const pad=n=>n.toString().padStart(2,'0'); return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }; const badge = data.lengthType === 'short' ? '<span class="work-badge short">短編</span>' : '<span class="work-badge long">長編</span>'; div.innerHTML = `<div class="work-info" onclick="openWork('${id}')"><div class="work-title">${data.isPinned?'<span style="color:#4caf50;margin-right:4px;">★</span>':''}${window.escapeHtml(data.title||'無題')}${badge}</div><div class="work-meta-container"><div class="work-meta-row">作成: ${fmt(data.createdAt)}</div><div class="work-meta-row">更新: ${fmt(data.updatedAt)}</div><div class="work-meta-row" style="font-weight:bold; margin-top:2px;"><span style="color:var(--accent-blue);">${data.totalChars||0}</span> 字</div></div></div><div class="work-actions"><button class="btn-custom btn-card-action btn-d-blue" onclick="openWork('${id}')">編集</button><button class="btn-custom btn-card-action btn-d-red" onclick="deleteWork(event,'${id}')">削除</button><button class="btn-custom btn-card-action" onclick="togglePin(event,'${id}',${!data.isPinned})">${data.isPinned?'★':'☆'}</button></div>`; return div; };
    
    window.openWork = async function(id, initTab='tab-info') {
        window.currentWorkId = id; window.currentChapterId = null; 
        window.editingCharId = null; window.editingPlotId = null; window.editingMemoId = null;
        document.getElementById('plot-items-container').innerHTML = '';
        document.getElementById('char-items-container').innerHTML = '';
        document.getElementById('ws-memo-list-container').innerHTML = '';
        document.getElementById('plot-edit-view').style.display = 'none';
        document.getElementById('char-edit-view').style.display = 'none';
        window.saveAppState('workspace'); const backBtn = document.getElementById('back-to-top'); if(backBtn) backBtn.textContent = "TOPへ戻る"; 
        const workDoc = await db.collection('works').doc(id).get(); if(!workDoc.exists) return; const data=workDoc.data(); 
        window.currentWorkLength = data.lengthType || 'long'; window.fillWorkInfo(data); 
        const lg = document.getElementById('fg-novel-length'); if(lg) lg.style.display='none';
        const infoBtns = document.getElementById('info-export-btns'); if(infoBtns) infoBtns.style.display = 'flex'; 
        const chSnap = await db.collection('works').doc(id).collection('chapters').get(); 
        if(chSnap.empty && data.content) { await db.collection('works').doc(id).collection('chapters').add({title:"第1話",content:data.content,order:1,updatedAt:new Date()}); await db.collection('works').doc(id).update({content:""}); } 
        window.switchView('workspace'); window.activateTab(initTab); window.toggleTabVisibility(true); window.initEditorToolbar(); 
        await window.loadChapters(); 
        if(window.currentWorkLength==='short'){ const first = document.querySelector('.chapter-item'); if(first) first.click(); } 
        else if(localStorage.getItem('sb_last_chapter')){ setTimeout(()=>{const el=document.querySelector(`.chapter-item[data-id="${localStorage.getItem('sb_last_chapter')}"]`);if(el)el.click(); else { const f=document.querySelector('.chapter-item'); if(f)f.click(); }},100); } 
        else { const f=document.querySelector('.chapter-item'); if(f)f.click(); }
    };
    
    window.createNewWork = function() { 
        if (!window.currentUser) return; window.currentWorkId = null; window.currentChapterId = null; window.currentWorkLength='long'; window.fillWorkInfo({}); 
        const lg = document.getElementById('fg-novel-length'); if(lg) lg.style.display='block';
        document.getElementsByName('novel-length').forEach(e => { e.checked = (e.value === 'long'); });
        const infoBtns = document.getElementById('info-export-btns'); if(infoBtns) infoBtns.style.display = 'none'; 
        const backBtn = document.getElementById('back-to-top'); if(backBtn) backBtn.textContent = "TOPへ戻る"; 
        window.switchView('workspace'); window.activateTab('tab-info'); window.toggleTabVisibility(false); window.initEditorToolbar(); 
    };
    window.saveWorkInfo = async function() { 
        if(!window.currentUser) return; 
        const ratings=[]; document.querySelectorAll('input[name="rating"]:checked').forEach(c=>ratings.push(c.value)); 
        const lengthType = document.querySelector('input[name="novel-length"]:checked')?.value || 'long'; 
        const data = { uid: window.currentUser.uid, title: document.getElementById('input-title').value || "無題の物語", description: document.getElementById('input-summary').value, catchphrase: document.getElementById('input-catch').value, genreMain: document.getElementById('input-genre-main').value, genreSub: document.getElementById('input-genre-sub').value, lengthType: lengthType, status: document.querySelector('input[name="novel-status"]:checked')?.value||"in-progress", type: document.querySelector('input[name="novel-type"]:checked')?.value||"original", aiUsage: document.querySelector('input[name="ai-usage"]:checked')?.value||"none", ratings: ratings, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; 
        if (!window.currentWorkId) { 
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); data.totalChars = 0; data.isPinned = false; 
            const docRef = await db.collection('works').add(data); window.currentWorkId = docRef.id; window.currentWorkLength = lengthType; 
            await db.collection('works').doc(docRef.id).collection('chapters').add({title: "第1話", content: "", order: 1, updatedAt: new Date()}); 
            const infoBtns = document.getElementById('info-export-btns'); if(infoBtns) infoBtns.style.display = 'flex'; 
            window.toggleTabVisibility(true); 
            window.initEditorToolbar(); 
            await window.loadChapters();
            window.activateTab('tab-editor');
            window.loadStats();
        } else { 
            await db.collection('works').doc(window.currentWorkId).update(data); 
            window.currentWorkLength = lengthType; 
        } 
        window.toggleTabVisibility(true); 
        const backBtn = document.getElementById('back-to-top'); if(backBtn) backBtn.textContent = "TOPへ戻る"; 
    };
    window.fillWorkInfo = function(data) { document.getElementById('input-title').value = data.title||""; document.getElementById('input-summary').value = data.description||""; document.getElementById('input-catch').value = data.catchphrase||""; document.getElementById('input-genre-main').value = data.genreMain||""; document.getElementById('input-genre-sub').value = data.genreSub||""; const setRadio=(n,v)=>{const r=document.querySelector(`input[name="${n}"][value="${v}"]`);if(r)r.checked=true;}; setRadio("novel-length", data.lengthType||"long"); setRadio("novel-status", data.status||"in-progress"); setRadio("novel-type", data.type||"original"); setRadio("ai-usage", data.aiUsage||"none"); const r=data.ratings||[]; document.querySelectorAll('input[name="rating"]').forEach(c=>c.checked=r.includes(c.value)); window.updateCatchCounter(document.getElementById('input-catch')); };
    window.deleteWork = (e,id)=>{e.stopPropagation();if(confirm("削除しますか？"))db.collection('works').doc(id).delete().then(window.loadStats);};
    window.togglePin = (e,id,s)=>{e.stopPropagation();db.collection('works').doc(id).update({isPinned:s});};

/* script.js - Part 2 */
    // --- [Section 5] Editor (Writing) ---
    window.initEditorToolbar = function() {
        const editorTab = document.getElementById('tab-editor'); if(!editorTab) return;
        editorTab.innerHTML=''; editorTab.classList.remove('mobile-editor-active');
        if (window.currentWorkLength === 'short') editorTab.classList.add('short-mode'); else editorTab.classList.remove('short-mode');
        const sidebar = document.createElement('div'); sidebar.id='chapter-sidebar'; sidebar.className='chapter-sidebar';
        sidebar.innerHTML=`<div class="sidebar-header"><div style="display:flex;align-items:center;flex:1;"><span style="font-weight:bold;">話一覧</span><div style="flex:1;"></div><button class="btn-custom btn-small" id="add-chapter-btn">＋</button><button class="chapter-menu-btn" id="chapter-menu-toggle">≡</button><div id="chapter-menu-overlay" class="chapter-menu-overlay"><div class="chapter-menu-item" onclick="setChapterMode('reorder')">並び替え</div><div class="chapter-menu-item" onclick="saveWorkAsPdf('all')">全話保存 (PDF)</div><div class="chapter-menu-item" onclick="saveWorkAsTxt('current')">単話保存 (TXT)</div><div class="chapter-menu-item" onclick="setChapterMode('delete')">削除モード</div><div class="chapter-menu-item" onclick="setChapterMode('normal')">閉じる</div></div></div></div><div id="chapter-list" class="chapter-list scrollable"></div><div class="sidebar-footer"><small id="total-work-chars">0字</small><button id="sidebar-toggle-close" class="sidebar-toggle-btn">◀</button></div>`;
        editorTab.appendChild(sidebar); 
        const mainArea = document.createElement('div'); mainArea.className='editor-main-area'; const header = document.createElement('div'); header.className='editor-header'; const toolbar = document.createElement('div'); toolbar.className='editor-toolbar';
        const tools=[{i:'📖',f:()=>window.showPreview()},{i:'⚙️',f:()=>window.openEditorSettings()},{s:1},{id:'btn-writing-mode',i:'縦',f:()=>window.toggleVerticalMode()},{i:'置換',f:()=>window.openReplaceModal()},{i:'ﾙﾋﾞ',f:()=>window.openRubyModal()},{i:'―',f:()=>window.insertDash()},{i:'🕒',f:()=>window.openHistoryModal()}];
        tools.forEach(t=>{if(t.s){const s=document.createElement('div');s.style.cssText="width:1px; height:26px; background:#555; margin:0 8px; align-self:center;";toolbar.appendChild(s);}else{const b=document.createElement('button');b.className='toolbar-btn';b.textContent=t.i;b.onclick=t.f;if(t.id)b.id=t.id;toolbar.appendChild(b);}});
        header.innerHTML=`<button id="sidebar-toggle-open" class="sidebar-toggle-open-btn" style="display:none;">▶</button>`; header.appendChild(toolbar); const cnt=document.createElement('div'); cnt.className='char-count-display'; cnt.id='editor-char-counter'; cnt.textContent='0文字'; cnt.onclick=window.toggleCharCountMode; header.appendChild(cnt);
        const titleRow=document.createElement('div'); titleRow.className='chapter-title-row'; titleRow.innerHTML=`<textarea id="chapter-title-input" class="chapter-title-input" placeholder="サブタイトル" rows="1"></textarea>`;
        const edCon=document.createElement('div'); edCon.id='editor-container'; edCon.style.cssText="flex:1;position:relative;border:1px solid #555;background:#111;overflow:hidden;"; edCon.innerHTML=`<textarea id="main-editor" class="main-textarea" style="width:100%;height:100%;border:none;" placeholder="本文..."></textarea>`;
        const footer=document.createElement('div'); footer.className='editor-footer-row'; footer.innerHTML=`<button class="btn-custom btn-small btn-d-red" id="del-ch-btn">削除</button><div style="display:flex;gap:8px;align-items:center;"><button class="toolbar-btn-footer" id="undo-btn">◀️</button><button class="toolbar-btn-footer" id="redo-btn">▶️</button><span style="color:#555;">|</span><button class="toolbar-btn-footer mobile-only" id="back-list-btn">🔙</button><button class="btn-custom btn-small btn-d-green" id="quick-save-btn">保存</button></div>`;
        mainArea.appendChild(header); mainArea.appendChild(titleRow); mainArea.appendChild(edCon); mainArea.appendChild(footer); editorTab.appendChild(mainArea);
        const eid = (id)=>document.getElementById(id); const menuToggle = eid('chapter-menu-toggle'); if(menuToggle) menuToggle.onclick=(e)=>{e.stopPropagation();const o=eid('chapter-menu-overlay');o.style.display=o.style.display==='flex'?'none':'flex';}; document.addEventListener('click',()=>eid('chapter-menu-overlay')?eid('chapter-menu-overlay').style.display='none':null); const addChBtn=eid('add-chapter-btn'); if(addChBtn) addChBtn.onclick=window.addNewChapter; const sbClose=eid('sidebar-toggle-close'); if(sbClose) sbClose.onclick=window.toggleSidebar; const sbOpen=eid('sidebar-toggle-open'); if(sbOpen) sbOpen.onclick=window.toggleSidebar; eid('del-ch-btn').onclick=window.deleteCurrentChapter; eid('quick-save-btn').onclick=()=>window.saveCurrentChapter(null,false); eid('back-list-btn').onclick=window.showMobileChapterList; 
        eid('undo-btn').onclick=(e)=>{e.preventDefault();const el=eid('main-editor');if(el){el.focus();document.execCommand('undo');}}; 
        eid('redo-btn').onclick=(e)=>{e.preventDefault();const el=eid('main-editor');if(el){el.focus();document.execCommand('redo');}};
        const subInput = document.getElementById('chapter-title-input');
        if(subInput) {
            subInput.addEventListener('keydown', (e) => {
                if(e.key === 'Enter') {
                    if(!e.isComposing) { e.preventDefault(); e.target.blur(); }
                }
                e.stopPropagation();
            });
        }
    };
    window.setChapterMode=(m)=>{window.chapterListMode=m;window.loadChapters();}; window.toggleSidebar=()=>{const s=document.getElementById('chapter-sidebar');const b=document.getElementById('sidebar-toggle-open');if(s){s.classList.toggle('collapsed');if(b)b.style.display=s.classList.contains('collapsed')?'block':'none';}}; window.showMobileEditor=()=>{if(window.innerWidth<=600)document.getElementById('tab-editor')?.classList.add('mobile-editor-active');}; window.showMobileChapterList=()=>{document.getElementById('tab-editor')?.classList.remove('mobile-editor-active');};
    window.loadChapters = function() { if(!window.currentWorkId) return Promise.resolve(); const list=document.getElementById('chapter-list'); if(!list) return Promise.resolve(); list.innerHTML='Loading...'; return db.collection('works').doc(window.currentWorkId).collection('chapters').orderBy('order','asc').get().then(snap=>{ list.innerHTML=''; let total=0; if(snap.empty){list.innerHTML='<div style="padding:10px;color:#aaa;">章なし</div>';return;} snap.forEach(doc=>{ const d=doc.data(); const div=document.createElement('div'); div.className='chapter-item'; div.setAttribute('data-id',doc.id); if(window.currentChapterId===doc.id)div.classList.add('active'); total+=(d.content||"").replace(/\s/g,'').length; if(window.chapterListMode==='reorder'){ div.setAttribute('draggable','true'); div.innerHTML=`<span class="chapter-list-title">${window.escapeHtml(d.title)}</span><span class="drag-handle">||</span>`; const h=div.querySelector('.drag-handle'); h.addEventListener('touchstart',handleTouchStart,{passive:false}); h.addEventListener('touchmove',handleTouchMove,{passive:false}); h.addEventListener('touchend',handleTouchEnd); addDragEvents(div); } else if(window.chapterListMode==='delete'){ div.innerHTML=`<span class="chapter-list-title">${window.escapeHtml(d.title)}</span><span class="chapter-delete-icon" onclick="deleteTargetChapter('${doc.id}')">🗑️</span>`; } else { div.innerHTML=`<span class="chapter-list-title">${window.escapeHtml(d.title)}</span><span class="chapter-list-count">(${d.content?.length||0}字)</span>`; div.onclick=()=>selectChapter(doc.id,d); } list.appendChild(div); }); const totalEl = document.getElementById('total-work-chars'); if(totalEl) totalEl.textContent=`合計: ${total}文字`; }); };
    window.selectChapter=(id,d)=>{ window.currentChapterId=id; window.saveAppState('workspace'); document.getElementById('main-editor').value=d.content||""; window.lastContentLength=(d.content||"").length; if(document.getElementById('chapter-title-input'))document.getElementById('chapter-title-input').value=d.title||""; window.updateCharCount(); document.querySelectorAll('.chapter-item').forEach(e=>e.classList.remove('active')); document.querySelector(`.chapter-item[data-id="${id}"]`)?.classList.add('active'); window.showMobileEditor(); };
    window.saveCurrentChapter=async(nv,alert)=>{ if(!window.currentWorkId||!window.currentChapterId){if(nv)window.switchView(nv);return;} const c=document.getElementById('main-editor').value; const t=document.getElementById('chapter-title-input').value||"無題"; if(c.length>20000) return; const ref=db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId); await ref.collection('history').add({content:c,savedAt:firebase.firestore.FieldValue.serverTimestamp()}); await ref.update({title:t,content:c,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); const count = c.replace(/\s/g,'').length; if(window.currentWorkLength==='short'){ await db.collection('works').doc(window.currentWorkId).update({totalChars: count, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); } else { /* Update Total Logic */ const all = await db.collection('works').doc(window.currentWorkId).collection('chapters').get(); let total=0; all.forEach(d=>total+=(d.data().content||"").replace(/\s/g,'').length); await db.collection('works').doc(window.currentWorkId).update({totalChars: total, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); } window.saveDailyLogToFirestore(); window.loadChapters(); if(nv)window.switchView(nv); };
    window.addNewChapter=async()=>{ if(!window.currentWorkId)return; const s=await db.collection('works').doc(window.currentWorkId).collection('chapters').get(); if(s.size>=1000) return; const t = `第${s.size+1}話`; await db.collection('works').doc(window.currentWorkId).collection('chapters').add({title:t,content:"",order:s.size+1,updatedAt:new Date()});window.loadChapters(); };
    window.deleteCurrentChapter=async()=>{if(window.currentChapterId&&confirm("削除しますか？")){await db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId).delete();window.currentChapterId=null;document.getElementById('main-editor').value="";window.showMobileChapterList();window.loadChapters();}}; window.deleteTargetChapter=async(id)=>{if(confirm("削除しますか？")){await db.collection('works').doc(window.currentWorkId).collection('chapters').doc(id).delete();window.loadChapters();}};
    function addDragEvents(i){i.addEventListener('dragstart',function(e){window.dragSrcEl=this;e.dataTransfer.effectAllowed='move';this.classList.add('dragging');});i.addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='move';return false;});i.addEventListener('drop',function(e){e.stopPropagation();if(window.dragSrcEl!==this){swapNodes(window.dragSrcEl,this);updateOrderInDB();}return false;});i.addEventListener('dragend',function(){this.classList.remove('dragging');});} function swapNodes(n1,n2){const p=n1.parentNode;if(p!==n2.parentNode)return;const t=document.createElement("div");p.insertBefore(t,n1);p.insertBefore(n1,n2);p.insertBefore(n2,t);p.removeChild(t);} function handleTouchStart(e){window.touchSrcEl=e.target.closest('.chapter-item');if(window.touchSrcEl){window.touchSrcEl.classList.add('dragging');e.preventDefault();}} function handleTouchMove(e){if(!window.touchSrcEl)return;e.preventDefault();const t=e.touches[0];const el=document.elementFromPoint(t.clientX,t.clientY)?.closest('.chapter-item');if(el&&el!==window.touchSrcEl&&el.parentNode===window.touchSrcEl.parentNode)swapNodes(window.touchSrcEl,el);} function handleTouchEnd(e){if(window.touchSrcEl){window.touchSrcEl.classList.remove('dragging');updateOrderInDB();window.touchSrcEl=null;}} async function updateOrderInDB(){const b=db.batch();document.querySelectorAll('.chapter-item').forEach((e,i)=>{b.update(db.collection('works').doc(window.currentWorkId).collection('chapters').doc(e.getAttribute('data-id')),{order:i+1});});await b.commit();}
    window.saveWorkAsTxt = async (forceMode) => { if (!window.currentWorkId) return; const mode = forceMode || 'all'; let query = db.collection('works').doc(window.currentWorkId).collection('chapters').orderBy('order', 'asc'); const s = await query.get(); let txt = ""; s.forEach(doc => { const d = doc.data(); let target = false; if(mode === 'all') target = true; else if(mode === 'current' && doc.id === window.currentChapterId) target = true; else if(d.order == mode) target = true; if(target) txt += `【${d.title}】\n\n${d.content}\n\n`; }); if(!txt) return; const blob = new Blob([txt], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "novel_export.txt"; a.click(); };
    window.saveWorkAsPdf = async (forceMode) => { if (!window.currentWorkId) return; const mode = forceMode || 'all'; const s = await db.collection('works').doc(window.currentWorkId).collection('chapters').orderBy('order', 'asc').get(); let html = `<div style="padding:20px; font-family:serif; color:#000 !important; background:#fff !important; font-size:18px !important; line-height:1.8 !important;">`; let found = false; s.forEach(doc => { const d = doc.data(); let target = false; if(mode === 'all') target = true; else if(mode === 'current' && doc.id === window.currentChapterId) target = true; else if(d.order == mode) target = true; if(target){ found = true; html += `<h2 style="color:#000;">${window.escapeHtml(d.title)}</h2><div style="white-space:pre-wrap; margin-bottom:20px; color:#000;">${window.escapeHtml(d.content)}</div><hr style="border-top:1px solid #000;">`; } }); html += `</div>`; if(!found) return; const opt = { margin: 10, filename: 'novel_export.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, backgroundColor: "#ffffff" }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }; html2pdf().set(opt).from(html).save(); };
    window.exportData = async (type, fmt) => { if (!window.currentWorkId && type !== 'memo_common') return; let content = "", title = "export"; if (type === 'info') { const t = document.getElementById('input-title').value; const s = document.getElementById('input-summary').value; const c = document.getElementById('input-catch').value; content = `タイトル: ${t}\n\nあらすじ:\n${s}\n\nキャッチコピー:\n${c}`; if(fmt==='pdf') content = content.replace(/\n/g, '<br>'); title = "work_info"; } if (fmt === 'txt') { const blob = new Blob([content], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title}.txt`; a.click(); } else { const html = `<div style="font-family:serif; white-space:pre-wrap; color:#000 !important; background:#fff !important; padding:20px; font-size:18px !important; line-height:1.8 !important;">${content}</div>`; const opt = { margin: 10, filename: `${title}.pdf`, html2canvas: { scale: 2, backgroundColor: "#ffffff" }, jsPDF: { unit: 'mm', format: 'a4' }}; html2pdf().set(opt).from(html).save(); } };
    window.exportSingleItem = async (type, id, fmt) => {
        let content = "", title = "export";
        if(type==='plot'){ const d=await db.collection('works').doc(window.currentWorkId).collection('plots').doc(id).get(); const da=d.data(); if(da.type==='timeline'){ try{const tl=JSON.parse(da.content);content=`■${da.title} (TL)\n`;tl.forEach(r=>content+=`[${r.time}] ${r.text}\n`);}catch(e){content=da.content;} }else{ content=`■${da.title} (メモ)\n${da.content}`; } title=`plot_${da.title}`; }
        else if(type==='char'){ const d=await db.collection('works').doc(window.currentWorkId).collection('characters').doc(id).get(); const da=d.data(); content=`■${da.name}\n${da.role||''}\n${da.memo||''}\n${da.appearance||''}\n${da.personality||''}`; title=`char_${da.name}`; }
        else if(type==='memo'){ const d=await db.collection('memos').doc(id).get(); const da=d.data(); content=`■${da.title}\n${da.content}`; title=`memo_${da.title}`; }
        if (fmt === 'txt') { const blob = new Blob([content], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title}.txt`; a.click(); }
        else { const html = `<div style="font-family:serif; white-space:pre-wrap; color:#000 !important; background:#fff !important; padding:20px; font-size:18px !important; line-height:1.8 !important;">${content.replace(/\n/g,'<br>')}</div>`; const opt = { margin: 10, filename: `${title}.pdf`, html2canvas: { scale: 2, backgroundColor: "#ffffff" }, jsPDF: { unit: 'mm', format: 'a4' }}; html2pdf().set(opt).from(html).save(); }
    };

/* script.js - Part 3 */
    // --- [Section 6] Plots ---
    window.loadPlots=()=>{if(!window.currentWorkId)return;const c=document.getElementById('plot-items-container');c.innerHTML='';db.collection('works').doc(window.currentWorkId).collection('plots').orderBy('updatedAt','desc').get().then(s=>{s.forEach(d=>c.appendChild(createPlotCard(d.id,d.data())));});};
    function createPlotCard(id,d){
        const el=document.createElement('div');el.className='plot-card';
        let body = "";
        if(d.type==='timeline'){
            try {
                const tl = JSON.parse(d.content);
                tl.forEach(r=>{ body += `<div class="tl-view-row"><div class="tl-view-time">${window.escapeHtml(r.time)}</div><div class="tl-view-text">${window.escapeHtml(r.text)}</div></div>`; });
            } catch(e) { body = window.escapeHtml(d.content); }
        } else {
            body = `<div class="plot-card-preview">${window.escapeHtml(d.content)}</div>`;
        }
        el.innerHTML=`<div class="plot-card-header"><span class="plot-card-title">${window.escapeHtml(d.title)}</span><span class="plot-card-type" style="background:#555;color:#fff;">${d.type==='timeline'?'TL':'メモ'}</span><div class="plot-actions"><button class="sort-btn" style="color:#000;">▲</button><button class="sort-btn" style="color:#000;">▼</button><button class="btn-custom btn-small btn-d-blue" style="margin-left:5px;">編集</button></div></div>${body}`;
        el.onclick=(e)=>{ if(!e.target.closest('button')) window.openPlotEditor(id); else if(e.target.textContent==='編集') window.openPlotEditor(id); };
        return el;
    }
    window.openPlotEditor=(id)=>{window.editingPlotId=id;const v=document.getElementById('plot-edit-view');v.style.display='flex';document.getElementById('plot-view-mode').style.display='none';document.getElementById('plot-edit-mode').style.display='block';const del=document.getElementById('plot-delete-btn');const tit=document.getElementById('plot-edit-title');const typ=document.getElementById('plot-edit-type');const con=document.getElementById('plot-edit-content');if(id){del.style.display='block';db.collection('works').doc(window.currentWorkId).collection('plots').doc(id).get().then(s=>{const d=s.data();tit.value=d.title;typ.value=d.type;con.value=d.content;});}else{del.style.display='none';tit.value='';typ.value='memo';con.value='';}};
    window.savePlotItem=()=>{if(!window.currentWorkId)return;const t=document.getElementById('plot-edit-title').value||"無題";const tp=document.getElementById('plot-edit-type').value;const c=document.getElementById('plot-edit-content').value;const d={title:t,type:tp,content:c,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};if(window.editingPlotId)db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId).update(d);else{d.createdAt=firebase.firestore.FieldValue.serverTimestamp();db.collection('works').doc(window.currentWorkId).collection('plots').add(d);}
        db.collection('works').doc(window.currentWorkId).update({updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
        document.getElementById('plot-edit-view').style.display='none';window.loadPlots();
    };
    window.deletePlotItem=()=>{if(window.editingPlotId&&confirm("削除しますか？")){db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId).delete().then(()=>{document.getElementById('plot-edit-view').style.display='none';window.loadPlots();});}};
    
    // --- [Section 7] Characters ---
    window.loadCharacters=()=>{if(!window.currentWorkId)return;const c=document.getElementById('char-items-container');c.innerHTML='';db.collection('works').doc(window.currentWorkId).collection('characters').orderBy('updatedAt','desc').get().then(s=>{s.forEach(d=>c.appendChild(createCharCard(d.id,d.data())));});};
    function createCharCard(id,d){const el=document.createElement('div');el.className='char-card';el.innerHTML=`${d.icon?`<img src="${d.icon}" class="char-icon">`:`<div class="char-icon">👤</div>`}<span class="char-name">${window.escapeHtml(d.name)}</span>`;el.onclick=()=>window.openCharDetail(id);return el;}
    
    window.openCharDetail=async(id)=>{
        window.editingCharId=id;
        const v=document.getElementById('char-edit-view');
        v.style.display='flex';
        document.getElementById('char-view-mode').style.display='block';
        document.getElementById('char-edit-mode').style.display='none';
        
        document.getElementById('char-header-title').textContent = 'キャラ情報';
        document.getElementById('char-mode-edit-btn').style.display='inline-block'; 
        document.getElementById('char-mode-edit-btn').onclick = ()=>window.openCharEditor(id);
        document.getElementById('char-delete-btn').style.display='none'; 
        
        const doc = await db.collection('works').doc(window.currentWorkId).collection('characters').doc(id).get();
        const d = doc.data();
        
        const html = `
            <div class="char-view-header">
                ${d.icon?`<img src="${d.icon}" class="cv-h-icon">`:`<div class="cv-h-icon" style="display:flex;align-items:center;justify-content:center;font-size:40px;">👤</div>`}
                <div class="cv-h-info">
                    <div style="display:flex;gap:15px;justify-content:center;margin-bottom:5px;">
                        <div style="display:flex;flex-direction:column;align-items:center;">
                            <span class="cv-h-ruby" style="margin-bottom:0;">${window.escapeHtml(d.rubylast||"")}</span>
                            <span class="cv-h-name">${window.escapeHtml(d.namelast||"")}</span>
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:center;">
                            <span class="cv-h-ruby" style="margin-bottom:0;">${window.escapeHtml(d.rubyfirst||"")}</span>
                            <span class="cv-h-name">${window.escapeHtml(d.namefirst||"")}</span>
                        </div>
                    </div>
                    <div style="font-size:16px;color:#fff;font-weight:bold;margin-top:5px;">${window.escapeHtml(d.alias||"")}</div>
                </div>
            </div>
            <div class="cv-row"><div class="cv-label">年齢</div><div class="cv-val">${d.age||"-"}歳</div><div class="cv-label">誕生日</div><div class="cv-val">${d.birthm||"-"}月${d.birthd||"-"}日</div></div>
            <div class="cv-row"><div class="cv-label">身長</div><div class="cv-val">${d.height||"-"}cm</div><div class="cv-label">役職</div><div class="cv-val">${window.escapeHtml(d.role||"-")}</div></div>
            <div class="cv-section"><div class="cv-section-title">見た目・性格</div><div class="cv-section-body">${window.escapeHtml(d.appearance||"")}</div></div>
            <div class="cv-section"><div class="cv-section-title">特技・能力</div><div class="cv-section-body">${window.escapeHtml(d.ability||"")}</div></div>
            <div class="cv-section"><div class="cv-section-title">生い立ち・背景</div><div class="cv-section-body">${window.escapeHtml(d.background||"")}</div></div>
            <div class="cv-section"><div class="cv-section-title">その他メモ</div><div class="cv-section-body">${window.escapeHtml(d.memo||"")}</div></div>
        `;
        document.getElementById('char-view-mode').innerHTML = html;
    };

    window.openCharEditor=(id)=>{
        window.editingCharId=id;
        const v=document.getElementById('char-edit-view');
        v.style.display='flex';
        document.getElementById('char-view-mode').style.display='none';
        document.getElementById('char-edit-mode').style.display='block';
        
        document.getElementById('char-header-title').textContent = id ? '編集' : '新規作成';
        document.getElementById('char-mode-edit-btn').style.display='none'; 
        document.getElementById('char-delete-btn').style.display = id ? 'inline-block' : 'none';
        
        const els=['name-last','name-first','ruby-last','ruby-first','alias','age','birth-m','birth-d','height','role','appearance','ability','background','memo'];
        if(id){
            db.collection('works').doc(window.currentWorkId).collection('characters').doc(id).get().then(s=>{
                const d=s.data();
                els.forEach(k=>document.getElementById(`char-${k}`).value=d[k.replace('-','')]||"");
                document.getElementById('char-icon-preview').innerHTML=d.icon?`<img src="${d.icon}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:"👤";
                document.getElementById('char-icon-preview').setAttribute('data-base64',d.icon||"");
            });
        }else{
            els.forEach(k=>document.getElementById(`char-${k}`).value="");
            document.getElementById('char-icon-preview').innerHTML="👤";
            document.getElementById('char-icon-preview').setAttribute('data-base64',"");
        }
    };
    
    window.saveCharItem=async()=>{if(!window.currentWorkId)return;const d={updatedAt:firebase.firestore.FieldValue.serverTimestamp()};const els=['name-last','name-first','ruby-last','ruby-first','alias','age','birth-m','birth-d','height','role','appearance','ability','background','memo'];els.forEach(k=>{const v=document.getElementById(`char-${k}`).value;d[k.replace('-','')]=v;});d.name=(d.namelast||"")+(d.namefirst||"");if(!d.name)d.name="名無し";d.icon=document.getElementById('char-icon-preview').getAttribute('data-base64');
        if(window.editingCharId) await db.collection('works').doc(window.currentWorkId).collection('characters').doc(window.editingCharId).update(d);
        else {
            d.createdAt=firebase.firestore.FieldValue.serverTimestamp();
            const ref = await db.collection('works').doc(window.currentWorkId).collection('characters').add(d);
            window.editingCharId = ref.id;
        }
        await db.collection('works').doc(window.currentWorkId).update({updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
        window.loadCharacters(); 
        window.loadStats();
        window.openCharDetail(window.editingCharId);
    };
    
    window.deleteCharItem=()=>{if(window.editingCharId&&confirm("削除しますか？")){db.collection('works').doc(window.currentWorkId).collection('characters').doc(window.editingCharId).delete().then(()=>{document.getElementById('char-edit-view').style.display='none';window.loadCharacters();window.loadStats();});}};
    
    window.closeCharOverlay=()=>{
        const editMode = document.getElementById('char-edit-mode').style.display !== 'none';
        if (editMode && window.editingCharId) {
            window.openCharDetail(window.editingCharId);
        } else {
            document.getElementById('char-edit-view').style.display='none';
            document.getElementById('char-list-view').style.display='flex';
        }
    };

/* script.js - Part 4 */
    // --- [Section 8] Memos (Common & Workspace) ---
    window.loadMemoList=()=>{if(!window.currentUser)return;const c=document.getElementById('memo-list-container');if(!c)return;c.innerHTML='';db.collection('memos').where('uid','==',window.currentUser.uid).get().then(s=>{let m=[];s.forEach(d=>m.push({id:d.id,...d.data()}));m.sort((a,b)=>(b.updatedAt?.toMillis()||0)-(a.updatedAt?.toMillis()||0));m.forEach(d=>c.appendChild(createMemoCard(d.id,d,'memo')));});}; window.loadMemoListForWorkspace=()=>{if(!window.currentUser)return;const c=document.getElementById('ws-memo-list-container');if(!c)return;c.innerHTML='';db.collection('memos').where('uid','==',window.currentUser.uid).get().then(s=>{let m=[];s.forEach(d=>m.push({id:d.id,...d.data()}));m.sort((a,b)=>(b.updatedAt?.toMillis()||0)-(a.updatedAt?.toMillis()||0));m.forEach(d=>c.appendChild(createMemoCard(d.id,d,'workspace')));});}; function createMemoCard(id,data,view){const d=document.createElement('div');d.className='memo-card';d.innerHTML=`<div class="memo-header"><span class="memo-title">${window.escapeHtml(data.title)}</span><div><button class="memo-btn btn-d-blue" onclick="openMemoEditor('${id}','${view}')">編集</button><button class="memo-btn btn-d-red" onclick="deleteMemo('${id}','${view}')">削除</button></div></div><div class="memo-divider"></div><div class="memo-text">${window.escapeHtml(data.content)}</div>`;return d;} 
    window.openMemoEditor=(id,v)=>{window.editingMemoId=id;window.previousView=v;const delBtn=document.getElementById('memo-editor-delete-right');if(id){delBtn.style.display='block';db.collection('memos').doc(id).get().then(d=>{const da=d.data();document.getElementById('memo-editor-title').value=da.title;document.getElementById('memo-editor-content').value=da.content;switchView('memoEditor');});}else{document.getElementById('memo-editor-title').value="";document.getElementById('memo-editor-content').value="";delBtn.style.display='none';switchView('memoEditor');}};
    window.saveMemo=()=>{const t=document.getElementById('memo-editor-title').value||"新規メモ";const c=document.getElementById('memo-editor-content').value;const d={uid:window.currentUser.uid,title:t,content:c,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};const dest=window.previousView||'top';if(window.editingMemoId)db.collection('memos').doc(window.editingMemoId).update(d).then(()=>switchView(dest));else{d.createdAt=firebase.firestore.FieldValue.serverTimestamp();db.collection('memos').add(d).then(()=>switchView(dest));}};
    window.deleteMemo=(id,v)=>{const dest=v||'top';if(!id){window.switchView(dest);return;}if(confirm("削除しますか？"))db.collection('memos').doc(id).delete().then(()=>{if(dest==='memo')loadMemoList();else loadMemoListForWorkspace();window.switchView(dest);});};
    
    // --- [Stats & Initialization] ---
    window.loadStats=async function(){
        if(!window.currentUser) return;
        const wSnap = await db.collection('works').where('uid','==',window.currentUser.uid).get();
        document.getElementById('stat-works').innerHTML=`${wSnap.size}<span class="unit">作品</span>`;
        let charCount = 0;
        const charReads = [];
        wSnap.forEach(doc => { charReads.push(db.collection('works').doc(doc.id).collection('characters').get()); });
        const charSnaps = await Promise.all(charReads);
        charSnaps.forEach(s => charCount += s.size);
        document.getElementById('stat-chars').innerHTML=`${charCount}<span class="unit">体</span>`;
        window.loadDailyLog();
    };
    
    window.loadDailyLog = async function() { 
        if(!window.currentUser) return; 
        const range = parseInt(document.getElementById('stat-range').value || "7"); 
        const now = new Date(); 
        window.graphLabels = []; 
        window.dailyHistory = []; 
        const reads = []; 
        for(let i=range-1; i>=0; i--) { 
            const d = new Date(now); 
            d.setDate(now.getDate() - i); 
            const key = d.toISOString().slice(0,10); 
            window.graphLabels.push((d.getMonth()+1)+'/'+d.getDate()); 
            reads.push(db.collection('users').doc(window.currentUser.uid).collection('stats').doc(key).get()); 
        } 
        const snaps = await Promise.all(reads); 
        snaps.forEach(s => window.dailyHistory.push(s.exists ? s.data().count : 0)); 
        const serverToday = window.dailyHistory[range-1] || 0;
        if (window.todayAddedCount > serverToday) { window.dailyHistory[range-1] = window.todayAddedCount; } else { window.todayAddedCount = serverToday; }
        document.getElementById('widget-today-count').innerHTML = window.todayAddedCount + '<span class="unit">字</span>'; 
        document.getElementById('stat-week').innerHTML = window.dailyHistory.reduce((a,b)=>a+b,0) + '<span class="unit">字</span>'; 
        const ctx = document.getElementById('writingChart'); 
        if(ctx){ 
            if(window.writingChart) window.writingChart.destroy(); 
            window.writingChart=new Chart(ctx,{type:'bar',data:{labels:window.graphLabels,datasets:[{data:window.dailyHistory,backgroundColor:'#33691e',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#444'}},x:{grid:{display:false}}}}}); 
        } 
    };
    
    window.saveDailyLogToFirestore = function() { if(!window.currentUser) return; const key = new Date().toISOString().slice(0,10); db.collection('users').doc(window.currentUser.uid).collection('stats').doc(key).set({count: window.todayAddedCount, date: key}, {merge:true}); };
    window.trackDailyProgress=function(targetVal){const e=document.getElementById('main-editor');const val = targetVal || (e ? e.value : "");const diff=val.length-window.lastContentLength;if(diff>0){if(window.dailyHistory.length===0) window.dailyHistory.push(0); window.todayAddedCount+=diff;window.dailyHistory[window.dailyHistory.length-1]=window.todayAddedCount;document.getElementById('widget-today-count').innerHTML=`${window.todayAddedCount}<span class="unit">字</span>`;if(window.writingChart){window.writingChart.data.datasets[0].data=window.dailyHistory;window.writingChart.update();}if(window.pendingLogSave)clearTimeout(window.pendingLogSave);window.pendingLogSave=setTimeout(saveDailyLogToFirestore,3000);}window.lastContentLength=val.length;};
    
    window.showPreview=function(){const e=document.getElementById('main-editor');const c=document.getElementById('preview-content');document.getElementById('preview-modal').style.display='flex';
        c.classList.remove('vertical-mode'); 
        document.getElementById('preview-mode-btn').textContent='縦読み';
        c.innerHTML=window.escapeHtml(e.value).replace(/\n/g,'<br>').replace(/[\|｜]([^《]+?)《(.+?)》/g,'<ruby>$1<rt>$2</rt></ruby>');applyPreviewLayout();
    }; 
    window.closePreview=()=>document.getElementById('preview-modal').style.display='none'; 
    window.togglePreviewMode=()=>{const c=document.getElementById('preview-content');c.classList.toggle('vertical-mode');document.getElementById('preview-mode-btn').textContent=c.classList.contains('vertical-mode')?'横読み':'縦読み';}; 
    window.openPreviewSettings=()=>document.getElementById('preview-settings-modal').style.display='flex'; window.savePreviewSettings=()=>{window.appSettings.prVerticalChars=document.getElementById('ps-vertical-chars').value;window.appSettings.prLinesPage=document.getElementById('ps-lines-page').value;window.appSettings.prFontScale=document.getElementById('ps-font-scale').value;localStorage.setItem('sb_app_settings',JSON.stringify(window.appSettings));applyPreviewLayout();document.getElementById('preview-settings-modal').style.display='none';}; function applyPreviewLayout(){const r=document.documentElement.style;const s=18*parseFloat(window.appSettings.prFontScale);r.setProperty('--pr-font-size',s+'px');r.setProperty('--pr-height',(s*parseInt(window.appSettings.prVerticalChars))+'px');} 
    window.openEditorSettings=()=>document.getElementById('editor-settings-modal').style.display='flex'; window.saveEditorSettings=()=>{window.appSettings.edLetterSpacing=document.getElementById('es-letter-spacing').value;window.appSettings.edLineHeight=document.getElementById('es-line-height').value;window.appSettings.edWidth=document.getElementById('es-width').value;window.appSettings.edFontSize=document.getElementById('es-font-size').value;localStorage.setItem('sb_app_settings',JSON.stringify(window.appSettings));applySettingsToDOM();document.getElementById('editor-settings-modal').style.display='none';}; window.loadLocalSettings=()=>{const s=localStorage.getItem('sb_app_settings');if(s)try{window.appSettings={...window.appSettings,...JSON.parse(s)};}catch(e){}applySettingsToDOM();const dBtn=document.getElementById('preview-mode-btn');if(dBtn)dBtn.textContent='縦読み';}; function applySettingsToDOM(){const r=document.documentElement.style;r.setProperty('--ed-font-size',window.appSettings.edFontSize+'px');r.setProperty('--ed-line-height',window.appSettings.edLineHeight);r.setProperty('--ed-letter-spacing',window.appSettings.edLetterSpacing+'em');r.setProperty('--ed-width',window.appSettings.edWidth+'%');} 
    window.openReplaceModal=()=>document.getElementById('replace-modal').style.display='flex'; window.executeReplace=()=>{const s=document.getElementById('replace-search-input').value;const r=document.getElementById('replace-target-input').value;if(!s)return;const e=document.getElementById('main-editor');const rg=new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');const c=(e.value.match(rg)||[]).length;if(c===0){alert("なし");return;}e.value=e.value.replace(rg,r);document.getElementById('replace-search-input').value='';document.getElementById('replace-target-input').value='';document.getElementById('replace-modal').style.display='none';window.updateCharCount();};
    window.openRubyModal=()=>document.getElementById('ruby-modal').style.display='flex'; window.executeRuby=()=>{const p=document.getElementById('ruby-parent-input').value;const r=document.getElementById('ruby-text-input').value;if(p&&r){window.insertTextAtCursor(`｜${p}《${r}》`);document.getElementById('ruby-parent-input').value='';document.getElementById('ruby-text-input').value='';document.getElementById('ruby-modal').style.display='none';}else{alert("未入力");}};
    
    // [FIX] History Logic
    window.openHistoryModal=function(){if(!window.currentWorkId||!window.currentChapterId){alert("作品または章が開かれていません");return;}document.getElementById('history-modal').style.display='flex';loadHistoryList();}; 
    function loadHistoryList(){const l=document.getElementById('history-list');l.innerHTML='Loading...';db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId).collection('history').orderBy('savedAt','desc').limit(20).get().then(s=>{l.innerHTML='';s.forEach((d,i)=>{const dt=d.data();const date=dt.savedAt?new Date(dt.savedAt.toDate()):new Date();const div=document.createElement('div');div.className='history-item';div.textContent=`${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes()} (${dt.content.length}字)`;div.onclick=()=>showDiff(dt.content,div);l.appendChild(div);if(i===0)div.click();});});} 
    function showDiff(old,el){document.querySelectorAll('.history-item').forEach(e=>e.classList.remove('active'));el.classList.add('active');window.currentHistoryData=old;const cur=document.getElementById('main-editor').value;const diff=Diff.diffLines(old,cur);const d=document.getElementById('history-diff-view');d.innerHTML='';diff.forEach(p=>{const s=document.createElement('span');s.className=p.added?'diff-added':p.removed?'diff-removed':'';s.textContent=p.value;d.appendChild(s);});} 
    window.restoreHistory=async()=>{if(window.currentHistoryData!==null&&confirm("復元しますか？")){document.getElementById('main-editor').value=window.currentHistoryData;document.getElementById('history-modal').style.display='none';await saveCurrentChapter(null,false);}};
    
    window.toggleVerticalMode=()=>{const e=document.getElementById('main-editor');const b=document.getElementById('btn-writing-mode');if(e){e.classList.toggle('vertical-mode');b.textContent=e.classList.contains('vertical-mode')?'横読み':'縦読み';}}; 
    window.insertTextAtCursor=(t)=>{const e=document.getElementById('main-editor');if(!e)return;const s=e.selectionStart;const end=e.selectionEnd;e.value=e.value.substring(0,s)+t+e.value.substring(end);e.selectionStart=e.selectionEnd=s+t.length;e.focus();window.updateCharCount();window.trackDailyProgress(e.value);}; window.insertDash=()=>window.insertTextAtCursor("――"); 
    function bindClick(id,h){const e=document.getElementById(id);if(e)e.addEventListener('click',h);}
    bindClick('diary-widget',()=>window.switchView('stats')); bindClick('btn-common-memo',()=>window.switchView('memo')); bindClick('back-to-top',()=>window.switchView('top')); bindClick('back-from-stats',()=>window.switchView('top')); bindClick('back-from-memo',()=>window.switchView('top')); bindClick('create-new-work-btn',window.createNewWork); bindClick('save-work-info-btn',window.saveWorkInfo); bindClick('preview-close-btn',window.closePreview); bindClick('preview-mode-btn',window.togglePreviewMode); bindClick('preview-setting-btn',window.openPreviewSettings); bindClick('history-close-btn',()=>document.getElementById('history-modal').style.display='none'); bindClick('history-restore-btn',window.restoreHistory); bindClick('es-cancel',()=>document.getElementById('editor-settings-modal').style.display='none'); bindClick('es-save',window.saveEditorSettings); bindClick('ps-cancel',()=>document.getElementById('preview-settings-modal').style.display='none'); bindClick('ps-save',window.savePreviewSettings); bindClick('replace-cancel-btn',()=>document.getElementById('replace-modal').style.display='none'); bindClick('replace-execute-btn',window.executeReplace); bindClick('ruby-cancel-btn',()=>document.getElementById('ruby-modal').style.display='none'); bindClick('ruby-execute-btn',window.executeRuby); bindClick('add-new-memo-btn',()=>window.openMemoEditor(null,'memo')); bindClick('ws-add-new-memo-btn',()=>window.openMemoEditor(null,'workspace')); bindClick('memo-editor-save',window.saveMemo); bindClick('memo-editor-back-left',()=>window.switchView(window.previousView||'top')); bindClick('memo-editor-delete-right',()=>window.deleteMemo(window.editingMemoId,window.previousView)); bindClick('plot-add-new-btn',()=>window.openPlotEditor(null)); bindClick('char-add-new-btn',()=>window.openCharEditor(null)); bindClick('char-edit-back',window.closeCharOverlay); bindClick('char-edit-save',window.saveCharItem); bindClick('char-delete-btn', window.deleteCharItem); bindClick('memo-editor-export-txt', ()=>window.exportSingleItem('memo', window.editingMemoId, 'txt')); bindClick('char-view-txt-btn', ()=>window.exportSingleItem('char', window.editingCharId, 'txt')); bindClick('plot-txt-btn', ()=>window.exportSingleItem('plot', window.editingPlotId, 'txt')); bindClick('plot-edit-back', ()=>document.getElementById('plot-edit-view').style.display='none'); bindClick('plot-edit-save', window.savePlotItem); bindClick('plot-delete-btn', window.deletePlotItem);
    document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>window.activateTab(btn.getAttribute('data-tab')))); const sEl=document.getElementById('sort-order');if(sEl)sEl.addEventListener('change',window.renderWorkList); const fEl=document.getElementById('filter-status');if(fEl)fEl.addEventListener('change',window.renderWorkList); const cEl=document.getElementById('input-catch');if(cEl)cEl.addEventListener('input',function(){window.updateCatchCounter(this);}); const rangeEl=document.getElementById('stat-range'); if(rangeEl)rangeEl.addEventListener('change',window.loadDailyLog);
    const iconInput=document.getElementById('char-icon-input'); if(iconInput)iconInput.addEventListener('change',function(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');const x=c.getContext('2d');const M=150;let w=i.width,h=i.height;if(w>h){if(w>M){h*=M/w;w=M;}}else{if(h>M){w*=M/h;h=M;}}c.width=w;c.height=h;x.drawImage(i,0,0,w,h);const d=c.toDataURL('image/jpeg',0.8);const p=document.getElementById('char-icon-preview');p.innerHTML=`<img src="${d}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;p.setAttribute('data-base64',d);};i.src=ev.target.result;};r.readAsDataURL(f);});
    window.initEditorToolbar();
    document.body.addEventListener('input', (e) => {
        if(e.target && e.target.id === 'main-editor') {
            window.updateCharCount();
            window.trackDailyProgress(e.target.value);
        }
    });
    auth.onAuthStateChanged(async user => {
        if (user) {
            window.currentUser = user; if(loginScreen) loginScreen.style.display='none'; if(mainApp) mainApp.style.display='block'; window.initWorkListener(); await window.loadDailyLog(); window.loadLocalSettings();
            const lv = localStorage.getItem('sb_last_view'); const lw = localStorage.getItem('sb_last_work');
            if (lv === 'workspace' && lw && lw !== "null") { try { await window.openWork(lw, localStorage.getItem('sb_last_tab') || 'tab-editor'); } catch(e) { window.switchView('top'); } } else if (lv && views[lv] && lv !== 'workspace') { window.switchView(lv); } else { window.switchView('top'); }
        } else { window.currentUser = null; if(loginScreen) loginScreen.style.display='flex'; if(mainApp) mainApp.style.display='none'; }
    });
});