/**
 * Template Loader
 * 外部HTMLファイルを非同期で読み込み、DOM要素に挿入します。
 */
export async function loadComponent(targetId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Component load failed: ${filePath} (Status: ${response.status})`);
        }
        const html = await response.text();
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
            targetElement.innerHTML = html;
            return true;
        } else {
            console.error(`Target element not found: ${targetId}`);
        }
    } catch (error) {
        console.error("Template Loader Error:", error);
    }
    return false;
}
