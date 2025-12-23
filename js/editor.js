/**
 * Editor Logic
 * Handles text processing, shortcuts, and auto-save
 */

let autoSaveTimer = null;

export function setupEditor(onInput, onSave) {
    const editor = document.getElementById('main-editor');
    if (!editor) return;

    editor.oninput = () => {
        updateCharCount();
        onInput();
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(onSave, 2000);
    };

    // Keyboard shortcuts for Ruby and Dash
    editor.onkeydown = (e) => {
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            insertRuby();
        }
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            insertDash();
        }
    };
}

export function updateCharCount() {
    const editor = document.getElementById('main-editor');
    const display = document.getElementById('editor-char-count');
    if (editor && display) {
        display.textContent = `${editor.value.length} 字`;
    }
}

export function insertRuby() {
    const editor = document.getElementById('main-editor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selected = text.substring(start, end);
    const ruby = `｜${selected}《》`;

    editor.value = text.substring(0, start) + ruby + text.substring(end);
    editor.focus();
    // Position cursor inside the ruby braces
    editor.selectionStart = editor.selectionEnd = start + selected.length + 2;
}

export function insertDash() {
    const editor = document.getElementById('main-editor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;

    editor.value = text.substring(0, start) + "――" + text.substring(end);
    editor.focus();
    editor.selectionStart = editor.selectionEnd = start + 2;
}

export function setEditorContent(content) {
    const editor = document.getElementById('main-editor');
    if (editor) {
        editor.value = content || "";
        updateCharCount();
    }
}

export function getEditorContent() {
    const editor = document.getElementById('main-editor');
    return editor ? editor.value : "";
}

export function toggleVerticalMode() {
    const editor = document.getElementById('main-editor');
    if (editor) editor.classList.toggle('vertical');
}
