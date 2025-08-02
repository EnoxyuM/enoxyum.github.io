function showInlineInput({ initialValue = '', placeholder = '', onSave, onCancel = () => {} }) {
    inlineInputContainer.style.display = 'block';
    inlineInputField.value = initialValue;
    inlineInputField.placeholder = placeholder;
    inlineInputField.focus();
    inlineInputField.select();

    const cleanup = () => {
        inlineInputContainer.style.display = 'none';
        inlineInputField.removeEventListener('keydown', handleKeydown);
        inlineInputField.removeEventListener('blur', handleBlur);
    };

    const handleSave = () => {
        const newValue = inlineInputField.value.trim();
        if (newValue) {
            onSave(newValue);
        } else {
            onCancel();
        }
        cleanup();
    };
    
    const handleCancel = () => {
        onCancel();
        cleanup();
    };

    const handleKeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    const handleBlur = () => {
        handleSave();
    };

    inlineInputField.addEventListener('keydown', handleKeydown);
    inlineInputField.addEventListener('blur', handleBlur);
}

function toggleMenu() { 
    if (menu.style.display === 'none' || menu.style.display === '') { 
        menu.style.display = 'flex'; 
        loadSavedCodes(); 
    } else { 
        menu.style.display = 'none'; 
        colorPicker.style.display = 'none'; 
    } 
}