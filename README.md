<div align="center">
  <h1>
    <a href="https://enoxyum.github.io/CodiuM/">CodiuM</a>
  </h1>
</div>

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
| **Middle Click** | Close tab |
| **Right Click** | Rename file |

### Project Menu (ESC)
| Action | Description |
| :--- | :--- |
| **Left Click** | Load project |
| **Middle Click** | Delete project |
| **Right Click** | Rename project |

### Project files Menu (Click on 📁Project name to open)
| Action | Description |
| :--- | :--- |
| **Left Click** | Open file in tab |
| **Middle Click** | Delete file |
| **Right Click** | Context Menu(New file, New folder, Rename) |
| **Drag and Drop** | any file/folder into another folder |

*   **RIGHT Click on "+"** or Drag and drop any file to upload it to project

## ✨ Features

*   **Full Screen Live Code Preview** You can toggle it in top left corner
*   **Multi-File Support:** Work with `index.html`, `.js`, `.css`, media🎵🖼 and other files
*   **Projects saved** to your browser's IndexedDB. Create, load, rename, delete projects
*   **Copy all files to/from clipboard with buttons 📋/📜** Perfect for use with AI
*   **Code Injection:** `//<<filename` It's like include, but better. Perfect for organizing
*   **Console** that captures logs and errors from the live preview
*   **Share as URL:** Share whole your project as URL link 🤯 or as URL for preview
*   **Preview in new tab button** in top right corner. Let you preview without UI/HotKeys
*   **Export/import** any single project or export all your projects as a ZIP file
*   **Project sorting** by creation date and change date
*   **Tabs rearrangement** by drag and drop like a browser tabs
*   **Code Editor:** Syntax highlighting, bracket matching, selection highlighting, etc
*   **Other:** Change editor font size and even the editor's background opacity on the fly
*   **Theme Customization:** It's in ESC Menu bottom right corner

##  Advanced Features

### Code Injection

```javascript
//<<FileName
or
//<<FolderName/FileName
```

This feature literally lets you add content of any Tab into another. Using this you can easily break your code into small pices.

For example, create `some.js` file and paste here any function or variable from your main file:
```javascript
// main.js
//<<some.js
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
