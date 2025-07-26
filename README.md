# Full Screen Code Editor 2

## ✨ Features

*   **Live Reload:** See your changes instantly in the preview pane as you type
*   **Multi-File Support:** Work with `index.html`, `.js`, `.css` and other files
*   **Project Persistence:** All projects are automatically saved to your browser's IndexedDB. You can create, load, rename, and delete projects
*   **Code Injection:** Include one JS file within another using a special comment: `//<<filename`. This is perfect for organizing
*   **Console:** An in-app console that captures logs and errors from the live preview
*   **Code Editor:** Syntax highlighting, bracket matching, selection highlighting, line numbers
*   **Theme Customization:** It's in ESC Menu
*   **Export:** Export any single project or all your projects as a ZIP file
*   **Other:** Change editor font size and even the editor's background opacity on the fly


## ⌨️ Keyboard & Mouse Shortcuts

### General
| Shortcut | Action |
| :--- | :--- |
| `Alt` | Switch between code editing and preview |
| `Esc` | Toggle Project menu |
| `Alt` + `Shift` | Toggle console |
| `Ctrl` + `S` | Save current project |

### Editor
| Shortcut | Action |
| :--- | :--- |
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
