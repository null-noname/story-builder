/* Story Builder V0.29 script.js */

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

    const views = {
        top: document.getElementById('top-view'),
        workspace: document.getElementById('workspace-view'),
        stats: document.getElementById('stats-view'),
        memo: document.getElementById('memo-view'),
        memoEditor: document.getElementById('memo-editor-view')
    };
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');

    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithRedirect(provider).catch((error) => alert("ログインエラー: " + error.message));
        });
    }

    auth.onAuthStateChanged(async user => {
        if (user) {
            window.currentUser = user;
            if(loginScreen) loginScreen.style.display = 'none';
            if(mainApp) mainApp.style.display = 'block';
            
            // ★追加: リロード前の状態を復元
            await restoreAppState();
        } else {
            window.currentUser = null;
            if(loginScreen) loginScreen.style.display = 'flex';
            if(mainApp) mainApp.style.display = 'none';
        }
    });

    // ★追加: 状態保存機能
    function saveAppState(viewName) {
        if(!viewName) return;
        localStorage.setItem('sb_last_view', viewName);
        if(window.currentWorkId) localStorage.setItem('sb_last_work', window.currentWorkId);
        if(window.currentChapterId) localStorage.setItem('sb_last_chapter', window.currentChapterId);
        
        // 現在のアクティブタブも保存
        const activeTab = document.querySelector('.tab-btn.active');
        if(activeTab) localStorage.setItem('sb_last_tab', activeTab.getAttribute('data-tab'));
    }

    // ★追加: 状態復元機能
    async function restoreAppState() {
        const lastView = localStorage.getItem('sb_last_view');
        const lastWork = localStorage.getItem('sb_last_work');
        const lastChapter = localStorage.getItem('sb_last_chapter');
        const lastTab = localStorage.getItem('sb_last_tab');

        if (lastView === 'workspace' && lastWork) {
            // ワークスペースへの復帰試行
            await openWork(lastWork, lastTab); // タブ指定で開く
            if(lastChapter) {
                // 章のロードを待ってから選択したいが、簡易的にIDセット
                // loadChapters内で自動選択されるロジックと競合しないよう調整
                // ここではwindow.currentChapterIdにはセットせず、loadChapters完了後に選択するような仕組みが必要
                // 今回はシンプルに、loadChaptersが呼ばれた後に自動選択させるため、グローバル変数に入れておく
                window.pendingChapterId = lastChapter; 
            }
        } else if (lastView) {
            switchView(lastView);
        } else {
            switchView('top');
        }
    }

    window.switchView = function(name) {
        Object.values(views).forEach(el => { if(el) el.style.display = 'none'; });
        if (views[name]) {
            views[name].style.display = 'flex';
            if(name === 'top') {
                loadWorks();
                window.currentWorkId = null; // TOPに戻ったらクリア
            }
            if(name === 'memo') loadMemoList();
            if(name === 'stats') { loadStats(); renderChart(); }
            if(name === 'workspace') loadMemoListForWorkspace(); 
            
            saveAppState(name); // 画面切り替え時に保存
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
    bindClick('quick-save-btn', () => saveCurrentChapter(null, false)); 
    
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
    if(sortEl) sortEl.addEventListener('change', loadWorks);
    const filterEl = document.getElementById('filter-status');
    if(filterEl) filterEl.addEventListener('change', loadWorks);
    const editorEl = document.getElementById('main-editor');
    if(editorEl) editorEl.addEventListener('input', updateCharCount);
    const catchEl = document.getElementById('input-catch');
    if(catchEl) catchEl.addEventListener('input', function() { updateCatchCounter(this); });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            const contentId = btn.getAttribute('data-tab');
            const contentEl = document.getElementById(contentId);
            if(contentEl) contentEl.style.display = (contentId === 'tab-editor') ? 'flex' : 'block';
            
            saveAppState('workspace'); // タブ切り替えも保存
        });
    });

    // --- Editor Toolbar & Chapter UI Init ---
    function initEditorToolbar() {
        const editorTab = document.getElementById('tab-editor');
        if(!editorTab) return;

        editorTab.innerHTML = ''; 
        editorTab.style.flexDirection = 'row'; 
        // スマホ用クラス初期化
        editorTab.classList.remove('mobile-editor-active');

        // 左カラム: 章リスト
        const sidebar = document.createElement('div');
        sidebar.className = 'chapter-sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <span style="font-weight:bold;">章一覧</span>
                <button class="btn-custom btn-small" id="add-chapter-btn" style="padding:2px 8px;">＋</button>
            </div>
            <div id="chapter-list" class="chapter-list scrollable"></div>
            <div class="sidebar-footer">
                <small id="total-work-chars">合計: 0文字</small>
            </div>
        `;
        editorTab.appendChild(sidebar);

        // 右カラム: エディタエリア
        const mainArea = document.createElement('div');
        mainArea.className = 'editor-main-area';
        
        // ツールバー
        const header = document.createElement('div');
        header.className = 'editor-header';
        
        const toolbar = document.createElement('div');
        toolbar.className = 'editor-toolbar';
        
        const tools = [
            // ★追加: スマホ用「一覧へ戻る」ボタン
            { id: 'btn-mobile-back', icon: '🔙', action: showMobileChapterList, mobileOnly: true },
            { spacer: true, mobileOnly: true },
            { icon: '📖', action: () => alert('プレビュー機能（未実装）') },
            { icon: '⚙️', action: () => alert('設定画面（未実装）') },
            { id: 'btn-writing-mode', icon: '縦', action: toggleVerticalMode }, 
            { icon: '置換', action: () => alert('置換機能（未実装）') },
            { spacer: true },
            { icon: 'ﾙﾋﾞ', action: insertRuby },
            { icon: '—', action: insertDash },
            { icon: '◀️', action: () => document.execCommand('undo') },
            { icon: '▶️', action: () => document.execCommand('redo') }
        ];

        tools.forEach(t => {
            if(t.spacer) {
                const sp = document.createElement('div');
                sp.style.width = '10px'; sp.style.flexShrink = '0';
                if(t.mobileOnly) sp.classList.add('mobile-only'); // CSSで制御
                toolbar.appendChild(sp);
            } else {
                const btn = document.createElement('button');
                btn.className = 'toolbar-btn';
                if(t.mobileOnly) btn.classList.add('mobile-only');
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

        // エディタ本体
        const editorContainer = document.createElement('div');
        editorContainer.id = 'editor-container';
        editorContainer.style.cssText = "flex:1; position:relative; border:1px solid #555; background:#111; overflow:hidden;";
        editorContainer.innerHTML = `<textarea id="main-editor" class="main-textarea" style="width:100%; height:100%; border:none;" placeholder="章を選択するか、新しい章を追加してください..."></textarea>`;

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-custom btn-small';
        saveBtn.id = 'quick-save-btn';
        saveBtn.style.marginTop = '5px';
        saveBtn.textContent = '一時保存';
        saveBtn.onclick = () => saveCurrentChapter(null, false);

        mainArea.appendChild(header);
        mainArea.appendChild(editorContainer);
        mainArea.appendChild(saveBtn);

        editorTab.appendChild(mainArea);

        document.getElementById('add-chapter-btn').addEventListener('click', addNewChapter);
        document.getElementById('main-editor').addEventListener('input', updateCharCount);
    }

    // ★追加: スマホ用画面切り替えロジック
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
    }

    function insertRuby() {
        const parent = prompt("親文字を入力してください");
        if(!parent) return;
        const ruby = prompt("ふりがなを入力してください");
        if(!ruby) return;
        insertTextAtCursor(`|${parent}《${ruby}》`);
    }

    function insertDash() { insertTextAtCursor('――'); }

    function toggleCharCountMode() {
        window.charCountMode = (window.charCountMode === 'total') ? 'pure' : 'total';
        updateCharCount();
    }

    // --- Work & Chapter Management ---

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
                title: "第1話", // ★修正: 自動移行という文字を削除
                content: "",
                order: 1,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            openWork(doc.id); 
        } catch (e) { console.error(e); }
    }

    // initTab: 初期表示するタブID (リロード復帰用)
    window.openWork = async function(id, initTab = 'tab-info') {
        window.currentWorkId = id;
        window.currentChapterId = null;
        saveAppState('workspace'); // 開いた時点で保存

        const workDoc = await db.collection('works').doc(id).get();
        if(!workDoc.exists) return;

        const data = workDoc.data();
        fillWorkInfo(data); 

        // 古いデータ構造からの移行チェック
        if (data.content && data.content.length > 0) {
            const chaptersSnap = await db.collection('works').doc(id).collection('chapters').get();
            if (chaptersSnap.empty) {
                await db.collection('works').doc(id).collection('chapters').add({
                    title: "第1話", // ★修正
                    content: data.content,
                    order: 1,
                    updatedAt: new Date()
                });
                await db.collection('works').doc(id).update({ content: "" });
            }
        }

        loadChapters();
        switchView('workspace');

        // 指定タブを開く
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        const targetBtn = document.querySelector(`.tab-btn[data-tab="${initTab}"]`);
        if(targetBtn) targetBtn.classList.add('active');
        const targetContent = document.getElementById(initTab);
        if(targetContent) targetContent.style.display = (initTab === 'tab-editor') ? 'flex' : 'block';
    };

    function loadChapters() {
        if(!window.currentWorkId) return;
        const listEl = document.getElementById('chapter-list');
        listEl.innerHTML = '<div style="padding:10px; color:#aaa;">読み込み中...</div>';

        db.collection('works').doc(window.currentWorkId).collection('chapters')
          .orderBy('order', 'asc')
          .get().then(snap => {
              listEl.innerHTML = '';
              let totalChars = 0;
              let chapters = [];
              snap.forEach(doc => { 
                  const d = doc.data();
                  chapters.push({id: doc.id, ...d});
                  totalChars += (d.content ? d.content.length : 0);
              });

              document.getElementById('total-work-chars').textContent = `合計: ${totalChars}文字`;

              if(chapters.length === 0) {
                  listEl.innerHTML = '<div style="padding:10px; color:#aaa;">章がありません</div>';
              } else {
                  chapters.forEach(ch => {
                      const item = document.createElement('div');
                      item.className = 'chapter-item';
                      if(window.currentChapterId === ch.id) item.classList.add('active');
                      
                      const title = document.createElement('span');
                      title.textContent = ch.title || "無題";
                      
                      const count = document.createElement('span');
                      count.style.fontSize = "0.8em";
                      count.style.color = "#888";
                      count.textContent = `(${ch.content ? ch.content.length : 0}字)`;

                      item.appendChild(title);
                      item.appendChild(count);
                      item.onclick = () => selectChapter(ch.id, ch);
                      listEl.appendChild(item);
                  });
                  
                  // 自動選択ロジック（リロード復帰または先頭）
                  if (window.pendingChapterId) {
                      const target = chapters.find(c => c.id === window.pendingChapterId);
                      if(target) {
                          selectChapter(target.id, target);
                          if(window.innerWidth <= 600) showMobileEditor(); // スマホならエディタ表示
                      }
                      window.pendingChapterId = null;
                  } else if (!window.currentChapterId && chapters.length > 0) {
                      // 初回ロード時はあえてselectChapterを呼ばず、リスト表示のままにする（PCなら呼んでもいいがスマホ考慮）
                      // PCの場合は先頭を選んでおくと親切
                      if(window.innerWidth > 600) {
                          selectChapter(chapters[0].id, chapters[0]);
                      }
                  }
              }
          });
    }

    function selectChapter(id, data) {
        window.currentChapterId = id;
        saveAppState('workspace'); // 選択した章も保存

        document.getElementById('main-editor').value = data.content || "";
        updateCharCount();
        
        // ハイライト更新
        const items = document.querySelectorAll('.chapter-item');
        items.forEach(el => el.classList.remove('active'));
        // 簡易的に再ロードせず、クリックされた要素が特定できないため、再ロードはしない
        // 本来はelementを渡すべきだが、今回はloadChaptersで再描画が一番確実
        // ただ、スマホ遷移のためにここで画面切り替えを行う
        showMobileEditor();

        // ハイライトのため再描画（少し非効率だがバグが少ない）
        // ただしユーザー操作のレスポンスを良くするため、loadChaptersは呼ばずに済ませたいが、
        // 既存の仕組み上、loadChaptersを呼んで再構築するのが無難
        // ここでは、再描画せずに済むように工夫はしないでおく（リクエスト優先）
        // ★修正: リスト再描画はせず、見た目だけ変えたいが、DOM要素への参照がないので
        // 一旦loadChaptersを呼ぶ（一瞬ちらつくが許容）
        loadChapters();
    }

    async function addNewChapter() {
        if(!window.currentWorkId) return;
        const snap = await db.collection('works').doc(window.currentWorkId).collection('chapters').get();
        if(snap.size >= 1000) { alert("最大1000話までです。"); return; }

        const title = prompt("新しい章のタイトルを入力してください", `第${snap.size + 1}話`);
        if(title) {
            await db.collection('works').doc(window.currentWorkId).collection('chapters').add({
                title: title,
                content: "",
                order: snap.size + 1,
                updatedAt: new Date()
            });
            loadChapters();
        }
    }

    function saveCurrentChapter(nextViewName = null, showAlert = false) {
        if(!window.currentWorkId || !window.currentChapterId) {
            if(nextViewName) switchView(nextViewName);
            return;
        }
        
        const content = document.getElementById('main-editor').value;
        if(content.length > 20000) {
            alert("1話あたりの文字数が上限(20,000字)を超えています。保存できません。");
            return;
        }

        db.collection('works').doc(window.currentWorkId)
          .collection('chapters').doc(window.currentChapterId)
          .update({
              content: content,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }).then(() => {
              loadChapters();
              if(nextViewName) switchView(nextViewName);
              else if (showAlert) alert("保存しました");
          });
    }

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
            plot: document.getElementById('plot-editor').value,
            characterNotes: document.getElementById('char-editor').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        db.collection('works').doc(window.currentWorkId).update(data);
    }

    function fillWorkInfo(data) {
        document.getElementById('input-title').value = data.title || "";
        document.getElementById('input-summary').value = data.description || "";
        document.getElementById('input-catch').value = data.catchphrase || "";
        document.getElementById('input-genre-main').value = data.genreMain || "";
        document.getElementById('input-genre-sub').value = data.genreSub || "";
        document.getElementById('plot-editor').value = data.plot || "";
        document.getElementById('char-editor').value = data.characterNotes || "";
        const setRadio = (name, val) => { const r = document.querySelector(`input[name="${name}"][value="${val}"]`); if(r) r.checked = true; };
        setRadio("novel-status", data.status || "in-progress");
        setRadio("novel-type", data.type || "original");
        setRadio("ai-usage", data.aiUsage || "none");
        const ratings = data.ratings || [];
        document.querySelectorAll('input[name="rating"]').forEach(c => c.checked = ratings.includes(c.value));
        updateCatchCounter(document.getElementById('input-catch'));
    }

    function loadWorks() {
        if (!window.currentUser) return;
        const sortKey = document.getElementById('sort-order').value === 'created' ? 'createdAt' : 'updatedAt';
        const filterStatus = document.getElementById('filter-status').value;
        
        db.collection('works').where('uid', '==', window.currentUser.uid).get().then(snapshot => {
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

    window.deleteWork = function(e, id) { e.stopPropagation(); if(confirm("削除しますか？")) db.collection('works').doc(id).delete().then(loadWorks); };
    window.togglePin = function(e, id, newState) { e.stopPropagation(); db.collection('works').doc(id).update({ isPinned: newState }).then(loadWorks); };

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

    function loadStats() {
        db.collection('works').where('uid', '==', window.currentUser.uid).get().then(snap => {
            let workCount = 0;
            snap.forEach(d => { if(!d.data().isSystem) workCount++; });
            const el = document.getElementById('stat-works');
            if(el) el.innerHTML = `${workCount}<span class="unit">作品</span>`;
        });
    }
    
    function renderChart() {
        const ctxEl = document.getElementById('writingChart');
        if(!ctxEl) return;
        const ctx = ctxEl.getContext('2d');
        if (window.writingChart) window.writingChart.destroy();
        window.writingChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['12/13', '12/14', '12/15', '12/16', '12/17', '12/18', '12/19'],
                datasets: [{ data: [100, 450, 300, 0, 800, 200, 530], backgroundColor: '#89b4fa', borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: '#444' }, ticks: { color: '#aaa' } }, x: { grid: { display: false }, ticks: { color: '#aaa' } } }
            }
        });
    }

    function escapeHtml(str) {
        if(!str) return "";
        return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','-':'&#039;','"':'&quot;'}[m]));
    }
});