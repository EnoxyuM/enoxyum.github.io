# [CodiuM](https://enoxyum.github.io/CodiuM/Index.html)

## ⌨️ Keyboard & Mouse Shortcuts

### Editor
| Shortcut | Action |
| :--- | :--- |
| `Alt` | Switch between code editing and preview |
| `Esc` | Toggle Project menu |
| `Alt` + `Shift` | Toggle console |
| `Ctrl` + `S` | Save current project |
| `Ctrl` + `Mouse Wheel` | Increase/decrease the editor's font size |
| `Shift` + `Mouse Wheel` | Increase/decrease the editor's background opacity |

### File Tabs
| Action | Description |
| :--- | :--- |
| **Middle Click** | Close file tab |
| **Right Click** | Rename file |

### Project Menu (ESC)
| Action | Description |
| :--- | :--- |
| **Left Click** | Load project |
| **Middle Click** | Delete project |
| **Right Click** | Rename project |

## ✨ Features

*   **Live code preview** You can toggle it in top left corner
*   **Multi-File Support:** Work with `index.html`, `.js`, `.css` and other files
*   **Auto-Save** to your browser's IndexedDB. Create, load, rename, delete projects
*   **Code Injection:** `//<<filename` It's like include, but better. Perfect for organizing
*   **Console** that captures logs and errors from the live preview
*   **Code Editor:** Syntax highlighting, bracket matching, selection highlighting, etc
*   **Export** any single project or all your projects as a ZIP file
*   **Other:** Change editor font size and even the editor's background opacity on the fly
*   **Theme Customization:** It's in ESC Menu

## ✨ Updates

27.07.2025
*   **Project sorting** by creation date and change date
*   **Tabs rearrangement** by drag and drop like a browser tabs
*   **Current project scroll saving.** Now you don't have to scroll back again😀

##  Advanced Features

### Code Injection

```javascript
//<<FILE_NAME
```

This feature literally lets you add content of any Tab into another. Using this you can easily break your code into small pices.

For example, create `some.js` file and paste here any function or variable from your main file:
```javascript
// main.js
//<<some.js
console.log("yo " + x + Y);
```

You can "import" it into your `main.js` file like this:
```javascript
// some.js
let x = 10;
const Y = 5;
function someFoo() { x = x * Y; }
// a lot of functions and initializations moved here from main file
```
It is very useful if you need to make code smaller without breaking it

The live preview will process this and execute the code as if `some.js` was written directly inside `main.js`. The system also detects and prevents circular dependencies.

### Project & Settings Management

*   **Projects:** All your code is saved in your browser's **IndexedDB**. This means your work is persistent across browser sessions on the same machine.

*   **Editor Theme:** Your custom color preferences are saved in **LocalStorage**. You can export these settings via the `Export` button in the color picker menu to back them up or share them.
