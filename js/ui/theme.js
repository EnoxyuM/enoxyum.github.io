const colorTypes = { Comment: 'comment', Keyword: 'keyword', String: 'string', Number: 'number', Special: 'atom', Variable: 'variable', Property: 'property', Definition: 'def', Function: 'variable-2', Operator: 'operator', HTMLBracket: 'bracket', HighlightedBracket: 'matchingbracket', Class: 'variable-3', Regex: 'string-2', HTMLTag: 'tag', HTMLAttribute: 'attribute', OtherText: 'text' };
const defaultColors = {"Comment":"#04ff00","Keyword":"#0064ff","String":"#ffff00","Number":"#ffffff","Special":"#ff00ae","Variable":"#c880ff","Property":"#757ad7","Definition":"#ff8000","Function":"#00b3ff","Operator":"#ffffff","HTMLBracket":"#fe2aec","HighlightedBracket":"#ff0000","Class":"#00ff88","Regex":"#ff00ff","HTMLTag":"#00b3ff","HTMLAttribute":"#ff7aff","OtherText":"#878787"};

function changeColor(type) { 
    const color = document.getElementById(type).value; 
    const style = document.createElement('style'); 
    document.head.appendChild(style); 
    const sheet = style.sheet; 
    if (type === 'HighlightedBracket') {
        sheet.insertRule(`.cm-s-monokai .CodeMirror-${colorTypes[type]} { background-color: ${color} !important; color: #000000 !important; }`, 0); 
    } else if (type === 'OtherText') {
        sheet.insertRule(`.cm-s-monokai { color: ${color} !important; }`, 0); 
    } else {
        sheet.insertRule(`.cm-s-monokai span.cm-${colorTypes[type]} { color: ${color} !important; }`, 0); 
    }
    localStorage.setItem(`color-${type}`, color); 
}

function loadColors() { 
    for (const type in colorTypes) { 
        const color = localStorage.getItem(`color-${type}`) || defaultColors[type]; 
        if (color) { 
            document.getElementById(type).value = color; 
            changeColor(type); 
        } 
    } 
}

function exportSettings() { 
    const settings = {}; 
    for (const type in colorTypes) {
        settings[type] = localStorage.getItem(`color-${type}`);
    }
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(new Blob([JSON.stringify(settings)], {type: "application/json"})); 
    a.download = "code_editor_settings.json"; 
    a.click(); 
    URL.revokeObjectURL(a.href); 
}

function importSettings() { 
    const input = document.createElement('input'); 
    input.type = 'file'; 
    input.accept = '.json'; 
    input.onchange = e => { 
        const file = e.target.files[0]; 
        const reader = new FileReader(); 
        reader.onload = e => { 
            const settings = JSON.parse(e.target.result); 
            for (const type in settings) {
                if (colorTypes.hasOwnProperty(type)) { 
                    localStorage.setItem(`color-${type}`, settings[type]); 
                    document.getElementById(type).value = settings[type]; 
                    changeColor(type); 
                } 
            }
        }; 
        reader.readAsText(file); 
    }; 
    input.click(); 
}