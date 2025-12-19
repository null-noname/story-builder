/* Story Builder V0.90 script.js - Final Fix */

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
    
    // プロット・キャラ編集用ステート
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
        // 新規追加ビュー（index.htmlに存在すると仮定、なければJSで制御）
        plotEditor: document.getElementById('plot-edit-view'),
        charEditor: document.getElementById('char-edit-view')
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
            // ワークスペース復帰ロジック
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
            } else if (lastView && views[lastView]) {
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
        // ビュー切り替え（モーダル的なエディタも含む）
        Object.values(views).forEach(el => { if(el) el.style.display = 'none'; });
        
        if (views[name]) {
            views[name].style.display = 'flex'; // 基本はflex
            
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
            
            // エディタ画面以外はステート保存
            if (name !== 'plotEditor' && name !== 'charEditor') {
                saveAppState(name);
            }
        }
    };

    const bindClick = (id, handler) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('click', handler);
    };

    // --- Event Bindings ---
    bindClick('diary-widget', () => switchView('stats'));
    bindClick('btn-common-memo', () => switchView('memo'));
    bindClick('back-to-top', () => saveCurrentChapter('top'));
    bindClick('back-from-stats', () => switchView('top'));
    bindClick('back-from-memo', () => switchView('top'));
    bindClick('create-new-work-btn', createNewWork);
    bindClick('save-work-info-btn', () => saveWorkInfo());
    
    // プレビュー操作
    bindClick('preview-close-btn', closePreview);
    bindClick('preview-mode-btn', togglePreviewMode);
    bindClick('preview-setting-btn', openPreviewSettings); 
    
    // 履歴操作
    bindClick('history-close-btn', () => document.getElementById('history-modal').style.display = 'none');
    bindClick('history-restore-btn', restoreHistory);

    // 設定モーダルボタン
    bindClick('es-cancel', () => document.getElementById('editor-settings-modal').style.display = 'none');
    bindClick('es-save', saveEditorSettings);
    bindClick('ps-cancel', () => document.getElementById('preview-settings-modal').style.display = 'none');
    bindClick('ps-save', savePreviewSettings);

    // 置換モーダルボタン
    bindClick('replace-cancel-btn', () => document.getElementById('replace-modal').style.display = 'none');
    bindClick('replace-execute-btn', executeReplace);

    // 共通メモ操作
    bindClick('add-new-memo-btn', () => openMemoEditor(null, 'memo'));
    bindClick('ws-add-new-memo-btn', () => openMemoEditor(null, 'workspace'));
    bindClick('memo-editor-save', saveMemo);
    bindClick('memo-editor-cancel', () => switchView(window.previousView));
    bindClick('memo-editor-delete', () => {
        if(window.editingMemoId) deleteMemo(window.editingMemoId, window.previousView);
        else switchView(window.previousView);
    });

    // --- 新規機能: プロット操作 ---
    bindClick('plot-add-new-btn', () => openPlotEditor(null));
    bindClick('plot-edit-back', () => { 
        document.getElementById('plot-edit-view').style.display = 'none'; 
        document.getElementById('workspace-view').style.display = 'flex';
    });
    bindClick('plot-edit-save', savePlotItem);
    bindClick('plot-edit-delete', deletePlotItem);

    // --- 新規機能: キャラクター操作 ---
    bindClick('char-add-new-btn', () => openCharEditor(null));
    bindClick('char-edit-back', () => { 
        document.getElementById('char-edit-view').style.display = 'none'; 
        document.getElementById('workspace-view').style.display = 'flex';
    });
    bindClick('char-edit-save', saveCharItem);
    bindClick('char-edit-delete', deleteCharItem);
    
    // 画像アップロード処理
    const charIconInput = document.getElementById('char-icon-input');
    if(charIconInput) {
        charIconInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if(!file) return;
            
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const MAX_SIZE = 150; // アイコン用にリサイズ
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > height) {
                        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                    } else {
                        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    const previewEl = document.getElementById('char-icon-preview');
                    previewEl.innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                    previewEl.setAttribute('data-base64', dataUrl);
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    initEditorToolbar();

    // フィルタ・ソート
    const sortEl = document.getElementById('sort-order');
    if(sortEl) sortEl.addEventListener('change', initWorkListener);
    const filterEl = document.getElementById('filter-status');
    if(filterEl) filterEl.addEventListener('change', initWorkListener);
    
    // エディタ入力検知
    const editorEl = document.getElementById('main-editor');
    if(editorEl) {
        editorEl.addEventListener('input', () => {
            updateCharCount();
            trackDailyProgress();
        });
    }
    const catchEl = document.getElementById('input-catch');
    if(catchEl) catchEl.addEventListener('input', function() { updateCatchCounter(this); });

    // タブ切り替え
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
        
        // タブ固有のロード処理
        if(tabId === 'tab-plot') loadPlots();
        if(tabId === 'tab-char') loadCharacters();
        if(tabId === 'tab-common-memo') loadMemoListForWorkspace();

        saveAppState('workspace');
    }

    // --- Work Open Logic (Updated for Separation) ---
    window.openWork = async function(id, initTab = 'tab-info') {
        window.currentWorkId = id;
        window.currentChapterId = null;
        saveAppState('workspace');

        const workDoc = await db.collection('works').doc(id).get();
        if(!workDoc.exists) return;

        const data = workDoc.data();
        fillWorkInfo(data); 

        // 初回章作成ロジック（旧データ互換）
        if (data.content && data.content.length > 0) {
            const chaptersSnap = await db.collection('works').doc(id).collection('chapters').get();
            if (chaptersSnap.empty) {
                await db.collection('works').doc(id).collection('chapters').add({
                    title: "第1話",
                    content: data.content,
                    order: 1,
                    updatedAt: new Date()
                });
                await db.collection('works').doc(id).update({ content: "" });
            }
        }

        await loadChapters();
        switchView('workspace');
        activateTab(initTab);
    };

    // --- Plot Logic (New) ---
    function loadPlots() {
        if(!window.currentWorkId) return;
        const container = document.getElementById('plot-list-container');
        if(!container) return;
        container.innerHTML = '<div style="padding:10px; color:#aaa;">読み込み中...</div>';

        db.collection('works').doc(window.currentWorkId).collection('plots')
            .orderBy('order', 'asc').get()
            .then(snap => {
                container.innerHTML = '';
                if(snap.empty) {
                    container.innerHTML = '<div style="padding:20px; text-align:center; color:#555;">プロットがありません。<br>右下の＋ボタンで追加してください。</div>';
                    return;
                }
                const plots = [];
                snap.forEach(doc => plots.push({...doc.data(), id: doc.id}));
                
                plots.forEach((p, idx) => {
                    const div = document.createElement('div');
                    div.className = 'plot-item-card'; // CSSでデザイン調整推奨
                    div.style.cssText = "background:#222; border:1px solid #444; border-radius:8px; padding:10px; margin-bottom:10px;";
                    
                    const typeLabel = p.type === 'timeline' ? '【タイムライン】' : '【メモ】';
                    const previewText = (p.content || "").split('\n').slice(0, 5).join('\n'); // 5行プレビュー
                    
                    div.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <span style="font-weight:bold; color:#89b4fa;">${escapeHtml(p.title || '無題')}</span>
                            <span style="font-size:12px; color:#888;">${typeLabel}</span>
                        </div>
                        <div style="font-size:14px; color:#ccc; white-space:pre-wrap; max-height:100px; overflow:hidden; opacity:0.8; margin-bottom:8px;">${escapeHtml(previewText)}...</div>
                        <div style="display:flex; justify-content:flex-end; gap:10px;">
                            <button class="btn-custom btn-small" onclick="movePlot('${p.id}', -1)">↑</button>
                            <button class="btn-custom btn-small" onclick="movePlot('${p.id}', 1)">↓</button>
                            <button class="btn-custom btn-small" onclick="openPlotEditor('${p.id}')">編集・全文</button>
                        </div>
                    `;
                    container.appendChild(div);
                });
            });
    }

    window.openPlotEditor = function(id) {
        window.editingPlotId = id;
        const titleEl = document.getElementById('plot-editor-title');
        const contentEl = document.getElementById('plot-editor-content');
        const typeEl = document.getElementById('plot-editor-type'); // select box

        if(id) {
            db.collection('works').doc(window.currentWorkId).collection('plots').doc(id).get().then(doc => {
                if(doc.exists) {
                    const d = doc.data();
                    titleEl.value = d.title;
                    contentEl.value = d.content;
                    if(typeEl) typeEl.value = d.type || 'memo';
                }
            });
        } else {
            titleEl.value = "";
            contentEl.value = "";
            if(typeEl) typeEl.value = 'memo';
        }
        
        // ビュー切り替え
        Object.values(views).forEach(el => { if(el) el.style.display = 'none'; });
        document.getElementById('plot-edit-view').style.display = 'flex';
    };

    window.savePlotItem = async function() {
        if(!window.currentWorkId) return;
        const title = document.getElementById('plot-editor-title').value || "無題";
        const content = document.getElementById('plot-editor-content').value;
        const type = document.getElementById('plot-editor-type') ? document.getElementById('plot-editor-type').value : 'memo';
        
        const data = {
            title, content, type,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if(window.editingPlotId) {
            await db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId).update(data);
        } else {
            // 新規作成時は末尾に追加
            const snap = await db.collection('works').doc(window.currentWorkId).collection('plots').get();
            data.order = snap.size + 1;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('works').doc(window.currentWorkId).collection('plots').add(data);
        }
        
        document.getElementById('plot-edit-view').style.display = 'none';
        document.getElementById('workspace-view').style.display = 'flex';
        loadPlots();
    };

    window.deletePlotItem = async function() {
        if(!window.editingPlotId || !confirm("削除しますか？")) return;
        await db.collection('works').doc(window.currentWorkId).collection('plots').doc(window.editingPlotId).delete();
        document.getElementById('plot-edit-view').style.display = 'none';
        document.getElementById('workspace-view').style.display = 'flex';
        loadPlots();
    };

    window.movePlot = async function(id, direction) {
        // 簡単な実装: 配列で取得して入れ替える
        const snap = await db.collection('works').doc(window.currentWorkId).collection('plots').orderBy('order', 'asc').get();
        let items = [];
        snap.forEach(d => items.push({id: d.id, ...d.data()}));
        
        const idx = items.findIndex(i => i.id === id);
        if(idx === -1) return;
        const targetIdx = idx + direction;
        if(targetIdx < 0 || targetIdx >= items.length) return;
        
        // swap
        [items[idx], items[targetIdx]] = [items[targetIdx], items[idx]];
        
        const batch = db.batch();
        items.forEach((item, i) => {
            const ref = db.collection('works').doc(window.currentWorkId).collection('plots').doc(item.id);
            batch.update(ref, { order: i + 1 });
        });
        await batch.commit();
        loadPlots();
    };


    // --- Character Logic (New) ---
    function loadCharacters() {
        if(!window.currentWorkId) return;
        const container = document.getElementById('char-list-container');
        if(!container) return;
        container.innerHTML = '<div style="padding:10px; color:#aaa;">読み込み中...</div>';

        db.collection('works').doc(window.currentWorkId).collection('characters')
            .orderBy('order', 'asc').get()
            .then(snap => {
                container.innerHTML = '';
                if(snap.empty) {
                    container.innerHTML = '<div style="padding:20px; text-align:center; color:#555;">登場人物がいません。<br>右下の＋ボタンで追加してください。</div>';
                    return;
                }
                
                // 左側のリスト
                const listWrapper = document.createElement('div');
                listWrapper.style.cssText = "display:flex; flex-direction:column; gap:10px;";

                snap.forEach((doc, index) => {
                    const d = doc.data();
                    const item = document.createElement('div');
                    item.className = 'char-list-item';
                    item.style.cssText = "display:flex; align-items:center; background:#222; padding:8px; border-radius:8px; cursor:pointer; border:1px solid #444;";
                    
                    const iconSrc = d.iconBase64 || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2NjYyIgZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg=='; // デフォルトアイコン
                    
                    item.innerHTML = `
                        <img src="${iconSrc}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; margin-right:10px; background:#333;">
                        <div style="flex:1;">
                            <div style="font-weight:bold; font-size:14px;">${escapeHtml(d.name || '名称未設定')}</div>
                            <div style="font-size:11px; color:#888;">${escapeHtml(d.role || '')}</div>
                        </div>
                        <div style="display:flex; flex-direction:column;">
                            <button class="btn-tiny" onclick="event.stopPropagation(); moveChar('${doc.id}', -1)">▲</button>
                            <button class="btn-tiny" onclick="event.stopPropagation(); moveChar('${doc.id}', 1)">▼</button>
                        </div>
                    `;
                    item.onclick = () => openCharPreview(doc.id, d);
                    listWrapper.appendChild(item);
                    
                    // 最初の要素を自動表示
                    if(index === 0 && !window.editingCharId) openCharPreview(doc.id, d);
                });
                container.appendChild(listWrapper);
            });
    }

    function openCharPreview(id, data) {
        // プレビューエリア（右側）に表示
        const previewArea = document.getElementById('char-preview-area');
        if(!previewArea) return;
        
        const iconSrc = data.iconBase64 || '';
        const iconHtml = iconSrc ? `<img src="${iconSrc}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid #555;">` : '<div style="width:80px; height:80px; background:#333; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#555;">No Img</div>';

        previewArea.innerHTML = `
            <div style="display:flex; gap:15px; margin-bottom:15px; border-bottom:1px solid #444; padding-bottom:10px;">
                ${iconHtml}
                <div style="flex:1;">
                    <h3 style="margin:0 0 5px 0; color:#89b4fa;">
                        <ruby>${escapeHtml(data.name)}<rt>${escapeHtml(data.ruby||'')}</rt></ruby>
                        <span style="font-size:0.7em; color:#aaa; margin-left:8px;">(${escapeHtml(data.alias||'')})</span>
                    </h3>
                    <div style="font-size:13px; color:#ccc;">
                        年齢: ${escapeHtml(data.age||'?')}歳 / 誕生日: ${escapeHtml(data.birthday||'?')} / 身長: ${escapeHtml(data.height||'?')}cm<br>
                        役職: ${escapeHtml(data.role||'なし')}
                    </div>
                </div>
                <button class="btn-custom btn-small" onclick="openCharEditor('${id}')">編集</button>
            </div>
            <div style="flex:1; overflow-y:auto; font-size:14px; line-height:1.6; color:#ddd;">
                <div style="margin-bottom:10px;"><strong style="color:#aaa;">見た目・性格:</strong><br>${escapeHtml(data.appearance||'')}</div>
                <div style="margin-bottom:10px;"><strong style="color:#aaa;">特技・スキル:</strong><br>${escapeHtml(data.skill||'')}</div>
                <div style="margin-bottom:10px;"><strong style="color:#aaa;">生い立ち:</strong><br>${escapeHtml(data.background||'')}</div>
                <div style="margin-bottom:10px;"><strong style="color:#aaa;">その他メモ:</strong><br>${escapeHtml(data.note||'')}</div>
            </div>
        `;
    }

    window.openCharEditor = function(id) {
        window.editingCharId = id;
        
        // フィールド取得
        const fields = ['name', 'ruby', 'alias', 'age', 'birthday', 'role', 'height', 'appearance', 'skill', 'background', 'note'];
        const iconPreview = document.getElementById('char-icon-preview');
        
        if(id) {
            db.collection('works').doc(window.currentWorkId).collection('characters').doc(id).get().then(doc => {
                if(doc.exists) {
                    const d = doc.data();
                    fields.forEach(f => {
                        const el = document.getElementById('char-' + f);
                        if(el) el.value = d[f] || "";
                    });
                    if(d.iconBase64) {
                        iconPreview.innerHTML = `<img src="${d.iconBase64}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                        iconPreview.setAttribute('data-base64', d.iconBase64);
                    } else {
                        iconPreview.innerHTML = '<span style="color:#555;">No Img</span>';
                        iconPreview.removeAttribute('data-base64');
                    }
                }
            });
        } else {
            fields.forEach(f => {
                const el = document.getElementById('char-' + f);
                if(el) el.value = "";
            });
            iconPreview.innerHTML = '<span style="color:#555;">No Img</span>';
            iconPreview.removeAttribute('data-base64');
        }

        Object.values(views).forEach(el => { if(el) el.style.display = 'none'; });
        document.getElementById('char-edit-view').style.display = 'flex';
    };

    window.saveCharItem = async function() {
        if(!window.currentWorkId) return;
        
        const getData = (id) => document.getElementById('char-' + id)?.value || "";
        const iconBase64 = document.getElementById('char-icon-preview').getAttribute('data-base64') || "";

        const data = {
            name: getData('name'),
            ruby: getData('ruby'),
            alias: getData('alias'),
            age: getData('age'),
            birthday: getData('birthday'),
            role: getData('role'),
            height: getData('height'),
            appearance: getData('appearance'),
            skill: getData('skill'),
            background: getData('background'),
            note: getData('note'),
            iconBase64: iconBase64,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if(window.editingCharId) {
            await db.collection('works').doc(window.currentWorkId).collection('characters').doc(window.editingCharId).update(data);
        } else {
            const snap = await db.collection('works').doc(window.currentWorkId).collection('characters').get();
            data.order = snap.size + 1;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('works').doc(window.currentWorkId).collection('characters').add(data);
        }
        
        document.getElementById('char-edit-view').style.display = 'none';
        document.getElementById('workspace-view').style.display = 'flex';
        loadCharacters();
    };

    window.deleteCharItem = async function() {
        if(!window.editingCharId || !confirm("削除しますか？")) return;
        await db.collection('works').doc(window.currentWorkId).collection('characters').doc(window.editingCharId).delete();
        document.getElementById('char-edit-view').style.display = 'none';
        document.getElementById('workspace-view').style.display = 'flex';
        loadCharacters();
    };

    window.moveChar = async function(id, direction) {
        const snap = await db.collection('works').doc(window.currentWorkId).collection('characters').orderBy('order', 'asc').get();
        let items = [];
        snap.forEach(d => items.push({id: d.id, ...d.data()}));
        
        const idx = items.findIndex(i => i.id === id);
        if(idx === -1) return;
        const targetIdx = idx + direction;
        if(targetIdx < 0 || targetIdx >= items.length) return;
        
        [items[idx], items[targetIdx]] = [items[targetIdx], items[idx]];
        
        const batch = db.batch();
        items.forEach((item, i) => {
            const ref = db.collection('works').doc(window.currentWorkId).collection('characters').doc(item.id);
            batch.update(ref, { order: i + 1 });
        });
        await batch.commit();
        loadCharacters();
    };

    // --- Work Info Saving (Compatible with old method for basic info) ---
    function saveWorkInfo() {
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
            // plot/characterNotes は旧フィールドだが互換性のため残すか、削除するか。ここでは更新対象から外す
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        db.collection('works').doc(window.currentWorkId).update(data).then(() => alert("保存しました"));
    }

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

    // --- Editor Toolbar & Chapter Functions (Existing) ---
    function initEditorToolbar() {
        const editorTab = document.getElementById('tab-editor');
        if(!editorTab) return;

        editorTab.innerHTML = ''; 
        editorTab.style.flexDirection = 'row'; 
        editorTab.classList.remove('mobile-editor-active');

        // サイドバー
        const sidebar = document.createElement('div');
        sidebar.id = 'chapter-sidebar';
        sidebar.className = 'chapter-sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <div style="display:flex; align-items:center; flex:1;">
                    <span style="font-weight:bold;">話一覧</span>
                    <div style="flex:1;"></div>
                    <button class="btn-custom btn-small" id="add-chapter-btn" style="padding:2px 8px;">＋</button>
                    <button class="chapter-menu-btn" id="chapter-menu-toggle">≡</button>
                    <div id="chapter-menu-overlay" class="chapter-menu-overlay">
                        <div class="chapter-menu-item" onclick="setChapterMode('reorder')">原稿の並び替え</div>
                        <div class="chapter-menu-item" onclick="setChapterMode('delete')">原稿を削除する</div>
                        <div class="chapter-menu-item" onclick="setChapterMode('normal')">メニューを閉じる</div>
                    </div>
                </div>
            </div>
            <div id="chapter-list" class="chapter-list scrollable"></div>
            <div class="sidebar-footer">
                <small id="total-work-chars">合計: 0文字</small>
                <button id="sidebar-toggle-close" class="sidebar-toggle-btn">◀</button>
            </div>
        `;
        editorTab.appendChild(sidebar);

        document.getElementById('chapter-menu-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            const ov = document.getElementById('chapter-menu-overlay');
            ov.style.display = (ov.style.display === 'flex') ? 'none' : 'flex';
        });
        document.addEventListener('click', () => {
            const ov = document.getElementById('chapter-menu-overlay');
            if(ov) ov.style.display = 'none';
        });

        const mainArea = document.createElement('div');
        mainArea.className = 'editor-main-area';
        
        const header = document.createElement('div');
        header.className = 'editor-header';
        
        const openSidebarBtn = document.createElement('button');
        openSidebarBtn.id = 'sidebar-toggle-open';
        openSidebarBtn.className = 'sidebar-toggle-open-btn';
        openSidebarBtn.textContent = '▶';
        openSidebarBtn.style.display = 'none';
        openSidebarBtn.onclick = toggleSidebar;
        header.appendChild(openSidebarBtn);

        const toolbar = document.createElement('div');
        toolbar.className = 'editor-toolbar';
        
        const tools = [
            { icon: '📖', action: showPreview }, 
            { icon: '⚙️', action: openEditorSettings }, 
            { spacer: true, label: '|' },
            { id: 'btn-writing-mode', icon: '縦', action: toggleVerticalMode }, 
            { icon: '置換', action: openReplaceModal }, 
            { icon: 'ﾙﾋﾞ', action: insertRuby },
            { icon: '―', action: insertDash },
            { icon: '🕒', action: openHistoryModal } 
        ];

        tools.forEach(t => {
            if(t.spacer) {
                const sp = document.createElement('span');
                sp.style.cssText = "color:#555; margin:0 5px; font-size:14px; display:flex; align-items:center;";
                sp.textContent = '|';
                toolbar.appendChild(sp);
            } else {
                const btn = document.createElement('button');
                btn.className = 'toolbar-btn';
                if(t.id) btn.id = t.id;
                btn.textContent = t.icon;
                btn.onclick = t.action;
                toolbar.appendChild(btn);
            }
        });

        const counter = document.createElement('div');
        counter.className = 'char-count-display';
        counter.id = 'editor-char-counter';
        counter.onclick = toggleCharCountMode;
        counter.textContent = '0文字';

        header.appendChild(toolbar);
        header.appendChild(counter);

        const titleRow = document.createElement('div');
        titleRow.className = 'chapter-title-row';
        titleRow.innerHTML = `<textarea id="chapter-title-input" class="chapter-title-input" placeholder="サブタイトル" rows="1"></textarea>`;

        const editorContainer = document.createElement('div');
        editorContainer.id = 'editor-container';
        editorContainer.style.cssText = "flex:1; position:relative; border:1px solid #555; background:#111; overflow:hidden;";
        editorContainer.innerHTML = `<textarea id="main-editor" class="main-textarea" style="width:100%; height:100%; border:none;" placeholder="章を選択するか、新しい章を追加してください..."></textarea>`;

        const footerRow = document.createElement('div');
        footerRow.className = 'editor-footer-row';

        const deleteChapterBtn = document.createElement('button');
        deleteChapterBtn.className = 'btn-custom btn-small btn-red'; 
        deleteChapterBtn.textContent = '削除'; 
        deleteChapterBtn.onclick = deleteCurrentChapter;

        const rightGroup = document.createElement('div');
        rightGroup.style.display = 'flex';
        rightGroup.style.gap = '8px';
        rightGroup.style.alignItems = 'center';

        const undoBtn = document.createElement('button');
        undoBtn.className = 'toolbar-btn-footer';
        undoBtn.textContent = '◀️';
        undoBtn.onclick = () => { 
            const ed = document.getElementById('main-editor');
            if(ed) { ed.focus(); document.execCommand('undo'); }
        };

        const redoBtn = document.createElement('button');
        redoBtn.className = 'toolbar-btn-footer';
        redoBtn.textContent = '▶️';
        redoBtn.onclick = () => {
            const ed = document.getElementById('main-editor');
            if(ed) { ed.focus(); document.execCommand('redo'); }
        };

        const sep = document.createElement('span');
        sep.style.color = '#555';
        sep.textContent = '|';

        const backBtn = document.createElement('button');
        backBtn.className = 'toolbar-btn-footer mobile-only';
        backBtn.textContent = '🔙';
        backBtn.onclick = showMobileChapterList;

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-custom btn-small';
        saveBtn.id = 'quick-save-btn';
        saveBtn.textContent = '保存';
        saveBtn.onclick = () => saveCurrentChapter(null, false);

        rightGroup.appendChild(undoBtn);
        rightGroup.appendChild(redoBtn);
        rightGroup.appendChild(sep);
        rightGroup.appendChild(backBtn);
        rightGroup.appendChild(saveBtn);

        footerRow.appendChild(deleteChapterBtn);
        footerRow.appendChild(rightGroup);

        mainArea.appendChild(header);
        mainArea.appendChild(titleRow);
        mainArea.appendChild(editorContainer);
        mainArea.appendChild(footerRow);

        editorTab.appendChild(mainArea);

        document.getElementById('add-chapter-btn').addEventListener('click', addNewChapter);
        document.getElementById('sidebar-toggle-close').addEventListener('click', toggleSidebar);
    }

    window.setChapterMode = function(mode) {
        window.chapterListMode = mode;
        loadChapters(); 
    };

    function toggleSidebar() {
        const sidebar = document.getElementById('chapter-sidebar');
        const openBtn = document.getElementById('sidebar-toggle-open');
        if(sidebar) {
            sidebar.classList.toggle('collapsed');
            if(sidebar.classList.contains('collapsed')) {
                if(openBtn) openBtn.style.display = 'block';
            } else {
                if(openBtn) openBtn.style.display = 'none';
            }
        }
    }

    function showMobileEditor() {
        const editorTab = document.getElementById('tab-editor');
        if(window.innerWidth <= 600 && editorTab) {
            editorTab.classList.add('mobile-editor-active');
        }
    }
    function showMobileChapterList() {
        const editorTab = document.getElementById('tab-editor');
        if(editorTab) {
            editorTab.classList.remove('mobile-editor-active');
        }
    }

    function toggleVerticalMode() {
        const editor = document.getElementById('main-editor');
        const btn = document.getElementById('btn-writing-mode');
        if(editor) {
            editor.classList.toggle('vertical-mode');
            const isVertical = editor.classList.contains('vertical-mode');
            if(btn) btn.textContent = isVertical ? '横' : '縦';
        }
    }

    function insertTextAtCursor(text) {
        const editor = document.getElementById('main-editor');
        if (!editor) return;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const val = editor.value;
        editor.value = val.substring(0, start) + text + val.substring(end);
        editor.selectionStart = editor.selectionEnd = start + text.length;
        editor.focus();
        updateCharCount();
        trackDailyProgress();
    }

    function insertRuby() {
        const parent = prompt("親文字を入力してください");
        if(!parent) return;
        const ruby = prompt("ふりがなを入力してください");
        if(!ruby) return;
        insertTextAtCursor(`｜${parent}《${ruby}》`);
    }

    function insertDash() { insertTextAtCursor('――'); }

    function toggleCharCountMode() {
        window.charCountMode = (window.charCountMode === 'total') ? 'pure' : 'total';
        updateCharCount();
    }

    async function createNewWork() {
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
                title: "第1話",
                content: "",
                order: 1,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            openWork(doc.id); 
        } catch (e) { console.error(e); }
    }

    function loadChapters() {
        if(!window.currentWorkId) return Promise.resolve();
        const listEl = document.getElementById('chapter-list');
        listEl.innerHTML = '<div style="padding:10px; color:#aaa;">読み込み中...</div>';

        return db.collection('works').doc(window.currentWorkId).collection('chapters')
          .orderBy('order', 'asc')
          .get().then(snap => {
              listEl.innerHTML = '';
              let totalPureChars = 0;
              let chapters = [];
              snap.forEach(doc => { 
                  const d = doc.data();
                  chapters.push({id: doc.id, ...d});
                  const content = d.content || "";
                  totalPureChars += content.replace(/\s/g, '').length;
              });

              document.getElementById('total-work-chars').textContent = `合計: ${totalPureChars}文字`;

              if(chapters.length === 0) {
                  listEl.innerHTML = '<div style="padding:10px; color:#aaa;">章がありません</div>';
              } else {
                  chapters.forEach((ch, index) => {
                      const item = document.createElement('div');
                      item.className = 'chapter-item';
                      item.setAttribute('data-id', ch.id);
                      
                      if(window.currentChapterId === ch.id) item.classList.add('active');
                      
                      const title = document.createElement('span');
                      title.className = 'chapter-list-title';
                      title.textContent = ch.title || "無題";
                      item.appendChild(title);

                      if(window.chapterListMode === 'reorder') {
                          item.setAttribute('draggable', 'true'); 
                          const handle = document.createElement('span');
                          handle.textContent = '||';
                          handle.className = 'drag-handle';
                          handle.addEventListener('touchstart', handleTouchStart, {passive: false});
                          handle.addEventListener('touchmove', handleTouchMove, {passive: false});
                          handle.addEventListener('touchend', handleTouchEnd);
                          
                          item.appendChild(handle);
                          addDragEvents(item);
                          
                      } else if (window.chapterListMode === 'delete') {
                          const delIcon = document.createElement('span');
                          delIcon.textContent = '🗑️';
                          delIcon.className = 'chapter-delete-icon';
                          delIcon.onclick = (e) => { e.stopPropagation(); deleteTargetChapter(ch.id); };
                          item.appendChild(delIcon);
                      } else {
                          const count = document.createElement('span');
                          count.className = 'chapter-list-count';
                          const chPure = (ch.content || "").replace(/\s/g, '').length;
                          count.textContent = `(${chPure}字)`;
                          item.appendChild(count);
                          item.onclick = () => selectChapter(ch.id, ch);
                      }

                      listEl.appendChild(item);
                  });
              }
          });
    }

    // --- Drag & Drop (Common) ---
    function addDragEvents(item) {
        item.addEventListener('dragstart', function(e) {
            window.dragSrcEl = this;
            e.dataTransfer.effectAllowed = 'move';
            this.classList.add('dragging');
        });
        item.addEventListener('dragover', function(e) {
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
        });
        item.addEventListener('dragenter', function() { this.classList.add('over'); });
        item.addEventListener('dragleave', function() { this.classList.remove('over'); });
        item.addEventListener('drop', function(e) {
            if (e.stopPropagation) e.stopPropagation();
            if (window.dragSrcEl !== this) {
                swapNodes(window.dragSrcEl, this);
                updateOrderInDB(); 
            }
            return false;
        });
        item.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            document.querySelectorAll('.chapter-item').forEach(el => el.classList.remove('over'));
        });
    }

    let touchSrcEl = null;
    function handleTouchStart(e) {
        touchSrcEl = e.target.closest('.chapter-item');
        if(touchSrcEl) {
            touchSrcEl.classList.add('dragging');
            e.preventDefault(); 
        }
    }
    function handleTouchMove(e) {
        if(!touchSrcEl) return;
        e.preventDefault();
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetItem = target ? target.closest('.chapter-item') : null;

        if (targetItem && targetItem !== touchSrcEl && targetItem.parentNode === touchSrcEl.parentNode) {
            swapNodes(touchSrcEl, targetItem);
        }
    }
    function handleTouchEnd(e) {
        if(touchSrcEl) {
            touchSrcEl.classList.remove('dragging');
            updateOrderInDB(); 
            touchSrcEl = null;
        }
    }
    function swapNodes(n1, n2) {
        const p1 = n1.parentNode;
        const p2 = n2.parentNode;
        if (p1 !== p2) return;
        const temp = document.createElement("div");
        p1.insertBefore(temp, n1);
        p2.insertBefore(n1, n2);
        p1.insertBefore(n2, temp);
        p1.removeChild(temp);
    }
    async function updateOrderInDB() {
        const listEl = document.getElementById('chapter-list');
        const items = listEl.querySelectorAll('.chapter-item');
        const batch = db.batch();
        
        items.forEach((item, index) => {
            const id = item.getAttribute('data-id');
            const ref = db.collection('works').doc(window.currentWorkId).collection('chapters').doc(id);
            batch.update(ref, { order: index + 1 });
        });
        await batch.commit();
    }

    async function deleteTargetChapter(chapterId) {
        if(!confirm("本当にこの章を削除しますか？")) return;
        await db.collection('works').doc(window.currentWorkId).collection('chapters').doc(chapterId).delete();
        if(window.currentChapterId === chapterId) {
            window.currentChapterId = null;
            document.getElementById('main-editor').value = "";
        }
        loadChapters();
    }

    function selectChapter(id, data) {
        window.currentChapterId = id;
        saveAppState('workspace');
        const content = data.content || "";
        document.getElementById('main-editor').value = content;
        window.lastContentLength = content.length;
        const titleInput = document.getElementById('chapter-title-input');
        if(titleInput) titleInput.value = data.title || "";
        updateCharCount();
        const items = document.querySelectorAll('.chapter-item');
        items.forEach(el => {
            el.classList.remove('active');
            if(el.getAttribute('data-id') === id) el.classList.add('active');
        });
        showMobileEditor();
    }

    async function addNewChapter() {
        if(!window.currentWorkId) return;
        const snap = await db.collection('works').doc(window.currentWorkId).collection('chapters').get();
        if(snap.size >= 1000) { alert("最大1000話までです。"); return; }
        const title = prompt("新しい章のタイトルを入力してください", `第${snap.size + 1}話`);
        if(title) {
            await db.collection('works').doc(window.currentWorkId).collection('chapters').add({
                title: title, content: "", order: snap.size + 1, updatedAt: new Date()
            });
            loadChapters();
        }
    }

    async function deleteCurrentChapter() {
        if(!window.currentWorkId || !window.currentChapterId) return;
        if(!confirm("本当にこの章を削除しますか？\n（削除すると元に戻せません）")) return;
        await db.collection('works').doc(window.currentWorkId)
            .collection('chapters').doc(window.currentChapterId).delete();
        alert("削除しました");
        window.currentChapterId = null;
        document.getElementById('main-editor').value = "";
        showMobileChapterList();
        loadChapters();
    }

    async function saveCurrentChapter(nextViewName = null, showAlert = false) {
        if(!window.currentWorkId || !window.currentChapterId) {
            if(nextViewName) switchView(nextViewName);
            return;
        }
        
        const content = document.getElementById('main-editor').value;
        const titleInput = document.getElementById('chapter-title-input');
        const title = titleInput ? titleInput.value : "無題";

        if(content.length > 20000) {
            alert("1話あたりの文字数が上限(20,000字)を超えています。保存できません。");
            return;
        }

        // 履歴保存
        const chRef = db.collection('works').doc(window.currentWorkId).collection('chapters').doc(window.currentChapterId);
        await chRef.collection('history').add({
            content: content,
            savedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // 本体保存
        await chRef.update({
            title: title,
            content: content,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        saveDailyLogToFirestore();

        // 文字数集計
        const snap = await db.collection('works').doc(window.currentWorkId).collection('chapters').get();
        let totalPure = 0;
        snap.forEach(doc => { totalPure += (doc.data().content || "").replace(/\s/g, '').length; });

        await db.collection('works').doc(window.currentWorkId).update({
            totalChars: totalPure,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        loadChapters(); 
        if(nextViewName) switchView(nextViewName);
        else if (showAlert) alert("保存しました");
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
                <div class="work-meta-container">
                    <div class="work-meta-row">作成日: ${formatDate(data.createdAt)}</div>
                    <div class="work-meta-row">更新日: ${formatDate(data.updatedAt)}</div>
                    <div class="work-meta-row">全 ${data.totalChars || 0} 字</div>
                </div>
            </div>
            <div class="work-actions">
                <button class="btn-custom btn-card-action" onclick="openWork('${id}')">編集</button>
                <button class="btn-custom btn-card-action btn-card-delete" onclick="deleteWork(event, '${id}')">削除</button>
                <button class="btn-custom btn-card-action" onclick="togglePin(event, '${id}', ${!data.isPinned})">${pinBtnIcon}</button>
            </div>
        `;
        return div;
    }

    window.deleteWork = function(e, id) { e.stopPropagation(); if(confirm("削除しますか？")) db.collection('works').doc(id).delete(); };
    window.togglePin = function(e, id, newState) { e.stopPropagation(); db.collection('works').doc(id).update({ isPinned: newState }); };

    function updateCharCount() { 
        const text = document.getElementById('main-editor').value;
        const counter = document.getElementById('editor-char-counter');
        if(!counter) return;

        if (window.charCountMode === 'total') {
            counter.textContent = `総文字数: ${text.length}`;
            counter.style.color = '#fff';
        } else {
            const pure = text.replace(/\s/g, '').length;
            counter.textContent = `全文字数: ${pure}`;
            counter.style.color = '#89b4fa';
        }
    }

    function updateCatchCounter(el) {
        const remain = 35 - el.value.length;
        const c = document.getElementById('c-count');
        if(c) {
            c.textContent = `(残り${remain}文字)`;
            c.style.color = remain < 0 ? '#ff6b6b' : '#89b4fa';
        }
    }

    // --- Memo Logic (Common & Workspace) ---
    function loadMemoList() {
        if(!window.currentUser) return;
        db.collection('memos').where('uid', '==', window.currentUser.uid).get().then(snap => {
            const container = document.getElementById('memo-list-container');
            if(!container) return;
            container.innerHTML = '';
            let memos = [];
            snap.forEach(doc => { memos.push({ ...doc.data(), id: doc.id }); });
            memos.sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
            memos.forEach(d => container.appendChild(createMemoCard(d.id, d, 'memo')));
        });
    }
    function loadMemoListForWorkspace() {
        if(!window.currentUser) return;
        db.collection('memos').where('uid', '==', window.currentUser.uid).get().then(snap => {
            const container = document.getElementById('ws-memo-list-container');
            if(!container) return;
            container.innerHTML = '';
            let memos = [];
            snap.forEach(doc => { memos.push({ ...doc.data(), id: doc.id }); });
            memos.sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
            memos.forEach(d => container.appendChild(createMemoCard(d.id, d, 'workspace')));
        });
    }

    function createMemoCard(id, data, originView) {
        const div = document.createElement('div');
        div.className = 'memo-card';
        div.innerHTML = `
            <div class="memo-header">
                <span class="memo-title">${escapeHtml(data.title)}</span>
                <div class="memo-controls">
                    <button class="memo-btn" onclick="openMemoEditor('${id}', '${originView}')">✎ 編集</button>
                    <button class="memo-btn memo-btn-delete" onclick="deleteMemo('${id}', '${originView}')">削除</button>
                </div>
            </div>
            <div class="memo-divider"></div>
            <div class="memo-text">${escapeHtml(data.content)}</div>
        `;
        return div;
    }

    window.deleteMemo = function(id, origin) {
        if(confirm("本当に削除しますか？")) {
            db.collection('memos').doc(id).delete().then(() => { if(origin === 'memo') loadMemoList(); else loadMemoListForWorkspace(); });
        }
    };

    window.openMemoEditor = function(id, fromView) {
        window.editingMemoId = id; window.previousView = fromView; 
        if(id) {
            db.collection('memos').doc(id).get().then(doc => {
                if(doc.exists) {
                    const data = doc.data();
                    document.getElementById('memo-editor-title').value = data.title;
                    document.getElementById('memo-editor-content').value = data.content;
                    switchView('memoEditor');
                }
            });
        } else {
            document.getElementById('memo-editor-title').value = ""; document.getElementById('memo-editor-content').value = "";
            switchView('memoEditor');
        }
    };

    function saveMemo() {
        const title = document.getElementById('memo-editor-title').value || "新規メモ";
        const content = document.getElementById('memo-editor-content').value;
        const memoData = { uid: window.currentUser.uid, title: title, content: content, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if(window.editingMemoId) {
            db.collection('memos').doc(window.editingMemoId).update(memoData).then(() => switchView(window.previousView));
        } else {
            memoData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            db.collection('memos').add(memoData).then(() => switchView(window.previousView));
        }
    }

    // --- Statistics ---
    function loadStats() {
        db.collection('works').where('uid', '==', window.currentUser.uid).get().then(snap => {
            let workCount = 0;
            snap.forEach(d => { if(!d.data().isSystem) workCount++; });
            const el = document.getElementById('stat-works');
            if(el) el.innerHTML = `${workCount}<span class="unit">作品</span>`;
        });
        
        const canvas = document.getElementById('writingChart');
        if(canvas) {
            canvas.style.display = 'block'; 
            if(canvas.parentNode.querySelector('div')) canvas.parentNode.querySelector('div').remove(); 
            
            const ctx = canvas.getContext('2d');
            if (window.writingChart) window.writingChart.destroy();
            window.writingChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: window.graphLabels || ['','','','','','','今日'],
                    datasets: [{ 
                        data: window.dailyHistory || [0,0,0,0,0,0,0], 
                        backgroundColor: '#89b4fa', 
                        borderRadius: 4 
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { 
                        y: { beginAtZero: true, grid: { color: '#444' }, ticks: { color: '#aaa' } }, 
                        x: { grid: { display: false }, ticks: { color: '#aaa' } } 
                    }
                }
            });
        }
        loadDailyLog();
    }
    
    // --- Utils ---
    function escapeHtml(str) {
        if(!str) return "";
        return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','-':'&#039;','"':'&quot;'}[m]));
    }
    
    // 履歴モーダルのリストにスタイル適用（スクロールバー対応）
    const hList = document.getElementById('history-list');
    if(hList) hList.style.cssText = "max-height: 40vh; overflow-y: auto; background:#111; border:1px solid #444; border-radius:4px;";

});