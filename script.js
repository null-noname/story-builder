/* Story Builder V0.60 script.js */

document.addEventListener('DOMContentLoaded', () => {

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

    window.currentUser = null;
    window.currentWorkId = null;
    window.currentChapterId = null;
    window.editingMemoId = null; 
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
    window.editingPlotId = null; // プロット編集用

    // 設定初期値
    window.appSettings = {
        edLetterSpacing: 0,
        edLineHeight: 1.8,
        edWidth: 100,
        edFontSize: 16,
        
        prVerticalChars: 20,
        prLinesPage: 20,
        prFontScale: 1.0
    };

    const views = {
        top: document.getElementById('top-view'),
        workspace: document.getElementById('workspace-view'),
        stats: document.getElementById('stats-view'),
        memo: document.getElementById('memo-view'),
        memoEditor: document.getElementById('memo-editor-view'),
        plotEditor: document.getElementById('plot-editor-modal')
    };
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');

    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch((error) => alert("ログインエラー: " + error.message));
        });
    }

    auth.onAuthStateChanged(async user => {
        if (user) {
            window.currentUser = user;
            if(loginScreen) loginScreen.style.display = 'none';
            if(mainApp) mainApp.style.display = 'block';
            
            await loadDailyLog();
            loadLocalSettings(); 

            const lastView = localStorage.getItem('sb_last_view');
            if (lastView === 'workspace') {
                const lastWork = localStorage.getItem('sb_last_work');
                const lastChapter = localStorage.getItem('sb_last_chapter');
                const lastTab = localStorage.getItem('sb_last_tab') || 'tab-editor';
                
                if (lastWork) {
                    await openWork(lastWork, lastTab);
                    if (lastChapter) {
                        setTimeout(() => {
                            const item = document.querySelector(`.chapter-item[data-id="${lastChapter}"]`);
                            if(item) item.click();
                        }, 500);
                    }
                } else {
                    switchView('top');
                }
            } else if (lastView) {
                switchView(lastView);
            } else {
                switchView('top');
            }

        } else {
            window.currentUser = null;
            if(loginScreen) loginScreen.style.display = 'flex';
            if(mainApp) mainApp.style.display = 'none';
        }
    });

    function saveAppState(viewName) {
        if(!viewName) return;
        localStorage.setItem('sb_last_view', viewName);
        if(window.currentWorkId) localStorage.setItem('sb_last_work', window.currentWorkId);
        if(window.currentChapterId) localStorage.setItem('sb_last_chapter', window.currentChapterId);
        const activeTab = document.querySelector('.tab-btn.active');
        if(activeTab) localStorage.setItem('sb_last_tab', activeTab.getAttribute('data-tab'));
    }

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
            if(name === 'stats') { loadStats(); }
            if(name === 'workspace') loadMemoListForWorkspace(); 
            
            saveAppState(name);
        }
    };

    const bindClick = (id, handler) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('click', handler);
    };

    bindClick('diary-widget', () => switchView('stats'));
    bindClick('btn-common-memo', () => switchView('memo'));
    bindClick('back-to-top', () => saveCurrentChapter('top'));
    bindClick('back-from-stats', () => switchView('top'));
    bindClick('back-from-memo', () => switchView('top'));
    bindClick('create-new-work-btn', createNewWork);
    bindClick('save-work-info-btn', () => saveWorkInfo());
    
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

    // プロットボタン
    bindClick('plot-add-btn', () => openPlotEditor(null));
    bindClick('plot-close-btn', () => document.getElementById('plot-editor-modal').style.display = 'none');
    bindClick('plot-save-btn', savePlot);
    bindClick('plot-delete-btn', deletePlot);

    initEditorToolbar();

    bindClick('add-new-memo-btn', () => openMemoEditor(null, 'memo'));
    bindClick('ws-add-new-memo-btn', () => openMemoEditor(null, 'workspace'));
    bindClick('memo-editor-save', saveMemo);
    bindClick('memo-editor-cancel', () => switchView(window.previousView));
    bindClick('memo-editor-delete', () => {
        if(window.editingMemoId) deleteMemo(window.editingMemoId, window.previousView);
        else switchView(window.previousView);
    });

    const sortEl = document.getElementById('sort-order');
    if(sortEl) sortEl.addEventListener('change', initWorkListener);
    const filterEl = document.getElementById('filter-status');
    if(filterEl) filterEl.addEventListener('change', initWorkListener);
    
    const editorEl = document.getElementById('main-editor');
    if(editorEl) {
        editorEl.addEventListener('input', () => {
            updateCharCount();
            trackDailyProgress();
        });
    }
    const catchEl = document.getElementById('input-catch');
    if(catchEl) catchEl.addEventListener('input', function() { updateCatchCounter(this); });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activateTab(btn.getAttribute('data-tab'));
        });
    });

    function activateTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if(btn) btn.classList.add('active');
        
        const contentEl = document.getElementById(tabId);
        if(contentEl) contentEl.style.display = (tabId === 'tab-editor') ? 'flex' : 'block';
        if(tabId === 'tab-plot') loadPlots(); // プロットタブを開いたらリスト読み込み
        saveAppState('workspace');
    }

    // --- Plot Logic (New) ---
    function loadPlots() {
        if(!window.currentWorkId) return;
        const container = document.getElementById('plot-list-container');
        container.innerHTML = '<div style="padding:10px;">読み込み中...</div>';

        db.collection('works').doc(window.currentWorkId).collection('plots')
          .orderBy('order', 'asc')
          .get().then(snap => {
              container.innerHTML = '';
              const plots = [];
              snap.forEach(doc => plots.push({id: doc.id, ...doc.data()}));
              
              if(plots.length === 0) {
                  container.innerHTML = '<div style="padding:10px; color:#aaa;">プロットがありません</div>';
              } else {
                  plots.forEach((p, idx) => {
                      const card = document.createElement('div');
                      card.className = 'plot-card';
                      const tag = p.type === 'timeline' ? '<span class="plot-tag timeline">TL</span>' : '<span class="plot-tag">Memo</span>';
                      
                      card.innerHTML = `
                        <div class="plot-info" onclick="openPlotEditor('${p.id}')">
                            <div class="plot-title">${escapeHtml(p.title)} ${tag}</div>
                            <div class="plot-preview">${escapeHtml(p.content)}</div>
                        </div>
                        <div class="plot-controls">
                            <button class="plot-order-btn" onclick="movePlot('${p.id}', ${idx}, -1)">↑</button>
                            <button class="plot-order-btn" onclick="movePlot('${p.id}', ${idx}, 1)">↓</button>
                        </div>
                      `;
                      container.appendChild(card);
                  });
              }
          });
    }

    window.openPlotEditor = function(id) {
        window.editingPlotId = id;
        if(id) {
            db.collection('works').doc(window.currentWorkId).collection('plots').doc(id).get().then(doc => {
                if(doc.exists) {
                    const d = doc.data();
                    document.getElementById('plot-input-title').value = d.title;
                    document.getElementById('plot-input-content').value = d.content;
                    document.getElementById('plot-input-type').value = d.type || 'memo';
                    document.getElementById('plot-editor-modal').style.display = 'flex';
                }
            });
        } else {
            document.getElementById('plot-input-title').value = "";
            document.getElementById('plot-input-content').value = "";
            document.getElementById('plot-input-type').value = "memo";
            document.getElementById('plot-editor-modal').style.display = 'flex';
        }
    };

    function savePlot() {
        const title = document.getElementById('plot-input-title').value || "無題";
        const content = document.getElementById('plot-input-content').value;
        const type = document.getElementById('plot-input-type').value;
        
        if(window.editingPlotId) {
            db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId)
              .update({ title, content, type, updatedAt: new Date() })
              .then(() => {
                  document.getElementById('plot-editor-modal').style.display = 'none';
                  loadPlots();
              });
        } else {
            // 新規作成時は末尾に追加
            db.collection('works').doc(window.currentWorkId).collection('plots').get().then(snap => {
                const newOrder = snap.size + 1;
                db.collection('works').doc(window.currentWorkId).collection('plots').add({
                    title, content, type, order: newOrder, createdAt: new Date()
                }).then(() => {
                    document.getElementById('plot-editor-modal').style.display = 'none';
                    loadPlots();
                });
            });
        }
    }

    function deletePlot() {
        if(!window.editingPlotId) return;
        if(confirm("このプロットを削除しますか？")) {
            db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId).delete()
              .then(() => {
                  document.getElementById('plot-editor-modal').style.display = 'none';
                  loadPlots();
              });
        }
    }

    window.movePlot = function(id, index, dir) {
        // 簡易実装: 前後のOrderを入れ替え
        db.collection('works').doc(window.currentWorkId).collection('plots').orderBy('order','asc').get().then(snap => {
            const plots = [];
            snap.forEach(d => plots.push({id: d.id, ...d.data()}));
            
            const targetIndex = index + dir;
            if(targetIndex < 0 || targetIndex >= plots.length) return;
            
            const itemA = plots[index];
            const itemB = plots[targetIndex];
            
            const b1 = db.batch();
            const refA = db.collection('works').doc(window.currentWorkId).collection('plots').doc(itemA.id);
            const refB = db.collection('works').doc(window.currentWorkId).collection('plots').doc(itemB.id);
            
            b1.update(refA, { order: itemB.order });
            b1.update(refB, { order: itemA.order });
            
            b1.commit().then(() => loadPlots());
        });
    }

    // --- Settings (Local) ---
    function loadLocalSettings() {
        const saved = localStorage.getItem('sb_app_settings');
        if(saved) {
            try { window.appSettings = { ...window.appSettings, ...JSON.parse(saved) }; } 
            catch(e) { console.error(e); }
        }
        applySettingsToDOM();
    }
    function openEditorSettings() {
        document.getElementById('es-letter-spacing').value = window.appSettings.edLetterSpacing;
        document.getElementById('es-line-height').value = window.appSettings.edLineHeight;
        document.getElementById('es-width').value = window.appSettings.edWidth;
        document.getElementById('es-font-size').value = window.appSettings.edFontSize;
        document.getElementById('editor-settings-modal').style.display = 'flex';
    }
    function saveEditorSettings() {
        window.appSettings.edLetterSpacing = document.getElementById('es-letter-spacing').value;
        window.appSettings.edLineHeight = document.getElementById('es-line-height').value;
        window.appSettings.edWidth = document.getElementById('es-width').value;
        window.appSettings.edFontSize = document.getElementById('es-font-size').value;
        localStorage.setItem('sb_app_settings', JSON.stringify(window.appSettings));
        applySettingsToDOM();
        document.getElementById('editor-settings-modal').style.display = 'none';
    }
    function openPreviewSettings() {
        document.getElementById('ps-vertical-chars').value = window.appSettings.prVerticalChars;
        document.getElementById('ps-lines-page').value = window.appSettings.prLinesPage;
        document.getElementById('ps-font-scale').value = window.appSettings.prFontScale;
        document.getElementById('preview-settings-modal').style.display = 'flex';
    }
    function savePreviewSettings() {
        window.appSettings.prVerticalChars = document.getElementById('ps-vertical-chars').value;
        window.appSettings.prLinesPage = document.getElementById('ps-lines-page').value;
        window.appSettings.prFontScale = document.getElementById('ps-font-scale').value;
        localStorage.setItem('sb_app_settings', JSON.stringify(window.appSettings));
        applySettingsToDOM();
        const modal = document.getElementById('preview-modal');
        if(modal.style.display === 'flex') applyPreviewLayout(); 
        document.getElementById('preview-settings-modal').style.display = 'none';
    }
    function applySettingsToDOM() {
        const r = document.documentElement.style;
        r.setProperty('--ed-font-size', window.appSettings.edFontSize + 'px');
        r.setProperty('--ed-line-height', window.appSettings.edLineHeight);
        r.setProperty('--ed-letter-spacing', window.appSettings.edLetterSpacing + 'em');
        r.setProperty('--ed-width', window.appSettings.edWidth + '%');
    }

    // --- Replace ---
    function openReplaceModal() {
        document.getElementById('replace-search-input').value = "";
        document.getElementById('replace-target-input').value = "";
        document.getElementById('replace-modal').style.display = 'flex';
    }
    function executeReplace() {
        const searchVal = document.getElementById('replace-search-input').value;
        const replaceVal = document.getElementById('replace-target-input').value;
        if (!searchVal) { alert("検索する文字を入力してください"); return; }
        const editor = document.getElementById('main-editor');
        const original = editor.value;
        const regex = new RegExp(escapeRegExp(searchVal), 'g');
        const count = (original.match(regex) || []).length;
        if(count === 0) { alert("該当する文字が見つかりませんでした"); return; }
        editor.value = original.replace(regex, replaceVal);
        updateCharCount(); trackDailyProgress();
        alert(`${count}件 置換しました`);
        document.getElementById('replace-modal').style.display = 'none';
    }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // --- History ---
    function openHistoryModal() {
        if(!window.currentWorkId || !window.currentChapterId) return;
        document.getElementById('history-modal').style.display = 'flex';
        loadHistoryList();
    }
    function loadHistoryList() {
        const listEl = document.getElementById('history-list');
        listEl.innerHTML = '<div style="padding:10px;">読み込み中...</div>';
        db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId)
          .collection('history').orderBy('savedAt', 'desc').limit(20).get().then(snap => {
              listEl.innerHTML = '';
              if(snap.empty) { listEl.innerHTML = '<div style="padding:10px;">履歴がありません</div>'; return; }
              snap.forEach((doc, index) => {
                  const data = doc.data();
                  const date = data.savedAt ? new Date(data.savedAt.toDate()) : new Date();
                  const label = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;
                  const item = document.createElement('div');
                  item.className = 'history-item';
                  item.textContent = label + ` (${data.content.length}字)`;
                  item.onclick = () => showDiff(data.content, item);
                  listEl.appendChild(item);
                  if(index === 0) item.click(); 
              });
          });
    }
    function showDiff(oldContent, itemEl) {
        document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
        itemEl.classList.add('active');
        window.currentHistoryData = oldContent; 
        const currentContent = document.getElementById('main-editor').value;
        const diff = Diff.diffChars(oldContent, currentContent);
        const display = document.getElementById('history-diff-view');
        display.innerHTML = '';
        diff.forEach(part => {
            const span = document.createElement('span');
            if (part.added) { span.className = 'diff-added'; span.appendChild(document.createTextNode(part.value)); } 
            else if (part.removed) { span.className = 'diff-removed'; span.appendChild(document.createTextNode(part.value)); } 
            else { span.appendChild(document.createTextNode(part.value)); }
            display.appendChild(span);
        });
    }
    async function restoreHistory() {
        if(window.currentHistoryData === null) return;
        if(confirm("この履歴の内容で復元しますか？\n（現在の内容は上書きされ、保存されます）")) {
            document.getElementById('main-editor').value = window.currentHistoryData;
            document.getElementById('history-modal').style.display = 'none';
            updateCharCount();
            await saveCurrentChapter(null, false);
        }
    }

    // --- Preview ---
    function showPreview() {
        const editor = document.getElementById('main-editor');
        const modal = document.getElementById('preview-modal');
        const content = document.getElementById('preview-content');
        if(!editor || !modal || !content) return;
        let text = editor.value;
        text = escapeHtml(text).replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
        text = text.replace(/[\|｜]([^《]+?)《(.+?)》/g, '<ruby>$1<rt>$2</rt></ruby>');
        text = text.replace(/([\u4E00-\u9FFF\u3005\u30F6\u30F5]+)《(.+?)》/g, '<ruby>$1<rt>$2</rt></ruby>');
        content.innerHTML = text;
        modal.style.display = 'flex';
        applyPreviewLayout();
        updatePreviewModeButton();
    }
    function applyPreviewLayout() {
        const r = document.documentElement.style;
        const baseSize = 18 * parseFloat(window.appSettings.prFontScale);
        r.setProperty('--pr-font-size', baseSize + 'px');
        const height = baseSize * parseInt(window.appSettings.prVerticalChars);
        r.setProperty('--pr-height', height + 'px');
    }
    function closePreview() { document.getElementById('preview-modal').style.display = 'none'; }
    function togglePreviewMode() {
        const content = document.getElementById('preview-content');
        content.classList.toggle('vertical-mode');
        updatePreviewModeButton();
    }
    function updatePreviewModeButton() {
        const content = document.getElementById('preview-content');
        const btn = document.getElementById('preview-mode-btn');
        btn.textContent = content.classList.contains('vertical-mode') ? "横読み" : "縦読み";
    }

    // --- Core Logic ---
    function getTodayId() { const d = new Date(); return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`; }
    async function loadDailyLog() {
        if(!window.currentUser) return;
        let promises = [], labels = [];
        for(let i=6; i>=0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
            labels.push(`${d.getMonth()+1}/${d.getDate()}`);
            promises.push(db.collection('daily_logs').doc(`${window.currentUser.uid}_${dateStr}`).get());
        }
        const snapshots = await Promise.all(promises);
        window.dailyHistory = snapshots.map(doc => doc.exists ? (doc.data().count || 0) : 0);
        window.todayAddedCount = window.dailyHistory[6];
        updateDailyWidgetUI(window.todayAddedCount, window.dailyHistory.reduce((a,b)=>a+b,0));
        window.graphLabels = labels;
    }
    function updateDailyWidgetUI(today, weekly) {
        document.getElementById('widget-today-count').innerHTML = `${today}<span class="unit">字</span>`;
        document.getElementById('widget-weekly-count').innerHTML = `${weekly}<span class="unit">字</span>`;
        document.getElementById('stat-today').innerHTML = `${today}<span class="unit">字</span>`;
        document.getElementById('stat-week').innerHTML = `${weekly}<span class="unit">字</span>`;
    }
    function trackDailyProgress() {
        const editor = document.getElementById('main-editor');
        if(!editor) return;
        const diff = editor.value.length - window.lastContentLength;
        if (diff > 0) {
            window.todayAddedCount += diff; window.dailyHistory[6] = window.todayAddedCount;
            updateDailyWidgetUI(window.todayAddedCount, window.dailyHistory.reduce((a,b)=>a+b,0));
            if(window.writingChart) { window.writingChart.data.datasets[0].data = window.dailyHistory; window.writingChart.update(); }
            if(window.pendingLogSave) clearTimeout(window.pendingLogSave);
            window.pendingLogSave = setTimeout(saveDailyLogToFirestore, 3000);
        }
        window.lastContentLength = editor.value.length;
    }
    function saveDailyLogToFirestore() {
        if(!window.currentUser) return;
        db.collection('daily_logs').doc(`${window.currentUser.uid}_${getTodayId()}`).set({ uid: window.currentUser.uid, date: getTodayId(), count: window.todayAddedCount, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    // --- Init ---
    function initEditorToolbar() {
        const editorTab = document.getElementById('tab-editor');
        if(!editorTab) return;
        editorTab.innerHTML = ''; editorTab.style.flexDirection = 'row'; editorTab.classList.remove('mobile-editor-active');
        // Sidebar
        const sidebar = document.createElement('div'); sidebar.id = 'chapter-sidebar'; sidebar.className = 'chapter-sidebar';
        sidebar.innerHTML = `<div class="sidebar-header"><div style="display:flex; align-items:center; flex:1;"><span style="font-weight:bold;">話一覧</span><div style="flex:1;"></div><button class="btn-custom btn-small" id="add-chapter-btn" style="padding:2px 8px;">＋</button><button class="chapter-menu-btn" id="chapter-menu-toggle">≡</button><div id="chapter-menu-overlay" class="chapter-menu-overlay"><div class="chapter-menu-item" onclick="setChapterMode('reorder')">原稿の並び替え</div><div class="chapter-menu-item" onclick="alert('未実装です')">原稿のインポート</div><div class="chapter-menu-item" onclick="setChapterMode('delete')">原稿を削除する</div><div class="chapter-menu-item" onclick="setChapterMode('normal')">メニューを閉じる</div></div></div></div><div id="chapter-list" class="chapter-list scrollable"></div><div class="sidebar-footer"><small id="total-work-chars">合計: 0文字</small><button id="sidebar-toggle-close" class="sidebar-toggle-btn">◀</button></div>`;
        editorTab.appendChild(sidebar);
        document.getElementById('chapter-menu-toggle').addEventListener('click', (e) => { e.stopPropagation(); const ov = document.getElementById('chapter-menu-overlay'); ov.style.display = (ov.style.display === 'flex') ? 'none' : 'flex'; });
        document.addEventListener('click', () => { const ov = document.getElementById('chapter-menu-overlay'); if(ov) ov.style.display = 'none'; });
        // Main
        const mainArea = document.createElement('div'); mainArea.className = 'editor-main-area';
        const header = document.createElement('div'); header.className = 'editor-header';
        const openSidebarBtn = document.createElement('button'); openSidebarBtn.id = 'sidebar-toggle-open'; openSidebarBtn.className = 'sidebar-toggle-open-btn'; openSidebarBtn.textContent = '▶'; openSidebarBtn.style.display = 'none'; openSidebarBtn.onclick = toggleSidebar; header.appendChild(openSidebarBtn);
        const toolbar = document.createElement('div'); toolbar.className = 'editor-toolbar';
        const tools = [ { icon: '📖', action: showPreview }, { icon: '⚙️', action: openEditorSettings }, { spacer: true, label: '|' }, { id: 'btn-writing-mode', icon: '縦', action: toggleVerticalMode }, { icon: '置換', action: openReplaceModal }, { icon: 'ﾙﾋﾞ', action: insertRuby }, { icon: '―', action: insertDash }, { icon: '🕒', action: openHistoryModal } ];
        tools.forEach(t => { if(t.spacer) { const sp = document.createElement('span'); sp.style.cssText = "color:#555; margin:0 5px; font-size:14px; display:flex; align-items:center;"; sp.textContent = '|'; toolbar.appendChild(sp); } else { const btn = document.createElement('button'); btn.className = 'toolbar-btn'; if(t.id) btn.id = t.id; btn.textContent = t.icon; btn.onclick = t.action; toolbar.appendChild(btn); } });
        const counter = document.createElement('div'); counter.className = 'char-count-display'; counter.id = 'editor-char-counter'; counter.onclick = toggleCharCountMode; counter.textContent = '0文字'; header.appendChild(toolbar); header.appendChild(counter);
        const titleRow = document.createElement('div'); titleRow.className = 'chapter-title-row'; titleRow.innerHTML = `<textarea id="chapter-title-input" class="chapter-title-input" placeholder="サブタイトル" rows="1"></textarea>`;
        const editorContainer = document.createElement('div'); editorContainer.id = 'editor-container'; editorContainer.style.cssText = "flex:1; position:relative; border:1px solid #555; background:#111; overflow:hidden;"; editorContainer.innerHTML = `<textarea id="main-editor" class="main-textarea" style="width:100%; height:100%; border:none;" placeholder="章を選択するか、新しい章を追加してください..."></textarea>`;
        const footerRow = document.createElement('div'); footerRow.className = 'editor-footer-row';
        const deleteChapterBtn = document.createElement('button'); deleteChapterBtn.className = 'btn-custom btn-small btn-red'; deleteChapterBtn.textContent = '削除'; deleteChapterBtn.onclick = deleteCurrentChapter;
        const rightGroup = document.createElement('div'); rightGroup.style.display = 'flex'; rightGroup.style.gap = '8px'; rightGroup.style.alignItems = 'center';
        const undoBtn = document.createElement('button'); undoBtn.className = 'toolbar-btn-footer'; undoBtn.textContent = '◀️'; undoBtn.onclick = () => { const ed = document.getElementById('main-editor'); if(ed) { ed.focus(); document.execCommand('undo'); } };
        const redoBtn = document.createElement('button'); redoBtn.className = 'toolbar-btn-footer'; redoBtn.textContent = '▶️'; redoBtn.onclick = () => { const ed = document.getElementById('main-editor'); if(ed) { ed.focus(); document.execCommand('redo'); } };
        const sep = document.createElement('span'); sep.style.color = '#555'; sep.textContent = '|';
        const backBtn = document.createElement('button'); backBtn.className = 'toolbar-btn-footer mobile-only'; backBtn.textContent = '🔙'; backBtn.onclick = showMobileChapterList;
        const saveBtn = document.createElement('button'); saveBtn.className = 'btn-custom btn-small'; saveBtn.id = 'quick-save-btn'; saveBtn.textContent = '保存'; saveBtn.onclick = () => saveCurrentChapter(null, false);
        rightGroup.appendChild(undoBtn); rightGroup.appendChild(redoBtn); rightGroup.appendChild(sep); rightGroup.appendChild(backBtn); rightGroup.appendChild(saveBtn);
        footerRow.appendChild(deleteChapterBtn); footerRow.appendChild(rightGroup);
        mainArea.appendChild(header); mainArea.appendChild(titleRow); mainArea.appendChild(editorContainer); mainArea.appendChild(footerRow); editorTab.appendChild(mainArea);
        document.getElementById('add-chapter-btn').addEventListener('click', addNewChapter);
        document.getElementById('sidebar-toggle-close').addEventListener('click', toggleSidebar);
    }

    // Work Functions
    async function createNewWork() {
        if (!window.currentUser) return;
        const doc = await db.collection('works').add({ uid: window.currentUser.uid, title: "無題の物語", status: "in-progress", isPinned: false, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp(), totalChars: 0 });
        await db.collection('works').doc(doc.id).collection('chapters').add({ title: "第1話", content: "", order: 1, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        openWork(doc.id);
    }
    window.openWork = async function(id, initTab = 'tab-info') {
        window.currentWorkId = id; window.currentChapterId = null; saveAppState('workspace');
        const workDoc = await db.collection('works').doc(id).get();
        if(!workDoc.exists) return;
        const data = workDoc.data(); fillWorkInfo(data);
        // Data Migration for Plot
        if (data.plot) {
            const plotSnap = await db.collection('works').doc(id).collection('plots').get();
            if(plotSnap.empty) {
                await db.collection('works').doc(id).collection('plots').add({ title: "初期プロット", content: data.plot, type: 'memo', order: 1, createdAt: new Date() });
                await db.collection('works').doc(id).update({ plot: firebase.firestore.FieldValue.delete() });
            }
        }
        if (data.content) { /* Chapter Migration Logic same as before */ }
        await loadChapters(); switchView('workspace'); activateTab(initTab);
    };
    function loadChapters() { /* ...Existing Logic... */ }
    window.setChapterMode = function(mode) { window.chapterListMode = mode; loadChapters(); };
    function toggleSidebar() { const sb = document.getElementById('chapter-sidebar'); const btn = document.getElementById('sidebar-toggle-open'); if(sb) { sb.classList.toggle('collapsed'); btn.style.display = sb.classList.contains('collapsed') ? 'block' : 'none'; } }
    function showMobileEditor() { const tab = document.getElementById('tab-editor'); if(window.innerWidth<=600) tab.classList.add('mobile-editor-active'); }
    function showMobileChapterList() { const tab = document.getElementById('tab-editor'); tab.classList.remove('mobile-editor-active'); }
    function toggleVerticalMode() { const ed = document.getElementById('main-editor'); const btn = document.getElementById('btn-writing-mode'); if(ed) { ed.classList.toggle('vertical-mode'); btn.textContent = ed.classList.contains('vertical-mode') ? '横' : '縦'; } }
    function insertTextAtCursor(text) { const ed = document.getElementById('main-editor'); if(!ed) return; const s=ed.selectionStart, e=ed.selectionEnd, v=ed.value; ed.value=v.substring(0,s)+text+v.substring(e); ed.selectionStart=ed.selectionEnd=s+text.length; ed.focus(); updateCharCount(); trackDailyProgress(); }
    function insertRuby() { const p=prompt("親文字"); if(!p)return; const r=prompt("ふりがな"); if(!r)return; insertTextAtCursor(`｜${p}《${r}》`); }
    function insertDash() { insertTextAtCursor('――'); }
    function toggleCharCountMode() { window.charCountMode=(window.charCountMode==='total')?'pure':'total'; updateCharCount(); }
    async function addNewChapter() { /* ...Existing Logic... */ }
    async function deleteCurrentChapter() { /* ...Existing Logic... */ }
    async function saveCurrentChapter(next, alertMsg) { /* ...Existing Logic... */ }
    function saveWorkInfo() { /* ...Existing Logic... */ }
    function initWorkListener() { /* ...Existing Logic... */ }
    function createWorkItem(id, data) { /* ...Existing Logic... */ }
    window.deleteWork = function(e, id) { e.stopPropagation(); if(confirm("削除しますか？")) db.collection('works').doc(id).delete(); };
    window.togglePin = function(e, id, s) { e.stopPropagation(); db.collection('works').doc(id).update({ isPinned: s }); };
    function updateCharCount() { /* ...Existing Logic... */ }
    function updateCatchCounter(el) { /* ...Existing Logic... */ }
    function loadMemoList() { /* ...Existing Logic... */ }
    function loadMemoListForWorkspace() { /* ...Existing Logic... */ }
    function createMemoCard(id, data, origin) { /* ...Existing Logic... */ }
    window.deleteMemo = function(id, origin) { /* ...Existing Logic... */ }
    window.openMemoEditor = function(id, origin) { /* ...Existing Logic... */ }
    function saveMemo() { /* ...Existing Logic... */ }
    function loadStats() { /* ...Existing Logic... */ }
    function renderChart() {}
    function escapeHtml(str) { if(!str)return ""; return str.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','-':'&#039;','"':'&quot;'}[m])); }
    // --- Missing Functions from previous block ---
    async function deleteTargetChapter(cid) { if(!confirm("削除しますか？"))return; await db.collection('works').doc(window.currentWorkId).collection('chapters').doc(cid).delete(); if(window.currentChapterId===cid){ window.currentChapterId=null; document.getElementById('main-editor').value=""; } loadChapters(); }
    function selectChapter(id, data) { window.currentChapterId=id; saveAppState('workspace'); document.getElementById('main-editor').value=data.content||""; window.lastContentLength=data.content?.length||0; document.getElementById('chapter-title-input').value=data.title||""; updateCharCount(); showMobileEditor(); document.querySelectorAll('.chapter-item').forEach(el=>{ el.classList.remove('active'); if(el.getAttribute('data-id')===id) el.classList.add('active'); }); }
    async function updateOrderInDB() { /* ...Existing Logic... */ }
    function swapNodes(n1, n2) { const p1=n1.parentNode, p2=n2.parentNode; if(p1!==p2)return; const t=document.createElement("div"); p1.insertBefore(t,n1); p2.insertBefore(n1,n2); p1.insertBefore(n2,t); p1.removeChild(t); }
    function handleTouchStart(e) { window.touchSrcEl=e.target.closest('.chapter-item'); if(window.touchSrcEl){ window.touchSrcEl.classList.add('dragging'); e.preventDefault(); } }
    function handleTouchMove(e) { if(!window.touchSrcEl)return; e.preventDefault(); const t=e.touches[0]; const target=document.elementFromPoint(t.clientX, t.clientY); const item=target?target.closest('.chapter-item'):null; if(item&&item!==window.touchSrcEl&&item.parentNode===window.touchSrcEl.parentNode){ swapNodes(window.touchSrcEl, item); } }
    function handleTouchEnd(e) { if(window.touchSrcEl){ window.touchSrcEl.classList.remove('dragging'); updateOrderInDB(); window.touchSrcEl=null; } }
    function addDragEvents(item) { /* ...Existing Logic... */ }
});