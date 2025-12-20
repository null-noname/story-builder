/* Story Builder V1.50 script.js - Part 1/3 */
document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Config & State ---
    const firebaseConfig = {
        apiKey: "AIzaSyDc5HZ1PVW7H8-Pe8PBoY_bwCMm0jd5_PU",
        authDomain: "story-builder-app.firebaseapp.com",
        projectId: "story-builder-app",
        storageBucket: "story-builder-app.firebasestorage.app",
        messagingSenderId: "763153451684",
        appId: "1:763153451684:web:37a447d4cafb4abe41f431"
    };
    if (typeof firebase !== 'undefined' && !firebase.apps.length) firebase.initializeApp(firebaseConfig);
    
    const db = firebase.firestore();
    const auth = firebase.auth();

    window.currentUser = null;
    window.currentWorkId = null;
    window.currentChapterId = null;
    window.editingMemoId = null;
    window.editingPlotId = null;
    window.editingCharId = null;
    
    // データ保持用
    window.allWorksCache = []; 
    window.unsubscribeWorks = null;
    
    window.chapterListMode = 'normal';
    window.lastContentLength = 0;
    window.todayAddedCount = 0;
    window.pendingLogSave = null;
    window.writingChart = null;
    window.dailyHistory = [0,0,0,0,0,0,0];
    window.dragSrcEl = null;
    window.currentHistoryData = null;
    window.tempTimelineData = [];

    window.appSettings = { edLetterSpacing:0, edLineHeight:1.8, edWidth:100, edFontSize:16, prVerticalChars:20, prLinesPage:20, prFontScale:1.0 };

    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const loginBtn = document.getElementById('google-login-btn');
    const views = {
        top: document.getElementById('top-view'),
        workspace: document.getElementById('workspace-view'),
        stats: document.getElementById('stats-view'),
        memo: document.getElementById('memo-view'),
        memoEditor: document.getElementById('memo-editor-view')
    };

    if (loginBtn) loginBtn.addEventListener('click', () => {
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => alert("ログインエラー: "+e.message));
    });

    // --- 2. Auth & View ---
    auth.onAuthStateChanged(async user => {
        if (user) {
            window.currentUser = user;
            if(loginScreen) loginScreen.style.display='none';
            if(mainApp) mainApp.style.display='block';
            await loadDailyLog(); 
            loadLocalSettings();
            
            // リロード時の復帰処理
            const lv = localStorage.getItem('sb_last_view');
            if (lv === 'workspace') {
                const lw = localStorage.getItem('sb_last_work');
                if (lw && lw !== "null") {
                    await openWork(lw, localStorage.getItem('sb_last_tab') || 'tab-editor');
                    const lc = localStorage.getItem('sb_last_chapter');
                    if (lc) setTimeout(()=>document.querySelector(`.chapter-item[data-id="${lc}"]`)?.click(), 500);
                } else {
                    switchView('top');
                }
            } else if (lv && views[lv]) {
                switchView(lv);
            } else {
                switchView('top');
            }
        } else {
            window.currentUser = null;
            if(loginScreen) loginScreen.style.display='flex';
            if(mainApp) mainApp.style.display='none';
        }
    });

    window.switchView = function(name) {
        Object.values(views).forEach(el => { if(el) el.style.display = 'none'; });
        if (views[name]) {
            views[name].style.display = 'flex';
            
            // TOP画面に入るときだけリスナーを起動、出るときは解除
            if(name === 'top') {
                initWorkListener();
                loadDailyLog();
                window.currentWorkId = null; // TOPに戻ったら選択解除
            } else {
                if(window.unsubscribeWorks) { window.unsubscribeWorks(); window.unsubscribeWorks = null; }
            }

            if(name === 'memo') loadMemoList();
            if(name === 'stats') loadStats();
            if(name === 'workspace') loadMemoListForWorkspace();
            
            // 新規作成中の「戻る」でゴミデータを残さないため、WorkIdがない場合はTOPとみなして保存
            if(name === 'workspace' && !window.currentWorkId) {
                // 保存しない（ステートに残さない）
            } else {
                localStorage.setItem('sb_last_view', name);
            }
        }
    };

    function saveAppState(viewName) {
        localStorage.setItem('sb_last_view', viewName);
        if(window.currentWorkId) localStorage.setItem('sb_last_work', window.currentWorkId);
        if(window.currentChapterId) localStorage.setItem('sb_last_chapter', window.currentChapterId);
        const activeTab = document.querySelector('.tab-btn.active');
        if(activeTab) localStorage.setItem('sb_last_tab', activeTab.getAttribute('data-tab'));
    }

    // --- 3. Work Management (New Logic) ---
    
    // ★重要: 作品リストの監視とソート
    function initWorkListener() {
        if(window.unsubscribeWorks) window.unsubscribeWorks(); // 重複防止
        if(!window.currentUser) return;

        window.unsubscribeWorks = db.collection('works').where('uid','==',window.currentUser.uid)
            .onSnapshot(snap => {
                window.allWorksCache = [];
                snap.forEach(doc => {
                    window.allWorksCache.push({ id: doc.id, ...doc.data() });
                });
                renderWorkList(); // データが届いたら描画
            });
    }

    // ★重要: メモリ上のデータをソートして表示（これで確実に並びます）
    window.renderWorkList = function() {
        const listEl = document.getElementById('work-list'); 
        if(!listEl || !window.allWorksCache) return;
        
        const sortKey = document.getElementById('sort-order').value; // 'created' or 'updated'
        const filterStatus = document.getElementById('filter-status').value;

        // フィルタリング
        let works = window.allWorksCache.filter(w => {
            if(filterStatus === 'all') return true;
            return w.status === filterStatus;
        });

        // ソート（ピン留め最優先 -> 指定キーの降順）
        works.sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1; // true(ピン)が先
            
            const timeA = (sortKey === 'created' ? a.createdAt : a.updatedAt)?.toMillis() || 0;
            const timeB = (sortKey === 'created' ? b.createdAt : b.updatedAt)?.toMillis() || 0;
            
            return timeB - timeA; // 新しい順
        });

        listEl.innerHTML = '';
        works.forEach(d => listEl.appendChild(createWorkItem(d.id, d)));
    }

    function createWorkItem(id, data) {
        const div = document.createElement('div');
        div.className = `work-item ${data.isPinned?'pinned':''}`;
        const fmt = (ts) => {
            if(!ts) return '-'; const d=new Date(ts.toDate());
            const pad=n=>n.toString().padStart(2,'0');
            return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        div.innerHTML = `
            <div class="work-info" onclick="openWork('${id}')">
                <div class="work-title">${data.isPinned?'<span style="color:#4caf50;margin-right:4px;">★</span>':''}${escapeHtml(data.title||'無題')}</div>
                <div class="work-meta-container">
                    <div class="work-meta-row">作成: ${fmt(data.createdAt)}</div>
                    <div class="work-meta-row">更新: ${fmt(data.updatedAt)}</div>
                    <div class="work-meta-row" style="color:#89b4fa; font-weight:bold; margin-top:2px;">${data.totalChars||0} 字</div>
                </div>
            </div>
            <div class="work-actions">
                <button class="btn-custom btn-card-action" onclick="openWork('${id}')">編集</button>
                <button class="btn-custom btn-card-action btn-card-delete" onclick="deleteWork(event,'${id}')">削除</button>
                <button class="btn-custom btn-card-action" onclick="togglePin(event,'${id}',${!data.isPinned})">${data.isPinned?'★':'☆'}</button>
            </div>`;
        return div;
    }

    // 既存作品を開く
    window.openWork = async function(id, initTab='tab-info') {
        window.currentWorkId = id; 
        window.currentChapterId = null; 
        saveAppState('workspace');
        
        // ボタン表記を「戻る」に固定
        const backBtn = document.getElementById('back-to-top');
        if(backBtn) backBtn.textContent = "戻る";

        const workDoc = await db.collection('works').doc(id).get();
        if(!workDoc.exists) return;
        
        fillWorkInfo(workDoc.data());
        
        // 古いデータ形式のマイグレーション（contentがあれば第1話にする）
        const chSnap = await db.collection('works').doc(id).collection('chapters').get();
        if(chSnap.empty && workDoc.data().content) {
            await db.collection('works').doc(id).collection('chapters').add({title:"第1話",content:workDoc.data().content,order:1,updatedAt:new Date()});
            await db.collection('works').doc(id).update({content:""});
        }
        
        await loadChapters();
        switchView('workspace');
        activateTab(initTab);
        toggleTabVisibility(true); // タブを表示
    };

    // ★重要: 「新規作成」ボタンの挙動変更
    // DBには保存せず、画面だけ初期化して開く
    window.createNewWork = function() {
        if (!window.currentUser) return;
        window.currentWorkId = null; // IDなし＝未保存状態
        window.currentChapterId = null;
        
        // 入力フォームを空にする
        fillWorkInfo({});
        
        // ボタン表記
        const backBtn = document.getElementById('back-to-top');
        if(backBtn) backBtn.textContent = "中止して戻る";

        switchView('workspace');
        activateTab('tab-info'); // 作品情報タブを強制
        toggleTabVisibility(false); // 保存するまで他のタブ（執筆など）は隠す
    };

    // ★重要: 「作品情報を保存」ボタンの挙動変更
    window.saveWorkInfo = async function() {
        if(!window.currentUser) return;
        
        const ratings=[]; 
        document.querySelectorAll('input[name="rating"]:checked').forEach(c=>ratings.push(c.value));
        
        const data = {
            uid: window.currentUser.uid,
            title: document.getElementById('input-title').value || "無題の物語",
            description: document.getElementById('input-summary').value,
            catchphrase: document.getElementById('input-catch').value,
            genreMain: document.getElementById('input-genre-main').value,
            genreSub: document.getElementById('input-genre-sub').value,
            status: document.querySelector('input[name="novel-status"]:checked')?.value||"in-progress",
            type: document.querySelector('input[name="novel-type"]:checked')?.value||"original",
            aiUsage: document.querySelector('input[name="ai-usage"]:checked')?.value||"none",
            ratings: ratings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!window.currentWorkId) {
            // ★新規作成: ここで初めてDBに保存
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            data.totalChars = 0;
            data.isPinned = false;
            
            const docRef = await db.collection('works').add(data);
            window.currentWorkId = docRef.id;
            
            // 自動で第1話を作成
            await db.collection('works').doc(docRef.id).collection('chapters').add({
                title: "第1話", content: "", order: 1, updatedAt: new Date()
            });
            
            alert("作品を作成しました！\n執筆画面へ移動します。");
        } else {
            // 更新
            await db.collection('works').doc(window.currentWorkId).update(data);
            alert("作品情報を更新しました。");
        }
        
        // IDが確定したので全タブ有効化し、エディタへ移動
        toggleTabVisibility(true);
        const backBtn = document.getElementById('back-to-top');
        if(backBtn) backBtn.textContent = "戻る";
        
        await loadChapters();
        activateTab('tab-editor');
    };

    // 未保存時は他のタブを押せないようにする制御
    function toggleTabVisibility(enable) {
        const tabs = ['tab-editor', 'tab-plot', 'tab-char', 'tab-common-memo'];
        tabs.forEach(tid => {
            const btn = document.querySelector(`.tab-btn[data-tab="${tid}"]`);
            if(btn) {
                btn.style.opacity = enable ? "1" : "0.3";
                btn.style.pointerEvents = enable ? "auto" : "none";
            }
        });
    }

    function fillWorkInfo(data) {
        document.getElementById('input-title').value = data.title||"";
        document.getElementById('input-summary').value = data.description||"";
        document.getElementById('input-catch').value = data.catchphrase||"";
        document.getElementById('input-genre-main').value = data.genreMain||"";
        document.getElementById('input-genre-sub').value = data.genreSub||"";
        const setRadio=(n,v)=>{const r=document.querySelector(`input[name="${n}"][value="${v}"]`);if(r)r.checked=true;};
        setRadio("novel-status", data.status||"in-progress"); setRadio("novel-type", data.type||"original"); setRadio("ai-usage", data.aiUsage||"none");
        const r=data.ratings||[]; document.querySelectorAll('input[name="rating"]').forEach(c=>c.checked=r.includes(c.value));
        updateCatchCounter(document.getElementById('input-catch'));
    }

    window.deleteWork = (e,id)=>{e.stopPropagation();if(confirm("削除しますか？"))db.collection('works').doc(id).delete();};
    window.togglePin = (e,id,s)=>{e.stopPropagation();db.collection('works').doc(id).update({isPinned:s});};

/* Story Builder V1.50 script.js - Part 2/3 */

    // --- Editor & Chapter ---
    window.initEditorToolbar = function() {
        const editorTab = document.getElementById('tab-editor'); if(!editorTab) return;
        editorTab.innerHTML=''; editorTab.style.flexDirection='row'; editorTab.classList.remove('mobile-editor-active');
        
        const sidebar = document.createElement('div'); sidebar.id='chapter-sidebar'; sidebar.className='chapter-sidebar';
        sidebar.innerHTML=`<div class="sidebar-header"><div style="display:flex;align-items:center;flex:1;"><span style="font-weight:bold;">話一覧</span><div style="flex:1;"></div><button class="btn-custom btn-small" id="add-chapter-btn">＋</button><button class="chapter-menu-btn" id="chapter-menu-toggle">≡</button><div id="chapter-menu-overlay" class="chapter-menu-overlay"><div class="chapter-menu-item" onclick="setChapterMode('reorder')">並び替え</div><div class="chapter-menu-item" onclick="setChapterMode('delete')">削除モード</div><div class="chapter-menu-item" onclick="setChapterMode('normal')">閉じる</div></div></div></div><div id="chapter-list" class="chapter-list scrollable"></div><div class="sidebar-footer"><small id="total-work-chars">0字</small><button id="sidebar-toggle-close" class="sidebar-toggle-btn">◀</button></div>`;
        editorTab.appendChild(sidebar);

        const mainArea = document.createElement('div'); mainArea.className='editor-main-area';
        const header = document.createElement('div'); header.className='editor-header';
        const toolbar = document.createElement('div'); toolbar.className='editor-toolbar';
        
        const tools=[
            {i:'📖',f:()=>window.showPreview()},
            {i:'⚙️',f:()=>window.openEditorSettings()},
            {s:1},
            {id:'btn-writing-mode',i:'縦',f:()=>window.toggleVerticalMode()},
            {i:'置換',f:()=>window.openReplaceModal()},
            {i:'ﾙﾋﾞ',f:()=>window.insertRuby()},
            {i:'―',f:()=>window.insertDash()},
            {i:'🕒',f:()=>window.openHistoryModal()}
        ];
        
        tools.forEach(t=>{if(t.s){const s=document.createElement('span');s.textContent='|';s.style.cssText="color:#555;margin:0 5px;";toolbar.appendChild(s);}else{const b=document.createElement('button');b.className='toolbar-btn';b.textContent=t.i;b.onclick=t.f;if(t.id)b.id=t.id;toolbar.appendChild(b);}});
        
        header.innerHTML=`<button id="sidebar-toggle-open" class="sidebar-toggle-open-btn" style="display:none;">▶</button>`;
        header.appendChild(toolbar);
        const cnt=document.createElement('div'); cnt.className='char-count-display'; cnt.id='editor-char-counter'; cnt.textContent='0文字'; cnt.onclick=toggleCharCountMode; header.appendChild(cnt);

        const titleRow=document.createElement('div'); titleRow.className='chapter-title-row'; titleRow.innerHTML=`<textarea id="chapter-title-input" class="chapter-title-input" placeholder="サブタイトル" rows="1"></textarea>`;
        const edCon=document.createElement('div'); edCon.id='editor-container'; edCon.style.cssText="flex:1;position:relative;border:1px solid #555;background:#111;overflow:hidden;"; edCon.innerHTML=`<textarea id="main-editor" class="main-textarea" style="width:100%;height:100%;border:none;" placeholder="本文..."></textarea>`;
        const footer=document.createElement('div'); footer.className='editor-footer-row';
        footer.innerHTML=`<button class="btn-custom btn-small btn-red" id="del-ch-btn">削除</button><div style="display:flex;gap:8px;align-items:center;"><button class="toolbar-btn-footer" id="undo-btn">◀️</button><button class="toolbar-btn-footer" id="redo-btn">▶️</button><span style="color:#555;">|</span><button class="toolbar-btn-footer mobile-only" id="back-list-btn">🔙</button><button class="btn-custom btn-small" id="quick-save-btn">保存</button></div>`;

        mainArea.appendChild(header); mainArea.appendChild(titleRow); mainArea.appendChild(edCon); mainArea.appendChild(footer);
        editorTab.appendChild(mainArea);

        const eid = (id)=>document.getElementById(id);
        eid('chapter-menu-toggle').onclick=(e)=>{e.stopPropagation();const o=eid('chapter-menu-overlay');o.style.display=o.style.display==='flex'?'none':'flex';};
        document.addEventListener('click',()=>eid('chapter-menu-overlay').style.display='none');
        eid('add-chapter-btn').onclick=addNewChapter;
        eid('sidebar-toggle-close').onclick=toggleSidebar;
        eid('sidebar-toggle-open').onclick=toggleSidebar;
        eid('del-ch-btn').onclick=deleteCurrentChapter;
        eid('quick-save-btn').onclick=()=>saveCurrentChapter(null,false);
        eid('back-list-btn').onclick=showMobileChapterList;
        eid('undo-btn').onclick=()=>{const e=eid('main-editor');if(e){e.focus();document.execCommand('undo');}};
        eid('redo-btn').onclick=()=>{const e=eid('main-editor');if(e){e.focus();document.execCommand('redo');}};
    };

    window.setChapterMode=(m)=>{window.chapterListMode=m;loadChapters();};
    window.toggleSidebar=()=>{const s=document.getElementById('chapter-sidebar');const b=document.getElementById('sidebar-toggle-open');if(s){s.classList.toggle('collapsed');if(b)b.style.display=s.classList.contains('collapsed')?'block':'none';}};
    window.showMobileEditor=()=>{if(window.innerWidth<=600)document.getElementById('tab-editor')?.classList.add('mobile-editor-active');};
    window.showMobileChapterList=()=>{document.getElementById('tab-editor')?.classList.remove('mobile-editor-active');};

    window.loadChapters = function() {
        if(!window.currentWorkId) return Promise.resolve();
        const list=document.getElementById('chapter-list'); list.innerHTML='Loading...';
        return db.collection('works').doc(window.currentWorkId).collection('chapters').orderBy('order','asc').get().then(snap=>{
            list.innerHTML=''; let total=0;
            if(snap.empty){list.innerHTML='<div style="padding:10px;color:#aaa;">章なし</div>';return;}
            snap.forEach(doc=>{
                const d=doc.data(); const div=document.createElement('div'); div.className='chapter-item'; div.setAttribute('data-id',doc.id);
                if(window.currentChapterId===doc.id)div.classList.add('active');
                total+=(d.content||"").replace(/\s/g,'').length;
                if(window.chapterListMode==='reorder'){
                    div.setAttribute('draggable','true'); div.innerHTML=`<span class="chapter-list-title">${escapeHtml(d.title)}</span><span class="drag-handle">||</span>`;
                    const h=div.querySelector('.drag-handle'); h.addEventListener('touchstart',handleTouchStart,{passive:false}); h.addEventListener('touchmove',handleTouchMove,{passive:false}); h.addEventListener('touchend',handleTouchEnd);
                    addDragEvents(div);
                } else if(window.chapterListMode==='delete'){
                    div.innerHTML=`<span class="chapter-list-title">${escapeHtml(d.title)}</span><span class="chapter-delete-icon" onclick="deleteTargetChapter('${doc.id}')">🗑️</span>`;
                } else {
                    div.innerHTML=`<span class="chapter-list-title">${escapeHtml(d.title)}</span><span class="chapter-list-count">(${d.content?.length||0}字)</span>`;
                    div.onclick=()=>selectChapter(doc.id,d);
                }
                list.appendChild(div);
            });
            document.getElementById('total-work-chars').textContent=`合計: ${total}文字`;
        });
    };

    window.selectChapter=(id,d)=>{
        window.currentChapterId=id; saveAppState('workspace');
        document.getElementById('main-editor').value=d.content||""; window.lastContentLength=(d.content||"").length;
        if(document.getElementById('chapter-title-input'))document.getElementById('chapter-title-input').value=d.title||"";
        updateCharCount();
        document.querySelectorAll('.chapter-item').forEach(e=>e.classList.remove('active'));
        document.querySelector(`.chapter-item[data-id="${id}"]`)?.classList.add('active');
        showMobileEditor();
    };
    window.saveCurrentChapter=async(nv,alert)=>{
        if(!window.currentWorkId||!window.currentChapterId){if(nv)switchView(nv);return;}
        const c=document.getElementById('main-editor').value; const t=document.getElementById('chapter-title-input').value||"無題";
        if(c.length>20000){alert("2万字超");return;}
        const ref=db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId);
        await ref.collection('history').add({content:c,savedAt:firebase.firestore.FieldValue.serverTimestamp()});
        await ref.update({title:t,content:c,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        saveDailyLogToFirestore(); loadChapters();
        if(nv)switchView(nv); else if(alert!==false)alert("保存しました");
    };
    window.addNewChapter=async()=>{
        if(!window.currentWorkId)return; const s=await db.collection('works').doc(window.currentWorkId).collection('chapters').get();
        if(s.size>=1000){alert("上限");return;}
        const t=prompt("章タイトル",`第${s.size+1}話`);
        if(t){await db.collection('works').doc(window.currentWorkId).collection('chapters').add({title:t,content:"",order:s.size+1,updatedAt:new Date()});loadChapters();}
    };
    window.deleteCurrentChapter=async()=>{if(window.currentChapterId&&confirm("削除？")){await db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId).delete();window.currentChapterId=null;document.getElementById('main-editor').value="";showMobileChapterList();loadChapters();}};
    window.deleteTargetChapter=async(id)=>{if(confirm("削除？")){await db.collection('works').doc(window.currentWorkId).collection('chapters').doc(id).delete();loadChapters();}};

    function addDragEvents(i){i.addEventListener('dragstart',function(e){window.dragSrcEl=this;e.dataTransfer.effectAllowed='move';this.classList.add('dragging');});i.addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='move';return false;});i.addEventListener('drop',function(e){e.stopPropagation();if(window.dragSrcEl!==this){swapNodes(window.dragSrcEl,this);updateOrderInDB();}return false;});i.addEventListener('dragend',function(){this.classList.remove('dragging');});}
    function swapNodes(n1,n2){const p=n1.parentNode;if(p!==n2.parentNode)return;const t=document.createElement("div");p.insertBefore(t,n1);p.insertBefore(n1,n2);p.insertBefore(n2,t);p.removeChild(t);}
    function handleTouchStart(e){window.touchSrcEl=e.target.closest('.chapter-item');if(window.touchSrcEl){window.touchSrcEl.classList.add('dragging');e.preventDefault();}}
    function handleTouchMove(e){if(!window.touchSrcEl)return;e.preventDefault();const t=e.touches[0];const el=document.elementFromPoint(t.clientX,t.clientY)?.closest('.chapter-item');if(el&&el!==window.touchSrcEl&&el.parentNode===window.touchSrcEl.parentNode)swapNodes(window.touchSrcEl,el);}
    function handleTouchEnd(e){if(window.touchSrcEl){window.touchSrcEl.classList.remove('dragging');updateOrderInDB();window.touchSrcEl=null;}}
    async function updateOrderInDB(){const b=db.batch();document.querySelectorAll('.chapter-item').forEach((e,i)=>{b.update(db.collection('works').doc(window.currentWorkId).collection('chapters').doc(e.getAttribute('data-id')),{order:i+1});});await b.commit();}

/* Story Builder V1.50 script.js - Part 3/3 */

    // --- Plot ---
    window.loadPlots = function() {
        const c=document.getElementById('plot-items-container'); if(!c||!window.currentWorkId)return;
        db.collection('works').doc(window.currentWorkId).collection('plots').orderBy('order','asc').get().then(snap=>{
            c.innerHTML=''; if(snap.empty){c.innerHTML='<div style="padding:20px;text-align:center;color:#555;">プロットなし</div>';return;}
            snap.forEach(doc=>{
                const d=doc.data(); const div=document.createElement('div');
                const isTL = d.type === 'timeline';
                div.className = 'plot-card';
                let previewHtml = "";
                if(!isTL) {
                    previewHtml = `<div class="plot-card-preview" style="margin-top:5px;font-size:13px;color:#aaa;white-space:pre-wrap;max-height:60px;overflow:hidden;">${escapeHtml(d.content)}</div>`;
                }
                const label = isTL ? 'TL' : 'メモ';
                const col = isTL ? '#ffb74d' : '#89b4fa';

                div.innerHTML = `
                    <div class="plot-card-header" style="display:flex;justify-content:space-between;align-items:center;">
                        <div class="plot-card-title" style="font-weight:bold;color:${isTL?'#ddd':'#89b4fa'};">
                            ${escapeHtml(d.title||'無題')} 
                            <span style="font-size:10px;color:${col};border:1px solid ${col};padding:1px 4px;border-radius:3px;margin-left:5px;">${label}</span>
                        </div>
                        <div class="plot-actions" style="display:flex;gap:5px;">
                            <div class="sort-btn" onclick="event.stopPropagation();movePlot('${doc.id}',-1)">▲</div>
                            <div class="sort-btn" onclick="event.stopPropagation();movePlot('${doc.id}',1)">▼</div>
                        </div>
                    </div>
                    ${previewHtml}
                `;
                div.onclick=()=>openPlotEditor(doc.id); c.appendChild(div);
            });
        });
    };

    window.openPlotEditor = function(id) {
        window.editingPlotId=id; 
        const t=document.getElementById('plot-edit-title'); const c=document.getElementById('plot-edit-content'); const ty=document.getElementById('plot-edit-type');
        
        const header = document.querySelector('#plot-edit-view .edit-overlay-header');
        header.innerHTML = `<button id="plot-edit-back" class="btn-custom btn-small">← 戻る</button><span style="font-weight:bold;">プロット編集</span><div style="width:50px;"></div>`;
        document.getElementById('plot-edit-back').onclick = () => document.getElementById('plot-edit-view').style.display='none';

        const body = document.querySelector('#plot-edit-view .edit-overlay-body');
        let tlArea = document.getElementById('plot-timeline-editor');
        if(!tlArea) {
            tlArea = document.createElement('div'); tlArea.id='plot-timeline-editor'; tlArea.style.display = 'none';
            c.parentElement.insertBefore(tlArea, c.nextSibling);
        }

        let footerBtnArea = document.getElementById('plot-footer-btns');
        if(!footerBtnArea) {
            footerBtnArea = document.createElement('div'); footerBtnArea.id = 'plot-footer-btns';
            footerBtnArea.style.cssText = "display:flex; gap:10px; margin-top:20px; padding-top:10px; border-top:1px solid #444;";
            body.appendChild(footerBtnArea);
        }
        footerBtnArea.innerHTML = `<button id="plot-footer-delete" class="btn-red" style="flex:1;">削除</button><button id="plot-footer-save" class="btn-green" style="flex:1;">保存</button>`;
        document.getElementById('plot-footer-save').onclick = savePlotItem;
        document.getElementById('plot-footer-delete').onclick = deletePlotItem;

        const oldDel = document.getElementById('plot-edit-delete'); if(oldDel) oldDel.style.display='none';
        ty.onchange = () => togglePlotEditorMode(ty.value);

        if(id){
            db.collection('works').doc(window.currentWorkId).collection('plots').doc(id).get().then(d=>{
                if(d.exists){
                    const data=d.data(); t.value=data.title; ty.value=data.type||'memo';
                    if(ty.value === 'timeline') {
                        try { window.tempTimelineData = JSON.parse(data.content||"[]"); } catch(e){ window.tempTimelineData = [{time:"", text:data.content}]; }
                        renderTimelineEditor();
                    } else { c.value=data.content; }
                    togglePlotEditorMode(ty.value);
                }
            });
        } else {
            t.value=""; c.value=""; ty.value='memo'; window.tempTimelineData = [];
            togglePlotEditorMode('memo');
        }
        document.getElementById('plot-edit-view').style.display='flex';
    };

    window.togglePlotEditorMode = function(mode) {
        const c = document.getElementById('plot-edit-content');
        const tl = document.getElementById('plot-timeline-editor');
        if(mode === 'timeline') {
            c.style.display = 'none'; tl.style.display = 'block';
            if(window.tempTimelineData.length === 0) renderTimelineEditor(); 
        } else {
            c.style.display = 'block'; tl.style.display = 'none';
        }
    };

    window.renderTimelineEditor = function() {
        const el = document.getElementById('plot-timeline-editor');
        if(window.tempTimelineData.length === 0) window.tempTimelineData.push({time:"", text:""});
        
        el.innerHTML = window.tempTimelineData.map((row, i) => {
            let [datePart, timePart] = (row.time || "").split(' ');
            if(!timePart) { timePart = ""; }

            return `
            <div style="display:flex; align-items:stretch; margin-bottom:5px; background:#000; border:1px solid #444; border-radius:4px; overflow:hidden; min-height:60px;">
                <div style="width:70px; border-right:1px solid #444; display:flex; flex-direction:column; background:#151515;">
                    <input type="text" class="tl-date-input" data-idx="${i}" value="${escapeHtml(datePart||'')}" 
                        style="background:transparent; border:none; border-bottom:1px solid #333; color:#fff; text-align:center; width:100%; font-size:12px; height:50%; outline:none; padding:0;">
                    <input type="text" class="tl-time-input" data-idx="${i}" value="${escapeHtml(timePart||'')}" 
                        style="background:transparent; border:none; color:#ddd; text-align:center; width:100%; font-size:12px; height:50%; outline:none; padding:0;">
                </div>
                <div style="flex:1; display:flex; align-items:center;">
                    <textarea class="tl-text-input" data-idx="${i}" rows="1"
                        style="width:100%; background:transparent; border:none; color:#fff; resize:none; padding:10px; line-height:1.5; overflow:hidden; min-height:50px;">${escapeHtml(row.text)}</textarea>
                </div>
                <div style="width:32px; display:flex; flex-direction:column; background:#222; border-left:1px solid #444;">
                    <button onclick="moveTLRow(${i},-1)" style="flex:1; border:none; background:transparent; color:#fff; cursor:pointer; font-size:10px; border-bottom:1px solid #333;">▲</button>
                    <button onclick="moveTLRow(${i},1)" style="flex:1; border:none; background:transparent; color:#fff; cursor:pointer; font-size:10px; border-bottom:1px solid #333;">▼</button>
                    <button onclick="deleteTLRow(${i})" style="flex:1; border:none; background:#500; color:#fff; cursor:pointer; font-size:14px;">×</button>
                </div>
            </div>`;
        }).join('') + `<button onclick="addTLRow()" class="btn-custom btn-full" style="margin-top:10px;">＋ 行を追加</button>`;

        const updateTimeData = (idx) => {
            const d = el.querySelector(`.tl-date-input[data-idx="${idx}"]`).value;
            const t = el.querySelector(`.tl-time-input[data-idx="${idx}"]`).value;
            window.tempTimelineData[idx].time = (d + " " + t).trim();
        };

        el.querySelectorAll('.tl-date-input').forEach(e => e.oninput = (ev) => updateTimeData(ev.target.dataset.idx));
        el.querySelectorAll('.tl-time-input').forEach(e => e.oninput = (ev) => updateTimeData(ev.target.dataset.idx));
        el.querySelectorAll('.tl-text-input').forEach(e => {
            autoResize(e);
            e.oninput = (ev) => {
                autoResize(ev.target);
                window.tempTimelineData[ev.target.dataset.idx].text = ev.target.value;
            };
        });
    };

    function autoResize(textarea) { textarea.style.height='auto'; textarea.style.height=textarea.scrollHeight+'px'; }
    window.addTLRow = () => { window.tempTimelineData.push({time:"", text:""}); renderTimelineEditor(); };
    window.deleteTLRow = (i) => { window.tempTimelineData.splice(i, 1); renderTimelineEditor(); };
    window.moveTLRow = (i, dir) => {
        if(i+dir < 0 || i+dir >= window.tempTimelineData.length) return;
        [window.tempTimelineData[i], window.tempTimelineData[i+dir]] = [window.tempTimelineData[i+dir], window.tempTimelineData[i]];
        renderTimelineEditor();
    };

    window.savePlotItem = async function() {
        const t=document.getElementById('plot-edit-title').value; const ty=document.getElementById('plot-edit-type').value;
        let finalContent = "";
        if(ty === 'timeline') { finalContent = JSON.stringify(window.tempTimelineData); } 
        else { finalContent = document.getElementById('plot-edit-content').value; }
        const d={title:t, content:finalContent, type:ty, updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
        if(window.editingPlotId) await db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId).update(d);
        else { const s=await db.collection('works').doc(window.currentWorkId).collection('plots').get(); d.order=s.size+1; d.createdAt=firebase.firestore.FieldValue.serverTimestamp(); await db.collection('works').doc(window.currentWorkId).collection('plots').add(d); }
        document.getElementById('plot-edit-view').style.display='none'; loadPlots();
    };
    window.deletePlotItem = async function() { if(window.editingPlotId && confirm("削除しますか？")){ await db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId).delete(); document.getElementById('plot-edit-view').style.display='none'; loadPlots(); } };
    window.movePlot = async function(id, dir) { await moveItem('plots', id, dir); loadPlots(); };

    // --- Stats & Others ---
    window.loadDailyLog = async function() {
        if(!window.currentUser) return;
        let p=[], l=[]; 
        for(let i=6;i>=0;i--){
            const d=new Date(); d.setDate(d.getDate()-i);
            const y=d.getFullYear(); const m=(d.getMonth()+1).toString().padStart(2,'0'); const da=d.getDate().toString().padStart(2,'0');
            const s=`${y}-${m}-${da}`;
            l.push(`${d.getMonth()+1}/${d.getDate()}`);
            p.push(db.collection('daily_logs').doc(`${window.currentUser.uid}_${s}`).get());
        }
        const s=await Promise.all(p); let w=0; window.dailyHistory=s.map(d=>{const v=d.exists?(d.data().count||0):0;w+=v;return v;});
        window.todayAddedCount=window.dailyHistory[6]; window.graphLabels=l;
        document.getElementById('widget-today-count').innerHTML=`${window.todayAddedCount}<span class="unit">字</span>`; document.getElementById('widget-weekly-count').innerHTML=`${w}<span class="unit">字</span>`;
    };
    window.saveDailyLogToFirestore = function() {
        if(!window.currentUser)return; 
        const d=new Date(); const y=d.getFullYear(); const m=(d.getMonth()+1).toString().padStart(2,'0'); const da=d.getDate().toString().padStart(2,'0');
        const s=`${y}-${m}-${da}`; 
        db.collection('daily_logs').doc(`${window.currentUser.uid}_${s}`).set({uid:window.currentUser.uid,date:s,count:window.todayAddedCount,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    };

    window.loadCharacters=function(){const c=document.getElementById('char-items-container');if(!c||!window.currentWorkId)return;db.collection('works').doc(window.currentWorkId).collection('characters').orderBy('order','asc').get().then(snap=>{c.innerHTML='';if(snap.empty){c.innerHTML='<div style="padding:20px;text-align:center;color:#555;">キャラなし</div>';return;}snap.forEach(doc=>{const d=doc.data();const card=document.createElement('div');card.className='char-card';const img=d.iconBase64?`<img src="${d.iconBase64}" class="char-icon">`:'<div class="char-icon">👤</div>';card.innerHTML=`<div class="char-sort-controls"><button class="char-sort-btn" onclick="event.stopPropagation();moveChar('${doc.id}',-1)">▲</button><button class="char-sort-btn" onclick="event.stopPropagation();moveChar('${doc.id}',1)">▼</button></div>${img}<div class="char-name">${escapeHtml(d.name)}</div><div class="char-role">${escapeHtml(d.role)}</div>`;card.onclick=()=>openCharEditor(doc.id);c.appendChild(card);});document.getElementById('stat-chars').textContent=snap.size+"体";});};
    window.openCharEditor=function(id){window.editingCharId=id;const fields=['name','ruby','alias','age','birth','role','height','appearance','personality','ability','background','memo'];const p=document.getElementById('char-icon-preview');const hb=document.querySelector('#char-edit-view #char-edit-back');if(hb)hb.textContent="← 戻る";if(id){db.collection('works').doc(window.currentWorkId).collection('characters').doc(id).get().then(doc=>{if(doc.exists){const d=doc.data();fields.forEach(f=>{const e=document.getElementById('char-'+f);if(e)e.value=d[f]||"";});if(d.iconBase64){p.innerHTML=`<img src="${d.iconBase64}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;p.setAttribute('data-base64',d.iconBase64);}else{p.innerHTML='👤';p.removeAttribute('data-base64');}}});}else{fields.forEach(f=>{const e=document.getElementById('char-'+f);if(e)e.value="";});p.innerHTML='👤';p.removeAttribute('data-base64');}document.getElementById('char-edit-view').style.display='flex';};
    window.saveCharItem=async function(){const getData=id=>document.getElementById('char-'+id)?.value||"";const ib=document.getElementById('char-icon-preview').getAttribute('data-base64')||"";const d={name:getData('name'),ruby:getData('ruby'),alias:getData('alias'),age:getData('age'),birth:getData('birth'),role:getData('role'),height:getData('height'),appearance:getData('appearance'),personality:getData('personality'),ability:getData('ability'),background:getData('background'),memo:getData('memo'),iconBase64:ib,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};if(window.editingCharId)await db.collection('works').doc(window.currentWorkId).collection('characters').doc(window.editingCharId).update(d);else{const s=await db.collection('works').doc(window.currentWorkId).collection('characters').get();d.order=s.size+1;d.createdAt=firebase.firestore.FieldValue.serverTimestamp();await db.collection('works').doc(window.currentWorkId).collection('characters').add(d);}document.getElementById('char-edit-view').style.display='none';loadCharacters();};
    window.deleteCharItem=async function(){if(window.editingCharId&&confirm("削除？")){await db.collection('works').doc(window.currentWorkId).collection('characters').doc(window.editingCharId).delete();document.getElementById('char-edit-view').style.display='none';loadCharacters();}};
    window.moveChar=async function(id,dir){await moveItem('characters',id,dir);loadCharacters();};
    async function moveItem(col,id,dir){const snap=await db.collection('works').doc(window.currentWorkId).collection(col).orderBy('order','asc').get();let items=[];snap.forEach(d=>items.push({id:d.id,...d.data()}));const idx=items.findIndex(i=>i.id===id);if(idx===-1)return;const tIdx=idx+dir;if(tIdx<0||tIdx>=items.length)return;[items[idx],items[tIdx]]=[items[tIdx],items[idx]];const batch=db.batch();items.forEach((it,i)=>{batch.update(db.collection('works').doc(window.currentWorkId).collection(col).doc(it.id),{order:i+1});});await batch.commit();}

    window.loadMemoList=()=>{if(!window.currentUser)return;const c=document.getElementById('memo-list-container');if(!c)return;c.innerHTML='';db.collection('memos').where('uid','==',window.currentUser.uid).get().then(s=>{let m=[];s.forEach(d=>m.push({id:d.id,...d.data()}));m.sort((a,b)=>(b.updatedAt?.toMillis()||0)-(a.updatedAt?.toMillis()||0));m.forEach(d=>c.appendChild(createMemoCard(d.id,d,'memo')));});};
    window.loadMemoListForWorkspace=()=>{if(!window.currentUser)return;const c=document.getElementById('ws-memo-list-container');if(!c)return;c.innerHTML='';db.collection('memos').where('uid','==',window.currentUser.uid).get().then(s=>{let m=[];s.forEach(d=>m.push({id:d.id,...d.data()}));m.sort((a,b)=>(b.updatedAt?.toMillis()||0)-(a.updatedAt?.toMillis()||0));m.forEach(d=>c.appendChild(createMemoCard(d.id,d,'workspace')));});};
    function createMemoCard(id,data,view){const d=document.createElement('div');d.className='memo-card';d.innerHTML=`<div class="memo-header"><span class="memo-title">${escapeHtml(data.title)}</span><div><button class="memo-btn" onclick="openMemoEditor('${id}','${view}')">編集</button><button class="memo-btn memo-btn-delete" onclick="deleteMemo('${id}','${view}')">削除</button></div></div><div class="memo-divider"></div><div class="memo-text">${escapeHtml(data.content)}</div>`;return d;}
    window.openMemoEditor=(id,v)=>{window.editingMemoId=id;window.previousView=v;if(id){db.collection('memos').doc(id).get().then(d=>{const da=d.data();document.getElementById('memo-editor-title').value=da.title;document.getElementById('memo-editor-content').value=da.content;switchView('memoEditor');});}else{document.getElementById('memo-editor-title').value="";document.getElementById('memo-editor-content').value="";switchView('memoEditor');}};
    window.saveMemo=()=>{const t=document.getElementById('memo-editor-title').value||"新規メモ";const c=document.getElementById('memo-editor-content').value;const d={uid:window.currentUser.uid,title:t,content:c,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};if(window.editingMemoId)db.collection('memos').doc(window.editingMemoId).update(d).then(()=>switchView(window.previousView));else{d.createdAt=firebase.firestore.FieldValue.serverTimestamp();db.collection('memos').add(d).then(()=>switchView(window.previousView));}};
    window.deleteMemo=(id,v)=>{if(confirm("削除？"))db.collection('memos').doc(id).delete().then(()=>(v==='memo'?loadMemoList:loadMemoListForWorkspace)());};

    window.loadStats=function(){db.collection('works').where('uid','==',window.currentUser.uid).get().then(s=>document.getElementById('stat-works').innerHTML=`${s.size}<span class="unit">作品</span>`);loadDailyLog();const ctx=document.getElementById('writingChart').getContext('2d');if(window.writingChart)window.writingChart.destroy();window.writingChart=new Chart(ctx,{type:'bar',data:{labels:window.graphLabels,datasets:[{data:window.dailyHistory,backgroundColor:'#89b4fa',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#444'}},x:{grid:{display:false}}}}});};
    window.trackDailyProgress=function(){const e=document.getElementById('main-editor');if(!e)return;const diff=e.value.length-window.lastContentLength;if(diff>0){window.todayAddedCount+=diff;window.dailyHistory[6]=window.todayAddedCount;document.getElementById('widget-today-count').innerHTML=`${window.todayAddedCount}<span class="unit">字</span>`;if(window.writingChart){window.writingChart.data.datasets[0].data=window.dailyHistory;window.writingChart.update();}if(window.pendingLogSave)clearTimeout(window.pendingLogSave);window.pendingLogSave=setTimeout(saveDailyLogToFirestore,3000);}window.lastContentLength=e.value.length;};

    window.showPreview=function(){const e=document.getElementById('main-editor');const c=document.getElementById('preview-content');document.getElementById('preview-modal').style.display='flex';c.innerHTML=escapeHtml(e.value).replace(/\n/g,'<br>').replace(/[\|｜]([^《]+?)《(.+?)》/g,'<ruby>$1<rt>$2</rt></ruby>');applyPreviewLayout();};
    window.closePreview=()=>document.getElementById('preview-modal').style.display='none';
    window.togglePreviewMode=()=>{const c=document.getElementById('preview-content');c.classList.toggle('vertical-mode');document.getElementById('preview-mode-btn').textContent=c.classList.contains('vertical-mode')?'横読み':'縦読み';};
    window.openPreviewSettings=()=>document.getElementById('preview-settings-modal').style.display='flex';
    window.savePreviewSettings=()=>{window.appSettings.prVerticalChars=document.getElementById('ps-vertical-chars').value;window.appSettings.prLinesPage=document.getElementById('ps-lines-page').value;window.appSettings.prFontScale=document.getElementById('ps-font-scale').value;localStorage.setItem('sb_app_settings',JSON.stringify(window.appSettings));applyPreviewLayout();document.getElementById('preview-settings-modal').style.display='none';};
    function applyPreviewLayout(){const r=document.documentElement.style;const s=18*parseFloat(window.appSettings.prFontScale);r.setProperty('--pr-font-size',s+'px');r.setProperty('--pr-height',(s*parseInt(window.appSettings.prVerticalChars))+'px');}
    window.openEditorSettings=()=>document.getElementById('editor-settings-modal').style.display='flex';
    window.saveEditorSettings=()=>{window.appSettings.edLetterSpacing=document.getElementById('es-letter-spacing').value;window.appSettings.edLineHeight=document.getElementById('es-line-height').value;window.appSettings.edWidth=document.getElementById('es-width').value;window.appSettings.edFontSize=document.getElementById('es-font-size').value;localStorage.setItem('sb_app_settings',JSON.stringify(window.appSettings));applySettingsToDOM();document.getElementById('editor-settings-modal').style.display='none';};
    window.loadLocalSettings=()=>{const s=localStorage.getItem('sb_app_settings');if(s)try{window.appSettings={...window.appSettings,...JSON.parse(s)};}catch(e){}applySettingsToDOM();};
    function applySettingsToDOM(){const r=document.documentElement.style;r.setProperty('--ed-font-size',window.appSettings.edFontSize+'px');r.setProperty('--ed-line-height',window.appSettings.edLineHeight);r.setProperty('--ed-letter-spacing',window.appSettings.edLetterSpacing+'em');r.setProperty('--ed-width',window.appSettings.edWidth+'%');}
    
    window.openReplaceModal=()=>document.getElementById('replace-modal').style.display='flex';
    window.executeReplace=()=>{const s=document.getElementById('replace-search-input').value;const r=document.getElementById('replace-target-input').value;if(!s)return;const e=document.getElementById('main-editor');const rg=new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');const c=(e.value.match(rg)||[]).length;if(c===0){alert("なし");return;}e.value=e.value.replace(rg,r);alert(c+"件置換");document.getElementById('replace-modal').style.display='none';updateCharCount();};
    window.openHistoryModal=function(){if(!window.currentWorkId||!window.currentChapterId)return;document.getElementById('history-modal').style.display='flex';loadHistoryList();};
    function loadHistoryList(){const l=document.getElementById('history-list');l.innerHTML='Loading...';db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId).collection('history').orderBy('savedAt','desc').limit(20).get().then(s=>{l.innerHTML='';s.forEach((d,i)=>{const dt=d.data();const date=dt.savedAt?new Date(dt.savedAt.toDate()):new Date();const div=document.createElement('div');div.className='history-item';div.textContent=`${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes()} (${dt.content.length}字)`;div.onclick=()=>showDiff(dt.content,div);l.appendChild(div);if(i===0)div.click();});});}
    function showDiff(old,el){document.querySelectorAll('.history-item').forEach(e=>e.classList.remove('active'));el.classList.add('active');window.currentHistoryData=old;const cur=document.getElementById('main-editor').value;const diff=Diff.diffChars(old,cur);const d=document.getElementById('history-diff-view');d.innerHTML='';diff.forEach(p=>{const s=document.createElement('span');s.className=p.added?'diff-added':p.removed?'diff-removed':'';s.textContent=p.value;d.appendChild(s);});}
    window.restoreHistory=async()=>{if(window.currentHistoryData!==null&&confirm("復元？")){document.getElementById('main-editor').value=window.currentHistoryData;document.getElementById('history-modal').style.display='none';await saveCurrentChapter(null,false);}};

    window.toggleVerticalMode=()=>{const e=document.getElementById('main-editor');const b=document.getElementById('btn-writing-mode');if(e){e.classList.toggle('vertical-mode');b.textContent=e.classList.contains('vertical-mode')?'横':'縦';}};
    window.insertTextAtCursor=(t)=>{const e=document.getElementById('main-editor');if(!e)return;const s=e.selectionStart;const end=e.selectionEnd;e.value=e.value.substring(0,s)+t+e.value.substring(end);e.selectionStart=e.selectionEnd=s+t.length;e.focus();updateCharCount();trackDailyProgress();};
    window.insertRuby=()=>{const p=prompt("親文字");if(!p)return;const r=prompt("ルビ");if(!r)return;insertTextAtCursor(`｜${p}《${r}》`);};
    window.insertDash=()=>insertTextAtCursor("――");
    window.toggleCharCountMode=()=>{window.charCountMode=window.charCountMode==='total'?'pure':'total';updateCharCount();};
    window.updateCharCount=()=>{const e=document.getElementById('main-editor');const c=document.getElementById('editor-char-counter');if(!c)return;if(window.charCountMode==='total'){c.textContent=`総: ${e.value.length}`;c.style.color='#fff';}else{c.textContent=`全: ${e.value.replace(/\s/g,'').length}`;c.style.color='#89b4fa';}};
    window.updateCatchCounter=(el)=>{const r=35-el.value.length;const c=document.getElementById('c-count');if(c){c.textContent=`(残${r})`;c.style.color=r<0?'#f66':'#89b4fa';}};
    window.escapeHtml=(s)=>{if(!s)return"";return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','-':'&#039;','"':'&quot;'}[m]));};
    window.activateTab=(id)=>{document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.tab-content').forEach(c=>c.style.display='none');const b=document.querySelector(`.tab-btn[data-tab="${id}"]`);if(b)b.classList.add('active');const c=document.getElementById(id);if(c)c.style.display=id==='tab-editor'?'flex':'block';if(id==='tab-plot')loadPlots();if(id==='tab-char')loadCharacters();if(id==='tab-common-memo')loadMemoListForWorkspace();saveAppState('workspace');};

    // Events
    bindClick('diary-widget',()=>switchView('stats')); bindClick('btn-common-memo',()=>switchView('memo')); 
    // 「戻る」ボタン：保存せずにTOPへ戻る
    bindClick('back-to-top',()=>switchView('top'));
    bindClick('back-from-stats',()=>switchView('top')); bindClick('back-from-memo',()=>switchView('top')); bindClick('create-new-work-btn',createNewWork); bindClick('save-work-info-btn',saveWorkInfo);
    bindClick('preview-close-btn',closePreview); bindClick('preview-mode-btn',togglePreviewMode); bindClick('preview-setting-btn',openPreviewSettings); bindClick('history-close-btn',()=>document.getElementById('history-modal').style.display='none'); bindClick('history-restore-btn',restoreHistory);
    bindClick('es-cancel',()=>document.getElementById('editor-settings-modal').style.display='none'); bindClick('es-save',saveEditorSettings); bindClick('ps-cancel',()=>document.getElementById('preview-settings-modal').style.display='none'); bindClick('ps-save',savePreviewSettings); bindClick('replace-cancel-btn',()=>document.getElementById('replace-modal').style.display='none'); bindClick('replace-execute-btn',executeReplace);
    bindClick('add-new-memo-btn',()=>openMemoEditor(null,'memo')); bindClick('ws-add-new-memo-btn',()=>openMemoEditor(null,'workspace')); bindClick('memo-editor-save',saveMemo); bindClick('memo-editor-cancel',()=>switchView(window.previousView)); bindClick('memo-editor-delete',()=>deleteMemo(window.editingMemoId,window.previousView));
    bindClick('plot-add-new-btn',()=>openPlotEditor(null)); bindClick('char-add-new-btn',()=>openCharEditor(null)); bindClick('char-edit-back',()=>document.getElementById('char-edit-view').style.display='none'); bindClick('char-edit-save',saveCharItem); bindClick('char-edit-delete',deleteCharItem);
    
    document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>activateTab(btn.getAttribute('data-tab'))));
    // ★修正: イベントリスナーを新しい描画関数に紐づけ
    const sEl=document.getElementById('sort-order');if(sEl)sEl.addEventListener('change',renderWorkList);
    const fEl=document.getElementById('filter-status');if(fEl)fEl.addEventListener('change',renderWorkList);
    const edEl=document.getElementById('main-editor');if(edEl)edEl.addEventListener('input',()=>{updateCharCount();trackDailyProgress();});
    const cEl=document.getElementById('input-catch');if(cEl)cEl.addEventListener('input',function(){updateCatchCounter(this);});
    const iconInput=document.getElementById('char-icon-input');
    if(iconInput)iconInput.addEventListener('change',function(e){
        const f=e.target.files[0];if(!f)return;const r=new FileReader();
        r.onload=(ev)=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');const x=c.getContext('2d');const M=150;let w=i.width,h=i.height;if(w>h){if(w>M){h*=M/w;w=M;}}else{if(h>M){w*=M/h;h=M;}}c.width=w;c.height=h;x.drawImage(i,0,0,w,h);const d=c.toDataURL('image/jpeg',0.8);const p=document.getElementById('char-icon-preview');p.innerHTML=`<img src="${d}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;p.setAttribute('data-base64',d);};i.src=ev.target.result;};r.readAsDataURL(f);
    });
    function bindClick(id,h){const e=document.getElementById(id);if(e)e.addEventListener('click',h);}
    
    initEditorToolbar();
});