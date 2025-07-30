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
    editorElement.addEventListener('wheel', e => { 
        if (e.ctrlKey) { 
            e.preventDefault(); 
            fontSize += e.deltaY > 0 ? -1 : 1; 
            fontSize = Math.max(8, Math.min(24, fontSize)); 
            editorElement.style.fontSize = fontSize + 'px'; 
            editor.refresh(); 
        } 
    });

    let opacity = 0.5; 
    editorElement.addEventListener('wheel', e => { 
        if (e.shiftKey) { 
            e.preventDefault(); 
            opacity += e.deltaY > 0 ? -0.05 : 0.05; 
            opacity = Math.max(0.1, Math.min(1, opacity)); 
            editorElement.style.backgroundColor = `rgba(30, 30, 30, ${opacity})`; 
        } 
    });
}