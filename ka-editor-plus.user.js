// ==UserScript==
// @name         Khan Ace VS Theme
// @namespace    https://local.platformer/
// @version      2.1.0
// @description  Apply a lightweight VS Code-like theme to the Khan Academy Ace editor with safe auto-pairs and hover tips.
// @author       Collin
// @match        *://www.khanacademy.org/*
// @match        *://khanacademy.org/*
// @match        *://*.khanacademy.org/*
// @include      *://*.khanacademy.org/*
// @require      https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const STYLE_ID = "ka-vs-theme-style";
  const READY_CLASS = "ka-vs-theme-ready";
  const TOOLTIP_ID = "ka-vs-theme-tooltip";
  const PANEL_ID = "ka-vs-theme-panel";
  const TOOLBAR_ID = "ka-vs-theme-toolbar";
  const GHOST_HIGHLIGHT_CLASS = "ka-vs-theme-ghost-highlight";
  const ENCLOSURE_PAIRS = {
    "(": ")",
    "[": "]",
    "{": "}",
    "\"": "\"",
    "'": "'"
  };
  const CLOSING_ENCLOSURES = {
    ")": "(",
    "]": "[",
    "}": "{",
    "\"": "\"",
    "'": "'"
  };
  const GHOST_SYMBOL_CHARS = "+-=*!@#$%^&_;";
  const PAIRS = {
    "\"": "\"",
    "'": "'",
    "(": ")",
    "[": "]",
    "{": "}"
  };
  const DOCS = {
    smooth: {
      signature: "smooth()",
      summary: "Turns on smoother drawing for shapes and text.",
      tip: "Useful for cleaner-looking curves and diagonals."
    },
    background: {
      signature: "background(r, g, b)",
      summary: "Clears the canvas to a color before drawing the next frame.",
      tip: "Use it every frame inside draw() for animation."
    },
    fill: {
      signature: "fill(r, g, b)",
      summary: "Sets the inside color for shapes and text.",
      tip: "Use noFill() when you only want outlines."
    },
    nofill: {
      signature: "noFill()",
      summary: "Turns off shape fill color.",
      tip: "Useful when you only want outlines."
    },
    stroke: {
      signature: "stroke(r, g, b)",
      summary: "Sets the outline color for shapes and lines.",
      tip: "Pair it with strokeWeight() to make lines easier to see."
    },
    nostroke: {
      signature: "noStroke()",
      summary: "Turns off outlines for shapes.",
      tip: "Use it when you want cleaner flat fills."
    },
    strokeweight: {
      signature: "strokeWeight(size)",
      summary: "Changes line and outline thickness.",
      tip: "Higher values make lines easier to see."
    },
    rect: {
      signature: "rect(x, y, w, h)",
      summary: "Draws a rectangle from the top-left corner.",
      tip: "Add a fifth value for rounded corners."
    },
    ellipse: {
      signature: "ellipse(x, y, w, h)",
      summary: "Draws an ellipse centered at x and y.",
      tip: "A circle is ellipse(x, y, size, size)."
    },
    line: {
      signature: "line(x1, y1, x2, y2)",
      summary: "Draws a straight line between two points.",
      tip: "Use strokeWeight() if the line looks too thin."
    },
    text: {
      signature: "text(str, x, y)",
      summary: "Draws text on the canvas.",
      tip: "Use textSize() and textAlign() to improve placement."
    },
    textalign: {
      signature: "textAlign(xAlign, yAlign)",
      summary: "Controls how text is aligned around its x and y position.",
      tip: "CENTER, CENTER is handy for centered labels."
    },
    textsize: {
      signature: "textSize(size)",
      summary: "Sets the font size used by text().",
      tip: "Call it before text() when you want larger or smaller labels."
    },
    get: {
      signature: "get(x, y, w, h)",
      summary: "Reads pixels from the canvas or snapshots the whole canvas with get().",
      tip: "Calling get() with no arguments grabs the current canvas image."
    },
    random: {
      signature: "random(min, max)",
      summary: "Returns a random number in a range.",
      tip: "Wrap it in floor() when you need a whole number."
    },
    mousex: {
      signature: "mouseX",
      summary: "The current mouse x position on the canvas.",
      tip: "Pair it with mouseY for hover and drawing interactions."
    },
    mousey: {
      signature: "mouseY",
      summary: "The current mouse y position on the canvas.",
      tip: "It updates every frame while the mouse moves."
    },
    draw: {
      signature: "draw = function() { }",
      summary: "Runs repeatedly to animate your program.",
      tip: "Keep draw() small and fast when possible."
    },
    width: {
      signature: "width",
      summary: "Current canvas width.",
      tip: "Use width / 2 to center horizontally."
    },
    height: {
      signature: "height",
      summary: "Current canvas height.",
      tip: "Use height / 2 to center vertically."
    }
  };
  let currentHost = null;
  let queued = false;
  let jumpStack = [];
  const ghostHighlightMarkersByEditor = new WeakMap();
  const autoPairEntriesByEditor = new WeakMap();

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }

    style.textContent = `
      .${READY_CLASS} {
        border: 1px solid #2d2d30 !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.22) !important;
      }

      .${READY_CLASS},
      .${READY_CLASS} .ace_scroller,
      .${READY_CLASS} .ace_content {
        background: #1e1e1e !important;
      }

      .${READY_CLASS} .ace_gutter {
        background: #1e1e1e !important;
        color: #858585 !important;
        border-right: 1px solid #2d2d30 !important;
      }

      .${READY_CLASS} .ace_gutter-active-line,
      .${READY_CLASS} .ace_active-line {
        background: #2a2d2e !important;
      }

      .${READY_CLASS} .ace_marker-layer .ace_selection {
        background: rgba(52, 103, 169, 0.9) !important;
      }

      .${READY_CLASS} .ace_marker-layer .ace_selected-word {
        border: 1px solid rgba(125, 211, 252, 0.55) !important;
        background: rgba(125, 211, 252, 0.14) !important;
      }

      .${READY_CLASS} .ace_marker-layer .ace_bracket {
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        background: rgba(255, 255, 255, 0.08) !important;
      }

      .${READY_CLASS} .ace_cursor {
        color: #aeafad !important;
      }

      .${READY_CLASS} .ace_print-margin {
        width: 1px !important;
        background: #2d2d30 !important;
      }

      .${READY_CLASS} .ace_text-layer,
      .${READY_CLASS} .ace_line,
      .${READY_CLASS} .ace_line span {
        color: #d4d4d4 !important;
        text-shadow: none !important;
      }

      .${READY_CLASS} .ace_keyword,
      .${READY_CLASS} .ace_meta,
      .${READY_CLASS} .ace_storage {
        color: #c586c0 !important;
        font-weight: 600 !important;
      }

      .${READY_CLASS} .ace_support,
      .${READY_CLASS} .ace_support.ace_function,
      .${READY_CLASS} .ace_entity.ace_name.ace_function {
        color: #ffd166 !important;
      }

      .${READY_CLASS} .ace_string {
        color: #f78c6c !important;
      }

      .${READY_CLASS} .ace_constant,
      .${READY_CLASS} .ace_constant.ace_numeric {
        color: #b5cea8 !important;
      }

      .${READY_CLASS} .ace_constant.ace_language,
      .${READY_CLASS} .ace_constant.ace_character,
      .${READY_CLASS} .ace_constant.ace_other {
        color: #82aaff !important;
      }

      .${READY_CLASS} .ace_comment {
        color: #7bc379 !important;
        font-style: italic !important;
      }

      .${READY_CLASS} .ace_variable,
      .${READY_CLASS} .ace_identifier {
        color: #7fdbff !important;
      }

      .${READY_CLASS} .ace_variable.ace_parameter {
        color: #ffcb6b !important;
      }

      .${READY_CLASS} .ace_storage.ace_type {
        color: #4ec9b0 !important;
      }

      .${READY_CLASS} .ace_keyword.ace_operator,
      .${READY_CLASS} .ace_punctuation.ace_operator,
      .${READY_CLASS} .ace_paren {
        color: #f07178 !important;
      }

      .${READY_CLASS} .ace_punctuation,
      .${READY_CLASS} .ace_paren.ace_lparen,
      .${READY_CLASS} .ace_paren.ace_rparen {
        color: #89ddff !important;
      }

      .${READY_CLASS} .ace_support.ace_class,
      .${READY_CLASS} .ace_entity.ace_name.ace_type {
        color: #82aaff !important;
      }

      .${READY_CLASS} .ace_string.ace_regexp {
        color: #c3e88d !important;
      }

      .${READY_CLASS} .ace_invalid {
        color: #f48771 !important;
        background: rgba(244, 135, 113, 0.16) !important;
      }

      .${READY_CLASS} .ace_marker-layer .${GHOST_HIGHLIGHT_CLASS} {
        position: absolute;
        border-radius: 4px;
        background: repeating-linear-gradient(
          135deg,
          rgba(150, 176, 205, 0.28) 0 6px,
          rgba(100, 128, 156, 0.24) 6px 12px
        ) !important;
        box-shadow:
          inset 0 0 0 1px rgba(185, 210, 236, 0.58),
          0 0 0 1px rgba(107, 142, 176, 0.3),
          0 0 12px rgba(114, 150, 186, 0.16);
      }

      #${TOOLTIP_ID} {
        position: fixed;
        z-index: 2147483647;
        max-width: 320px;
        padding: 10px 12px;
        border: 1px solid #2d2d30;
        border-radius: 8px;
        background: rgba(30, 30, 30, 0.98);
        color: #d4d4d4;
        box-shadow: 0 16px 32px rgba(0, 0, 0, 0.28);
        pointer-events: none;
        font: 12px/1.4 "Segoe UI", sans-serif;
      }

      #${TOOLTIP_ID}.is-hidden {
        display: none !important;
      }

      #${TOOLTIP_ID} .ka-vs-theme-tooltip-title {
        margin: 0 0 6px;
        color: #dcdcaa;
        font: 700 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      #${TOOLTIP_ID} .ka-vs-theme-tooltip-copy {
        margin: 0;
        color: #d4d4d4;
      }

      #${TOOLTIP_ID} .ka-vs-theme-tooltip-copy + .ka-vs-theme-tooltip-copy {
        margin-top: 6px;
        color: #9cdcfe;
      }

      #${PANEL_ID} {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        width: min(420px, calc(100vw - 32px));
        max-height: min(60vh, 520px);
        overflow: auto;
        border: 1px solid #2d2d30;
        border-radius: 10px;
        background: rgba(30, 30, 30, 0.98);
        color: #d4d4d4;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
        font: 12px/1.45 "Segoe UI", sans-serif;
      }

      #${PANEL_ID}.is-hidden {
        display: none !important;
      }

      .ka-vs-theme-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border-bottom: 1px solid #2d2d30;
      }

      .ka-vs-theme-panel-title {
        margin: 0;
        color: #9cdcfe;
        font-weight: 700;
      }

      .ka-vs-theme-panel-close {
        border: 1px solid #3c3c3c;
        border-radius: 6px;
        padding: 4px 8px;
        background: #252526;
        color: #d4d4d4;
        cursor: pointer;
      }

      .ka-vs-theme-panel-body {
        padding: 8px 0;
      }

      .ka-vs-theme-panel-item {
        display: block;
        width: 100%;
        border: 0;
        border-bottom: 1px solid #252526;
        padding: 10px 12px;
        background: transparent;
        color: #d4d4d4;
        text-align: left;
        cursor: pointer;
      }

      .ka-vs-theme-panel-item:hover {
        background: rgba(86, 156, 214, 0.12);
      }

      .ka-vs-theme-panel-line {
        margin: 0 0 4px;
        color: #dcdcaa;
        font: 700 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .ka-vs-theme-panel-copy {
        margin: 0;
        color: #b9c2cf;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #${TOOLBAR_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px;
        border: 1px solid #2d2d30;
        border-radius: 8px;
        background: rgba(30, 30, 30, 0.98);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
        max-width: min(520px, calc(100vw - 32px));
      }

      #${TOOLBAR_ID}.is-hidden {
        display: none !important;
      }

      .ka-vs-theme-toolbar-button {
        border: 1px solid #3c3c3c;
        border-radius: 6px;
        padding: 7px 10px;
        background: #252526;
        color: #d4d4d4;
        font: 600 12px/1.2 "Segoe UI", sans-serif;
        cursor: pointer;
      }

      .ka-vs-theme-toolbar-button:hover {
        border-color: #569cd6;
        background: #2f3136;
      }
    `;
  }

  function findEditorHost() {
    return document.querySelector(".scratchpad-ace-editor, .ace_editor");
  }

  function getAceEditor(host) {
    if (!(host instanceof HTMLElement)) {
      return null;
    }

    if (host.env && host.env.editor) {
      return host.env.editor;
    }

    if (typeof window.ace?.edit === "function") {
      try {
        return window.ace.edit(host);
      } catch {
        return null;
      }
    }

    return null;
  }

  function ensureTooltip() {
    let tooltip = document.getElementById(TOOLTIP_ID);
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = TOOLTIP_ID;
      tooltip.className = "is-hidden";
      document.documentElement.appendChild(tooltip);
    }

    return tooltip;
  }

  function hideTooltip() {
    const tooltip = document.getElementById(TOOLTIP_ID);
    if (tooltip) {
      tooltip.classList.add("is-hidden");
    }
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      panel.className = "is-hidden";
      document.documentElement.appendChild(panel);
    }

    return panel;
  }

  function ensureToolbar(host) {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) {
      toolbar = document.createElement("section");
      toolbar.id = TOOLBAR_ID;
      document.documentElement.appendChild(toolbar);
    }

    return toolbar;
  }

  function hidePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.classList.add("is-hidden");
      panel.innerHTML = "";
    }
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getWordAtCursor(editor) {
    const selected = editor.getSelectedText().trim();
    if (/^[A-Za-z_$][\w$]*$/.test(selected)) {
      return selected;
    }

    const cursor = editor.getCursorPosition();
    return getWordTargetAtPosition(editor, cursor, true)?.symbol || "";
  }

  function getDocumentText(editor) {
    return editor.session.getValue();
  }

  function getRangeCtor(editor) {
    const selectionRange = typeof editor?.getSelectionRange === "function" ? editor.getSelectionRange() : null;
    if (selectionRange && typeof selectionRange.constructor === "function") {
      return selectionRange.constructor;
    }

    return window.ace?.require?.("ace/range")?.Range
      || window.ace?.acequire?.("ace/range")?.Range
      || null;
  }

  function isWordChar(character) {
    return /[A-Za-z0-9_$]/.test(character || "");
  }

  function isEscaped(line, index) {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
      backslashes += 1;
    }
    return backslashes % 2 === 1;
  }

  function getWordRangeInLine(line, column, preferLeft = false) {
    let index = column;
    if (!isWordChar(line[index]) && preferLeft && column > 0 && isWordChar(line[column - 1])) {
      index = column - 1;
    }

    if (!isWordChar(line[index])) {
      return null;
    }

    let start = index;
    let end = index + 1;
    while (start > 0 && isWordChar(line[start - 1])) {
      start -= 1;
    }
    while (end < line.length && isWordChar(line[end])) {
      end += 1;
    }

    const word = line.slice(start, end);
    if (!/^[A-Za-z_$][\w$]*$/.test(word)) {
      return null;
    }

    return { word, start, end };
  }

  function getWordTargetAtPosition(editor, position, preferLeft = false) {
    const line = editor.session.getLine(position.row) || "";
    const range = getWordRangeInLine(line, position.column, preferLeft);
    if (!range) {
      return null;
    }

    return {
      type: "word",
      symbol: range.word,
      start: { row: position.row, column: range.start },
      end: { row: position.row, column: range.end },
      startIndex: positionToIndex(editor, { row: position.row, column: range.start }),
      endIndex: positionToIndex(editor, { row: position.row, column: range.end })
    };
  }

  function getSymbolTargetAtPosition(editor, position, preferLeft = false) {
    const line = editor.session.getLine(position.row) || "";
    let column = position.column;
    let symbol = line[column] || "";

    if (!GHOST_SYMBOL_CHARS.includes(symbol) && preferLeft && column > 0) {
      column -= 1;
      symbol = line[column] || "";
    }

    if (!GHOST_SYMBOL_CHARS.includes(symbol)) {
      return null;
    }

    return {
      type: "symbol",
      symbol,
      row: position.row,
      column,
      start: { row: position.row, column },
      end: { row: position.row, column: column + 1 },
      startIndex: positionToIndex(editor, { row: position.row, column }),
      endIndex: positionToIndex(editor, { row: position.row, column: column + 1 })
    };
  }

  function buildDocumentEnclosurePairs(editor) {
    const text = getDocumentText(editor);
    const stack = [];
    const pairs = [];

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const top = stack[stack.length - 1];

      if ((character === "\"" || character === "'") && !isEscaped(text, index)) {
        if (top && top.symbol === character) {
          const open = stack.pop();
          pairs.push({
            openIndex: open.index,
            closeIndex: index,
            openSymbol: character,
            closeSymbol: character
          });
        } else {
          stack.push({ symbol: character, index });
        }
        continue;
      }

      if (top && (top.symbol === "\"" || top.symbol === "'")) {
        continue;
      }

      if (ENCLOSURE_PAIRS[character] && character !== "\"" && character !== "'") {
        stack.push({ symbol: character, index });
        continue;
      }

      if (CLOSING_ENCLOSURES[character] && character !== "\"" && character !== "'") {
        if (top && top.symbol === CLOSING_ENCLOSURES[character]) {
          const open = stack.pop();
          pairs.push({
            openIndex: open.index,
            closeIndex: index,
            openSymbol: open.symbol,
            closeSymbol: character
          });
        }
      }
    }

    return pairs;
  }

  function findEnclosingPairAtIndex(pairs, index) {
    let bestPair = null;

    pairs.forEach((pair) => {
      if (pair.openIndex < index && index <= pair.closeIndex) {
        if (!bestPair || pair.closeIndex - pair.openIndex < bestPair.closeIndex - bestPair.openIndex) {
          bestPair = pair;
        }
      }
    });

    return bestPair;
  }

  function positionToIndex(editor, position) {
    return editor.session.doc.positionToIndex(position, 0);
  }

  function indexToPosition(editor, index) {
    return editor.session.doc.indexToPosition(index, 0);
  }

  function getLinePreview(editor, row) {
    return (editor.session.getLine(row) || "").trim() || "(blank line)";
  }

  function jumpToPosition(editor, position, remember = true) {
    if (remember) {
      jumpStack.push(editor.getCursorPosition());
    }

    editor.clearSelection();
    editor.moveCursorTo(position.row, position.column);
    editor.scrollToLine(position.row, true, true, function () {});
    editor.focus();
  }

  function findDefinition(editor, symbol) {
    if (!symbol) {
      return null;
    }

    const text = getDocumentText(editor);
    const escaped = escapeRegExp(symbol);
    const patterns = [
      new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`, "g"),
      new RegExp(`\\b(?:var|let|const)\\s+${escaped}\\s*=\\s*function\\b`, "g"),
      new RegExp(`\\b(?:var|let|const)\\s+${escaped}\\b`, "g"),
      new RegExp(`\\b${escaped}\\s*:\\s*function\\b`, "g")
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) {
        return indexToPosition(editor, match.index);
      }
    }

    return null;
  }

  function findReferences(editor, symbol) {
    if (!symbol) {
      return [];
    }

    const text = getDocumentText(editor);
    const pattern = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g");
    const results = [];
    let match;

    while ((match = pattern.exec(text))) {
      const position = indexToPosition(editor, match.index);
      results.push({
        row: position.row,
        column: position.column,
        preview: getLinePreview(editor, position.row)
      });
    }

    return results;
  }

  function replaceFullDocument(editor, nextText) {
    const RangeCtor = getRangeCtor(editor);
    if (RangeCtor) {
      const lastRow = Math.max(editor.session.getLength() - 1, 0);
      const lastLine = editor.session.getLine(lastRow) || "";
      const range = new RangeCtor(0, 0, lastRow, lastLine.length);
      editor.session.replace(range, nextText);
      return;
    }

    editor.setValue(nextText, -1);
  }

  function showToast(message) {
    const panel = ensurePanel();
    panel.innerHTML = `
      <div class="ka-vs-theme-panel-head">
        <p class="ka-vs-theme-panel-title">Editor Plus</p>
        <button type="button" class="ka-vs-theme-panel-close">Close</button>
      </div>
      <div class="ka-vs-theme-panel-body">
        <button type="button" class="ka-vs-theme-panel-item">
          <p class="ka-vs-theme-panel-line">${message}</p>
          <p class="ka-vs-theme-panel-copy">Use the toolbar under the editor for definition, back, references, rename, format, and lint.</p>
        </button>
      </div>
    `;
    panel.classList.remove("is-hidden");
    panel.querySelector(".ka-vs-theme-panel-close")?.addEventListener("click", hidePanel);
    window.setTimeout(() => {
      const current = document.getElementById(PANEL_ID);
      if (current && current.textContent?.includes(message)) {
        hidePanel();
      }
    }, 2200);
  }

  function showReferencePanel(editor, symbol, references) {
    const panel = ensurePanel();
    panel.innerHTML = `
      <div class="ka-vs-theme-panel-head">
        <p class="ka-vs-theme-panel-title">References for ${symbol}</p>
        <button type="button" class="ka-vs-theme-panel-close">Close</button>
      </div>
      <div class="ka-vs-theme-panel-body">
        ${references
          .slice(0, 100)
          .map(
            (ref, index) => `
              <button type="button" class="ka-vs-theme-panel-item" data-ref-index="${index}">
                <p class="ka-vs-theme-panel-line">Line ${ref.row + 1}, Column ${ref.column + 1}</p>
                <p class="ka-vs-theme-panel-copy">${ref.preview}</p>
              </button>
            `
          )
          .join("")}
      </div>
    `;
    panel.classList.remove("is-hidden");
    panel.querySelector(".ka-vs-theme-panel-close")?.addEventListener("click", hidePanel);
    panel.querySelectorAll("[data-ref-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number.parseInt(button.getAttribute("data-ref-index") || "", 10);
        const ref = references[index];
        if (!ref) {
          return;
        }

        hidePanel();
        jumpToPosition(editor, { row: ref.row, column: ref.column });
      });
    });
  }

  function getDocMarkup(doc) {
    return `
      <p class="ka-vs-theme-tooltip-title">${doc.signature}</p>
      <p class="ka-vs-theme-tooltip-copy">${doc.summary}</p>
      <p class="ka-vs-theme-tooltip-copy">Hint: ${doc.tip}</p>
    `;
  }

  function bindTooltips(host) {
    if (!(host instanceof HTMLElement) || host.dataset.kaVsThemeTooltipsBound === "true") {
      return;
    }

    const tooltip = ensureTooltip();
    const tokenSelector = ".ace_text-layer span";

    function findTokenElement(target) {
      if (target instanceof HTMLElement) {
        return target.closest(tokenSelector);
      }

      if (target instanceof Text) {
        return target.parentElement?.closest(tokenSelector) || null;
      }

      return null;
    }

    host.addEventListener("mousemove", (event) => {
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      const token = findTokenElement(hovered) || findTokenElement(event.target);
      const rawText = String(token?.textContent || "").replace(/\u00a0/g, " ").trim();
      const clean = rawText.toLowerCase().replace(/[^a-z0-9_]/g, "");
      const doc = clean ? DOCS[clean] : null;

      if (!doc) {
        tooltip.classList.add("is-hidden");
        return;
      }

      tooltip.innerHTML = getDocMarkup(doc);
      tooltip.classList.remove("is-hidden");
      tooltip.style.left = `${event.clientX + 16}px`;
      tooltip.style.top = `${event.clientY + 16}px`;
    });

    host.addEventListener("mouseleave", hideTooltip);
    host.dataset.kaVsThemeTooltipsBound = "true";
  }

  function bindAutoPairs(host) {
    if (!(host instanceof HTMLElement) || host.dataset.kaVsThemePairsBound === "true") {
      return;
    }

    const input = host.querySelector("textarea.ace_text-input");
    const editor = getAceEditor(host);
    if (!(input instanceof HTMLTextAreaElement) || !editor) {
      return;
    }

    function getAutoPairEntries() {
      const existing = autoPairEntriesByEditor.get(editor);
      if (existing) {
        return existing;
      }

      const created = [];
      autoPairEntriesByEditor.set(editor, created);
      return created;
    }

    function rememberAutoPair(position, open, close) {
      const doc = editor.session?.doc;
      if (!doc?.createAnchor) {
        return;
      }

      const openAnchor = doc.createAnchor(position.row, position.column);
      const closeAnchor = doc.createAnchor(position.row, position.column + 1);
      getAutoPairEntries().push({ open, close, openAnchor, closeAnchor });
    }

    function consumeAutoPairAtCursor(cursor) {
      const entries = getAutoPairEntries();
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (
          entry.openAnchor.row !== cursor.row
          || entry.closeAnchor.row !== cursor.row
          || entry.openAnchor.column !== cursor.column - 1
          || entry.closeAnchor.column !== cursor.column
        ) {
          continue;
        }

        const line = editor.session.getLine(cursor.row) || "";
        if (line[cursor.column - 1] !== entry.open || line[cursor.column] !== entry.close) {
          entry.openAnchor.detach?.();
          entry.closeAnchor.detach?.();
          entries.splice(index, 1);
          continue;
        }

        entry.openAnchor.detach?.();
        entry.closeAnchor.detach?.();
        entries.splice(index, 1);
        return entry;
      }

      return null;
    }

    input.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key === "Backspace") {
        const selection = editor.getSelectionRange();
        if (!selection || !selection.isEmpty()) {
          return;
        }

        const cursor = editor.getCursorPosition();
        const line = editor.session.getLine(cursor.row) || "";
        const pairEntry = consumeAutoPairAtCursor(cursor);
        if (!pairEntry) {
          return;
        }

        const RangeCtor = getRangeCtor(editor);
        if (!RangeCtor) {
          return;
        }

        event.preventDefault();
        editor.session.remove(new RangeCtor(cursor.row, cursor.column - 1, cursor.row, cursor.column + 1));
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      const open = event.key;
      const close = PAIRS[open];
      if (!close) {
        if (Object.values(PAIRS).includes(open)) {
          const cursor = editor.getCursorPosition();
          const line = editor.session.getLine(cursor.row) || "";
          const nextChar = line[cursor.column] || "";
          if (nextChar === open) {
            event.preventDefault();
            editor.navigateRight(1);
          }
        }
        return;
      }

      const selection = editor.getSelectionRange();
      const selectedText = editor.session.getTextRange(selection);
      const cursor = editor.getCursorPosition();

      event.preventDefault();

      if (selectedText) {
        editor.session.replace(selection, `${open}${selectedText}${close}`);
        return;
      }

      const line = editor.session.getLine(cursor.row) || "";
      const nextChar = line[cursor.column] || "";
      if (nextChar === close) {
        editor.insert(open);
        return;
      }

      editor.insert(`${open}${close}`);
      rememberAutoPair(cursor, open, close);
      editor.navigateLeft(1);
    });

    host.dataset.kaVsThemePairsBound = "true";
  }

  function clearGhostHighlights(editor) {
    if (!editor?.session) {
      return;
    }

    const markerIds = ghostHighlightMarkersByEditor.get(editor) || [];
    markerIds.forEach((markerId) => {
      try {
        editor.session.removeMarker(markerId);
      } catch {
        // Ignore stale markers.
      }
    });
    ghostHighlightMarkersByEditor.set(editor, []);
  }

  function addGhostMarker(editor, markerIds, seenRanges, start, end) {
    const startIndex = positionToIndex(editor, start);
    const endIndex = positionToIndex(editor, end);
    if (endIndex <= startIndex) {
      return;
    }

    const key = `${startIndex}:${endIndex}`;
    if (seenRanges.has(key)) {
      return;
    }

    const RangeCtor = getRangeCtor(editor);
    if (!RangeCtor) {
      return;
    }

    const range = new RangeCtor(start.row, start.column, end.row, end.column);
    const markerId = editor.session.addMarker(range, GHOST_HIGHLIGHT_CLASS, "text", true);
    markerIds.push(markerId);
    seenRanges.add(key);
  }

  function addGhostMarkerByIndexes(editor, markerIds, seenRanges, startIndex, endIndex) {
    if (endIndex <= startIndex) {
      return;
    }

    const start = indexToPosition(editor, startIndex);
    const end = indexToPosition(editor, endIndex);
    addGhostMarker(editor, markerIds, seenRanges, start, end);
  }

  function addWordGhosts(editor, markerIds, seenRanges, target, includeCurrent) {
    if (!target || target.type !== "word") {
      return;
    }

    const text = getDocumentText(editor);
    const pattern = new RegExp(`\\b${escapeRegExp(target.symbol)}\\b`, "g");
    let match;

    while ((match = pattern.exec(text))) {
      const matchStart = match.index;
      const matchEnd = match.index + target.symbol.length;
      if (!includeCurrent && matchStart === target.startIndex && matchEnd === target.endIndex) {
        continue;
      }
      addGhostMarkerByIndexes(editor, markerIds, seenRanges, matchStart, matchEnd);
    }
  }

  function addSymbolGhosts(editor, markerIds, seenRanges, target, includeCurrent) {
    if (!target || target.type !== "symbol") {
      return;
    }

    const text = getDocumentText(editor);
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== target.symbol) {
        continue;
      }
      if (!includeCurrent && index === target.startIndex) {
        continue;
      }
      addGhostMarkerByIndexes(editor, markerIds, seenRanges, index, index + 1);
    }
  }

  function addEnclosureGhosts(editor, markerIds, seenRanges, pair) {
    if (!pair) {
      return;
    }

    addGhostMarkerByIndexes(editor, markerIds, seenRanges, pair.openIndex, pair.openIndex + 1);
    addGhostMarkerByIndexes(editor, markerIds, seenRanges, pair.closeIndex, pair.closeIndex + 1);
  }

  function updateGhostHighlights(editor) {
    clearGhostHighlights(editor);

    const markerIds = [];
    const seenRanges = new Set();
    const selection = editor.getSelectionRange();
    const cursor = editor.getCursorPosition();
    const cursorIndex = positionToIndex(editor, cursor);
    const enclosurePairs = buildDocumentEnclosurePairs(editor);
    let activeWordTarget = null;
    let activeSymbolTarget = null;

    if (selection && !selection.isEmpty()) {
      const selectedText = editor.getSelectedText().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(selectedText)) {
        activeWordTarget = {
          type: "word",
          symbol: selectedText,
          start: selection.start,
          end: selection.end,
          startIndex: positionToIndex(editor, selection.start),
          endIndex: positionToIndex(editor, selection.end)
        };
      }
    } else {
      activeWordTarget = getWordTargetAtPosition(editor, cursor, true);
      activeSymbolTarget = getSymbolTargetAtPosition(editor, cursor, true);
    }

    addWordGhosts(editor, markerIds, seenRanges, activeWordTarget, !selection || selection.isEmpty());
    addSymbolGhosts(editor, markerIds, seenRanges, activeSymbolTarget, true);

    const cursorPair = findEnclosingPairAtIndex(enclosurePairs, cursorIndex);
    if (cursorPair) {
      addEnclosureGhosts(editor, markerIds, seenRanges, cursorPair);
    }

    ghostHighlightMarkersByEditor.set(editor, markerIds);
  }

  function bindSelectionHighlights(host) {
    if (!(host instanceof HTMLElement) || host.dataset.kaVsThemeGhostBound === "true") {
      return;
    }

    const editor = getAceEditor(host);
    if (!editor) {
      return;
    }

    const repaint = () => {
      updateGhostHighlights(editor);
    };

    editor.selection.on("changeSelection", repaint);
    editor.selection.on("changeCursor", repaint);
    editor.session.on("change", repaint);
    host.addEventListener("mouseup", () => {
      window.setTimeout(repaint, 0);
    });
    host.dataset.kaVsThemeGhostBound = "true";
    repaint();
  }

  function getAnnotations(editor) {
    try {
      return editor.session.getAnnotations() || [];
    } catch {
      return [];
    }
  }

  function summarizeLint(editor) {
    const annotations = getAnnotations(editor);
    const errors = annotations.filter((item) => item.type === "error");
    const warnings = annotations.filter((item) => item.type === "warning");
    if (!annotations.length) {
      showToast("No Ace syntax warnings or errors found.");
      return;
    }

    const first = annotations[0];
    showToast(`${errors.length} error(s), ${warnings.length} warning(s). First issue: line ${Number(first.row) + 1} - ${first.text}`);
  }

  function formatDocument(editor) {
    const fullText = getDocumentText(editor);

    try {
      const formatter = globalThis.js_beautify;
      if (typeof formatter === "function") {
        const formatted = formatter(fullText, {
          indent_size: 4,
          indent_char: " ",
          preserve_newlines: true,
          max_preserve_newlines: 2,
          space_in_empty_paren: false,
          end_with_newline: false
        });

        if (formatted && formatted !== fullText) {
          replaceFullDocument(editor, formatted);
        }

        showToast("Formatted with js-beautify.");
        return;
      }
    } catch {
      // Fall through to Ace-based formatting if the external formatter is unavailable.
    }

    try {
      if (typeof editor.execCommand === "function") {
        editor.execCommand("beautify");
        showToast("Formatted with Ace beautify.");
        return;
      }
    } catch {
      // Ignore.
    }

    try {
      const beautify = window.ace?.require?.("ace/ext/beautify");
      if (beautify?.beautify) {
        beautify.beautify(editor.session);
        showToast("Formatted with Ace beautify.");
        return;
      }
    } catch {
      // Ignore.
    }

    showToast("Formatter failed to load on this page.");
  }

  function runRename(editor) {
    const symbol = getWordAtCursor(editor);
    if (!symbol) {
      showToast("Select or place the cursor on a symbol first.");
      return;
    }

    const nextName = window.prompt(`Rename "${symbol}" to:`, symbol);
    if (!nextName || nextName === symbol) {
      return;
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(nextName)) {
      showToast("Rename cancelled: invalid identifier.");
      return;
    }

    const text = getDocumentText(editor);
    const updated = text.replace(new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g"), nextName);
    replaceFullDocument(editor, updated);
    showToast(`Renamed ${symbol} to ${nextName} in this file.`);
  }

  function runDefinition(editor) {
    const symbol = getWordAtCursor(editor);
    const definition = findDefinition(editor, symbol);
    if (!definition) {
      showToast(`No definition found for ${symbol || "current symbol"}.`);
      return;
    }
    jumpToPosition(editor, definition);
  }

  function runBack(editor) {
    const previous = jumpStack.pop();
    if (!previous) {
      showToast("No previous jump location.");
      return;
    }
    jumpToPosition(editor, previous, false);
  }

  function runReferences(editor) {
    const symbol = getWordAtCursor(editor);
    if (!symbol) {
      showToast("Select or place the cursor on a symbol first.");
      return;
    }

    const references = findReferences(editor, symbol);
    if (!references.length) {
      showToast(`No references found for ${symbol}.`);
      return;
    }

    showReferencePanel(editor, symbol, references);
  }

  function bindEditorButtons(host) {
    if (!(host instanceof HTMLElement) || host.dataset.kaVsThemeButtonsBound === "true") {
      return;
    }

    const editor = getAceEditor(host);
    if (!editor) {
      return;
    }

    const toolbar = ensureToolbar(host);
    toolbar.classList.remove("is-hidden");
    toolbar.innerHTML = `
      <button type="button" class="ka-vs-theme-toolbar-button" data-action="definition">Definition</button>
      <button type="button" class="ka-vs-theme-toolbar-button" data-action="back">Back</button>
      <button type="button" class="ka-vs-theme-toolbar-button" data-action="references">References</button>
      <button type="button" class="ka-vs-theme-toolbar-button" data-action="rename">Rename</button>
      <button type="button" class="ka-vs-theme-toolbar-button" data-action="format">Format</button>
      <button type="button" class="ka-vs-theme-toolbar-button" data-action="lint">Lint</button>
    `;

    toolbar.addEventListener("click", (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
      const action = button?.getAttribute("data-action");
      if (!action) {
        return;
      }

      if (action === "definition") {
        runDefinition(editor);
        return;
      }

      if (action === "back") {
        runBack(editor);
        return;
      }

      if (action === "references") {
        runReferences(editor);
        return;
      }

      if (action === "rename") {
        runRename(editor);
        return;
      }

      if (action === "format") {
        formatDocument(editor);
        return;
      }

      if (action === "lint") {
        summarizeLint(editor);
      }
    });

    host.dataset.kaVsThemeButtonsBound = "true";
  }

  function applyTheme() {
    ensureStyle();
    const toolbar = document.getElementById(TOOLBAR_ID);
    const host = findEditorHost();
    if (!(host instanceof HTMLElement)) {
      const previousHost = currentHost;
      currentHost = null;
      hideTooltip();
      const staleEditor = getAceEditor(previousHost);
      if (staleEditor) {
        clearGhostHighlights(staleEditor);
      }
      if (toolbar) {
        toolbar.classList.add("is-hidden");
      }
      return;
    }

    if (currentHost && currentHost !== host) {
      clearGhostHighlights(getAceEditor(currentHost));
      currentHost.classList.remove(READY_CLASS);
    }

    host.classList.add(READY_CLASS);
    bindAutoPairs(host);
    bindTooltips(host);
    bindSelectionHighlights(host);
    bindEditorButtons(host);
    currentHost = host;
  }

  function queueApply() {
    if (queued) {
      return;
    }

    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      applyTheme();
    });
  }

  function start() {
    applyTheme();

    const observer = new MutationObserver(() => {
      const nextHost = findEditorHost();
      if (nextHost !== currentHost) {
        queueApply();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.setTimeout(applyTheme, 500);
    window.setTimeout(applyTheme, 1500);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
