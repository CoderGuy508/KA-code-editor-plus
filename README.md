# Khan Editor Plus (Tampermonkey)

This is the Tampermonkey rebuild of the local Khan Academy editor helper.

Files:
- `/Users/collinmarshall/Documents/platformer/tampermonkey-editor-plus-local/ka-editor-plus.user.js`

Install:
1. Open Tampermonkey in Chrome.
2. Create a new script.
3. Replace the default contents with `ka-editor-plus.user.js`.
4. Save the script.
5. Open or refresh a Khan Academy program page.

What this version does:
- applies a VS Code-inspired editor theme
- adds a lightweight sidebar under the editor
- includes quick snippet buttons
- shows a small reference panel
- shows a status bar with line/error/warning counts
- adds an optional error coach panel

Tampermonkey menu commands:
- enable or disable the theme
- enable or disable snippets
- enable or disable the reference panel
- enable or disable the error coach

Notes:
- this stays local in your browser
- it does not patch Ace internals
- it avoids the popup/settings UI from the extension version
