let editorOpacity = 0.95;

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

window.updateEditorBackground = () => {
    const cmWrapper = editor.getWrapperElement();
    const bgColorHex = localStorage.getItem('color-Background') || '#1e1e1f';
    const rgb = hexToRgb(bgColorHex);
    if (rgb) {
        cmWrapper.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${editorOpacity})`;
    }
    const mediaPreviewElement = document.getElementById('media-preview');
    if (mediaPreviewElement) {
        mediaPreviewElement.style.backgroundColor = bgColorHex;
    }
};

function setupCodeMirror() {
    editor = CodeMirror(editorElement, {
        lineNumbers: true,
        mode: "htmlmixed",
        theme: "monokai",
        lineWrapping: true,
        viewportMargin: Infinity,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-S": function(cm) {
                saveCurrentCode(true);
                return false;
            }
        },
        highlightSelectionMatches: {showToken: /\w/, annotateScrollbar: true}
    });

    const cmWrapper = editor.getWrapperElement();

    liveUpdateToggle.checked = localStorage.getItem('liveUpdateEnabled') !== 'false';

    const configureLiveUpdate = () => {
        editor.off("change", updateScene);
        if (liveUpdateToggle.checked) {
            editor.on("change", updateScene);
        }
    };

    configureLiveUpdate();
    liveUpdateToggle.addEventListener('change', function() {
        localStorage.setItem('liveUpdateEnabled', this.checked);
        configureLiveUpdate();
        if (this.checked) {
            updateScene();
        }
    });

    let fontSize = 14; 
    cmWrapper.addEventListener('wheel', e => { 
        if (e.ctrlKey) { 
            e.preventDefault(); 
            fontSize += e.deltaY > 0 ? -1 : 1; 
            fontSize = Math.max(8, Math.min(24, fontSize)); 
            cmWrapper.style.fontSize = fontSize + 'px'; 
            editor.refresh(); 
        } 
    });

    cmWrapper.addEventListener('wheel', e => { 
        if (e.shiftKey) { 
            e.preventDefault(); 
            editorOpacity += e.deltaY > 0 ? -0.05 : 0.05; 
            editorOpacity = Math.max(0.1, Math.min(1, editorOpacity)); 
            window.updateEditorBackground();
        } 
    });
    
    window.updateEditorBackground();
}