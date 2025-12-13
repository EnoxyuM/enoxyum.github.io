<div align="center">
  <h1>
    <a href="https://enoxyum.github.io">CodiuM</a>
  </h1>
</div>

I did changed shortcut for Switching between code editing and preview from Alt to Ctrl+Alt since it was conflicting with Alt+Tab a lot

## ⌨️ Keyboard & Mouse Shortcuts

### Editor
| Shortcut | Action |
| :--- | :--- |
| `Ctrl` + `Alt` | Switch between code editing and preview |
| `Esc` | Toggle Project menu |
| `Alt` + `Shift` | Toggle console |
| `Ctrl` + `S` | Save current project |
| `Ctrl` + `Mouse Wheel` | Increase/decrease the editor's font size |
| `Shift` + `Mouse Wheel` | Increase/decrease the editor's background opacity |
| `Ctrl` + `V` (When file in buffer) | Paste file in file panel |

### File Tabs
| Action | Description |
| :--- | :--- |
| **Middle Click** | Close tab |
| **Right Click** | Rename file |
| **Drag selected text to tabs** | Create file with this text and inject or tag |

### Project Menu (ESC)
| Action | Description |
| :--- | :--- |
| **Left Click** | Load project |
| **Middle Click** | Move project to Basket |
| **Right Click** | Rename project |

### Project files Menu (Click on 📁Project name to open)
| Action | Description |
| :--- | :--- |
| **Left Click** | Open file in tab |
| **Middle Click** | Move file to Basket |
| **Right Click** | Context Menu(New file, New folder, Rename) |
| **Drag and Drop** | any file/folder into another folder |

*   **RIGHT Click on "+"** or Drag and drop any file to upload it to project

## ✨ Features

*   **👓Full Screen Live Code Preview** You can toggle it in top left corner
*   **🎵🖼Multi-File Support:** Work with `index.html`, `.js`, `.css`, media and other files
*   **💾Projects saved** to your browser's IndexedDB. Create, load, rename, delete projects
*   **📋/📜Copy all files to/from clipboard(top right buttons)** Perfect for use with AI
*   **💉Code Injection:** `//<<"file name"` or drag text to tabs. It's like include, but better.
*   **📲Drag and Drop Code Injection:** select text in editor and drag it to tabs bar
*   **📟Console** that captures logs and errors from the live preview
*   **🔗Share as URL:** Share whole your project as URL link or as URL for preview
*   **▶Preview in new tab button** in top right corner. Let you preview without UI/HotKeys
*   **💱Export/import** any single project or export all your projects as a ZIP file
*   **🆎Project sorting** by creation date and change date
*   **🛸Tabs rearrangement** by drag and drop like a browser tabs
*   **🚀Code Editor:** Syntax highlighting, bracket matching, selection highlighting, etc
*   **🚽Basket:** Middle click on it to delete foreva or click to restore
*   **🎠Other:** Change editor font size and even the editor's background opacity on the fly
*   **🌈Theme Customization:** It's in ESC Menu bottom right corner

##  Advanced Features

### Code Injection

```javascript
//<<"File Name"
or
//<<"Folder Name/File Name"
```

This feature literally lets you add content of any Tab into another. Using this you can easily break your code into small pices.

For example, create `some.js` file and paste here any function or variable from your main file:
```javascript
// main.js
//<<"some.js"
console.log("yo " + x + Y);
```

You can "inject" it into your `main.js` file like this:
```javascript
// some.js
let x = 10;
const Y = 5;
function someFoo() { x = x * Y; }
```
It is very useful if you need to make code smaller without breaking it

The live preview will process this and execute the code as if `some.js` was written directly inside `main.js`. The system also detects and prevents circular dependencies.

### Project & Settings Management

*   **Projects:** All your code is saved in your browser's **IndexedDB**. This means your work is persistent across browser sessions on the same machine.
