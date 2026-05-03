/**
 * VocabularyEditor.tsx
 *
 * Full-featured editor for DSpace controlled vocabulary XML files.
 * Supports the three variants found in the project:
 *   - "simple"  — oecd.xml style: <node id="1.00.00" label="…"> / <isComposedBy>
 *   - "coar"    — coar-types-v3.xml style: same structure + optional <hasNote>
 *   - "srsc"    — srsc.xml / nsi.xml style: same + tab indentation in output
 *
 * Features:
 *   - Live tree editor (add / rename / delete / move / reorder nodes)
 *   - Inline editing with keyboard shortcuts (Enter = add sibling, Tab = indent, Shift+Tab = outdent)
 *   - Import XML (paste or file upload)
 *   - Export XML with live preview
 *   - Root node configurable (id, label, optional XML comment)
 *   - Undo history (Ctrl+Z / Cmd+Z)
 *   - Search / filter tree
 *   - Statistics panel
 *
 * Self-contained — no external dependencies beyond React.
 */

import React, {
  useEffect, useMemo, useReducer, useRef, useState,
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Data model
// ─────────────────────────────────────────────────────────────────────────────

export interface VocabNode {
  id: string;        // unique key within session (also the exported @id)
  label: string;
  note: string;      // maps to <hasNote>
  children: VocabNode[];
}

export interface VocabDoc {
  rootId: string;
  rootLabel: string;
  xmlComment: string;
  format: "simple" | "coar" | "srsc";
  nodes: VocabNode[];   // top-level children of root
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeNode(id = "", label = "", note = ""): VocabNode {
  return { id, label, note, children: [] };
}

function defaultDoc(): VocabDoc {
  return {
    rootId: "vocabulary",
    rootLabel: "Vocabulary",
    xmlComment: "",
    format: "simple",
    nodes: [
      { id: "1.00", label: "Category 1", note: "", children: [
        { id: "1.01", label: "Subcategory 1.1", note: "", children: [] },
        { id: "1.02", label: "Subcategory 1.2", note: "", children: [] },
      ]},
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// XML parser
// ─────────────────────────────────────────────────────────────────────────────

function parseXmlToDoc(xmlStr: string): VocabDoc {
  const parser = new DOMParser();
  const dom = parser.parseFromString(xmlStr, "application/xml");
  const err = dom.querySelector("parsererror");
  if (err) throw new Error("XML parse error: " + err.textContent?.slice(0, 120));

  const root = dom.documentElement;
  const rootId    = root.getAttribute("id") ?? "vocabulary";
  const rootLabel = root.getAttribute("label") ?? "Vocabulary";

  // Detect comment
  let xmlComment = "";
  for (const child of Array.from(dom.childNodes)) {
    if (child.nodeType === 8) { xmlComment = (child as Comment).data.trim(); break; }
  }

  // Detect format
  const hasNote = !!dom.querySelector("hasNote");
  const format: VocabDoc["format"] = hasNote ? "coar" : "simple";

  function parseComposed(el: Element): VocabNode[] {
    const composed = Array.from(el.children).find(c => c.tagName === "isComposedBy");
    if (!composed) return [];
    return Array.from(composed.children)
      .filter(c => c.tagName === "node")
      .map(parseNode);
  }

  function parseNode(el: Element): VocabNode {
    const id    = el.getAttribute("id") ?? uid();
    const label = el.getAttribute("label") ?? "";
    const noteEl = Array.from(el.children).find(c => c.tagName === "hasNote");
    const note  = noteEl?.textContent?.trim() ?? "";
    const children = parseComposed(el);
    return { id, label, note, children };
  }

  const nodes = parseComposed(root);
  return { rootId, rootLabel, xmlComment, format, nodes };
}

// ─────────────────────────────────────────────────────────────────────────────
// XML generator
// ─────────────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateXml(doc: VocabDoc): string {
  const tab = doc.format === "srsc" ? "\t" : "  ";
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];

  if (doc.xmlComment) {
    lines.push(`<!--`);
    lines.push(doc.xmlComment);
    lines.push(`-->`);
    lines.push("");
  }

  function renderNode(node: VocabNode, depth: number): void {
    const ind = tab.repeat(depth);
    const hasNote = doc.format !== "simple" && node.note;
    const hasChildren = node.children.length > 0;

    if (!hasNote && !hasChildren) {
      lines.push(`${ind}<node id="${esc(node.id)}" label="${esc(node.label)}" />`);
      return;
    }
    lines.push(`${ind}<node id="${esc(node.id)}" label="${esc(node.label)}">`);
    if (hasNote) {
      lines.push(`${ind}${tab}<hasNote>${esc(node.note)}`);
      lines.push(`${ind}${tab}</hasNote>`);
    }
    if (hasChildren) {
      lines.push(`${ind}${tab}<isComposedBy>`);
      for (const child of node.children) renderNode(child, depth + 2);
      lines.push(`${ind}${tab}</isComposedBy>`);
    }
    lines.push(`${ind}</node>`);
  }

  lines.push(`<node id="${esc(doc.rootId)}" label="${esc(doc.rootLabel)}">`);
  if (doc.nodes.length > 0) {
    lines.push(`${tab}<isComposedBy>`);
    for (const node of doc.nodes) renderNode(node, 2);
    lines.push(`${tab}</isComposedBy>`);
  }
  lines.push(`</node>`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree utilities (immutable path-based mutations)
// ─────────────────────────────────────────────────────────────────────────────

type NodePath = number[];   // indices into nested children arrays

/** Walk tree and return node at path */
function nodeAt(nodes: VocabNode[], path: NodePath): VocabNode | null {
  let cur: VocabNode[] = nodes;
  let node: VocabNode | null = null;
  for (const idx of path) {
    if (!cur[idx]) return null;
    node = cur[idx];
    cur = node.children;
  }
  return node;
}

/** Produce new root nodes with node at path replaced */
function setAt(nodes: VocabNode[], path: NodePath, updater: (n: VocabNode) => VocabNode): VocabNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  return nodes.map((n, i) =>
    i !== head ? n
      : rest.length === 0 ? updater(n)
      : { ...n, children: setAt(n.children, rest, updater) }
  );
}

/** Insert a new node after path */
function insertAfter(nodes: VocabNode[], path: NodePath, newNode: VocabNode): VocabNode[] {
  if (path.length === 1) {
    const arr = [...nodes];
    arr.splice(path[0] + 1, 0, newNode);
    return arr;
  }
  const [head, ...rest] = path;
  return nodes.map((n, i) =>
    i !== head ? n : { ...n, children: insertAfter(n.children, rest, newNode) }
  );
}

/** Append as last child of node at path */
function appendChild(nodes: VocabNode[], path: NodePath, newNode: VocabNode): VocabNode[] {
  return setAt(nodes, path, n => ({ ...n, children: [...n.children, newNode] }));
}

/** Remove node at path */
function removeAt(nodes: VocabNode[], path: NodePath): VocabNode[] {
  if (path.length === 1) {
    return nodes.filter((_, i) => i !== path[0]);
  }
  const [head, ...rest] = path;
  return nodes.map((n, i) =>
    i !== head ? n : { ...n, children: removeAt(n.children, rest) }
  );
}

/** Move node at path up/down among its siblings */
function moveNode(nodes: VocabNode[], path: NodePath, dir: "up" | "down"): VocabNode[] {
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  const getSiblings = (ns: VocabNode[]): VocabNode[] => {
    if (parentPath.length === 0) return ns;
    const p = nodeAt(ns, parentPath);
    return p?.children ?? [];
  };
  const siblings = getSiblings(nodes);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return nodes;

  const newSiblings = [...siblings];
  [newSiblings[idx], newSiblings[swapIdx]] = [newSiblings[swapIdx], newSiblings[idx]];

  if (parentPath.length === 0) return newSiblings;
  return setAt(nodes, parentPath, n => ({ ...n, children: newSiblings }));
}

/** Count all nodes recursively */
function countNodes(nodes: VocabNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

/** Max depth */
function maxDepth(nodes: VocabNode[], d = 0): number {
  if (nodes.length === 0) return d;
  return Math.max(...nodes.map(n => maxDepth(n.children, d + 1)));
}

/** Collect all nodes matching a query */
function searchNodes(nodes: VocabNode[], q: string, path: NodePath = []): NodePath[] {
  const result: NodePath[] = [];
  const ql = q.toLowerCase();
  for (let i = 0; i < nodes.length; i++) {
    const p = [...path, i];
    if (nodes[i].label.toLowerCase().includes(ql) || nodes[i].id.toLowerCase().includes(ql)) {
      result.push(p);
    }
    result.push(...searchNodes(nodes[i].children, q, p));
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// State / undo
// ─────────────────────────────────────────────────────────────────────────────

interface EditorState {
  doc: VocabDoc;
  history: VocabDoc[];   // undo stack
  future:  VocabDoc[];   // redo stack
}

type EditorAction =
  | { type: "SET_DOC"; doc: VocabDoc }
  | { type: "PATCH_DOC"; patch: Partial<VocabDoc> }
  | { type: "SET_NODES"; nodes: VocabNode[] }
  | { type: "UNDO" }
  | { type: "REDO" };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_DOC":
      return { doc: action.doc, history: [], future: [] };

    case "PATCH_DOC": {
      const next = { ...state.doc, ...action.patch };
      return { doc: next, history: [state.doc, ...state.history].slice(0, 50), future: [] };
    }

    case "SET_NODES": {
      const next = { ...state.doc, nodes: action.nodes };
      return { doc: next, history: [state.doc, ...state.history].slice(0, 50), future: [] };
    }

    case "UNDO":
      if (!state.history.length) return state;
      return { doc: state.history[0], history: state.history.slice(1), future: [state.doc, ...state.future] };

    case "REDO":
      if (!state.future.length) return state;
      return { doc: state.future[0], history: [state.doc, ...state.history], future: state.future.slice(1) };

    default: return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme tokens
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  bg:         "var(--bg)",
  panel:      "#ffffff",
  border:     "var(--border)",
  accent:     "var(--accent)",
  accentSoft: "#ede9fe",
  accentText: "#3730a3",
  danger:     "#dc2626",
  dangerSoft: "#fee2e2",
  text:       "var(--text)",
  muted:      "var(--muted)",
  faint:      "#9ca3af",
  green:      "#059669",
  greenSoft:  "#d1fae5",
  mono:       "var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace)",
  radius:     "6px",
  shadow:     "0 1px 4px rgba(0,0,0,0.06)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Small atoms
// ─────────────────────────────────────────────────────────────────────────────

function Btn({ children, onClick, disabled, variant = "ghost", title, style: sx }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "ghost" | "primary" | "danger" | "outline"; title?: string;
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 4, padding: "4px 10px", borderRadius: T.radius, fontSize: 12,
    fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer",
    border: "none", outline: "none", transition: "all 0.12s",
    opacity: disabled ? 0.5 : 1, lineHeight: 1.4,
    fontFamily: "inherit",
  };
  const varMap: Record<string, React.CSSProperties> = {
    ghost:   { background: "transparent", color: T.muted },
    outline: { background: T.panel, border: `1px solid ${T.border}`, color: T.text },
    primary: { background: T.accent, color: "#fff" },
    danger:  { background: T.dangerSoft, color: T.danger, border: `1px solid #fca5a5` },
  };
  return (
    <button onClick={disabled ? undefined : onClick} title={title} disabled={disabled}
      style={{ ...base, ...varMap[variant], ...sx }}>
      {children}
    </button>
  );
}

function IconBtn({ icon, onClick, title, danger, active }: {
  icon: string; onClick?: () => void; title?: string; danger?: boolean; active?: boolean;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 24, height: 24, borderRadius: 5, border: "none",
      background: active ? T.accentSoft : danger ? T.dangerSoft : "transparent",
      color: active ? T.accentText : danger ? T.danger : T.faint,
      cursor: "pointer", display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: 13, flexShrink: 0,
      transition: "all 0.1s",
    }}>
      {icon}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NodeRow — single editable row in the tree
// ─────────────────────────────────────────────────────────────────────────────

const INDENT_PX = 20;

interface NodeRowProps {
  node: VocabNode;
  path: NodePath;
  depth: number;
  expanded: boolean;
  selected: boolean;
  searchMatch: boolean;
  hasChildren: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  showNotes: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onUpdate: (patch: Partial<VocabNode>) => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  editingField: "label" | "id" | "note" | null;
  onStartEdit: (field: "label" | "id" | "note") => void;
  onEndEdit: () => void;
}

function NodeRow(props: NodeRowProps) {
  const {
    node, depth, expanded, selected, searchMatch, hasChildren,
    showNotes,
    onToggle, onSelect, onUpdate, onAddChild, onAddSibling,
    onDelete, onMoveUp, onMoveDown, onIndent, onOutdent,
    editingField, onStartEdit, onEndEdit,
  } = props;

  const labelRef = useRef<HTMLInputElement>(null);
  const idRef    = useRef<HTMLInputElement>(null);
  const noteRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingField === "label") labelRef.current?.focus();
    if (editingField === "id")    idRef.current?.focus();
    if (editingField === "note")  noteRef.current?.focus();
  }, [editingField]);

  const indentPx = Math.min(depth * INDENT_PX, 400);
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAddSibling(); onEndEdit(); }
    if (e.key === "Escape") onEndEdit();
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); onIndent(); }
    if (e.key === "Tab" && e.shiftKey)  { e.preventDefault(); onOutdent(); }
  }

  const rowBg = selected
    ? T.accentSoft
    : searchMatch
      ? "#fef9c3"
      : "transparent";

  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 4,
          paddingLeft: indentPx + 4, paddingRight: 6,
          paddingTop: 2, paddingBottom: 2,
          borderRadius: T.radius,
          background: rowBg,
          borderLeft: selected ? `3px solid ${T.accent}` : "3px solid transparent",
          transition: "background 0.1s",
          minHeight: 30,
        }}
        onClick={onSelect}
      >
        {/* Expand toggle */}
        <div
          onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(); }}
          style={{
            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: T.faint,
            background: hasChildren ? "#f1f5f9" : "transparent",
            border: hasChildren ? `1px solid ${T.border}` : "none",
            cursor: hasChildren ? "pointer" : "default",
          }}>
          {hasChildren ? (expanded ? "▾" : "▸") : ""}
        </div>

        {/* ID */}
        {editingField === "id" ? (
          <input ref={idRef} value={node.id}
            onChange={e => onUpdate({ id: e.target.value })}
            onBlur={onEndEdit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            style={{ width: 90, fontSize: 11, fontFamily: T.mono, padding: "1px 5px",
              border: `1.5px solid ${T.accent}`, borderRadius: 4, outline: "none",
              color: T.accentText, background: T.accentSoft }}
          />
        ) : (
          <span
            onDoubleClick={e => { e.stopPropagation(); onStartEdit("id"); }}
            title="Double-click to edit ID"
            style={{ fontSize: 11, fontFamily: T.mono, color: T.accentText,
              background: T.accentSoft, padding: "1px 6px", borderRadius: 4,
              flexShrink: 0, maxWidth: 120, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
              cursor: "text",
            }}>
            {node.id || <span style={{ color: T.faint, fontStyle: "italic" }}>id?</span>}
          </span>
        )}

        {/* Label */}
        {editingField === "label" ? (
          <input ref={labelRef} value={node.label}
            onChange={e => onUpdate({ label: e.target.value })}
            onBlur={onEndEdit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            placeholder="Label…"
            style={{ flex: 1, fontSize: 13, padding: "1px 6px",
              border: `1.5px solid ${T.accent}`, borderRadius: 4,
              outline: "none", fontFamily: "inherit" }}
          />
        ) : (
          <span
            onDoubleClick={e => { e.stopPropagation(); onStartEdit("label"); }}
            title="Double-click to edit label"
            style={{ flex: 1, fontSize: 13, color: T.text,
              fontWeight: selected ? 600 : 400,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              cursor: "text",
            }}>
            {node.label || <span style={{ color: T.faint, fontStyle: "italic" }}>label?</span>}
          </span>
        )}

        {/* Child count badge */}
        {hasChildren && !expanded && (
          <span style={{ fontSize: 10, color: T.faint, flexShrink: 0,
            background: "#f1f5f9", padding: "1px 5px", borderRadius: 999, fontFamily: T.mono }}>
            {node.children.length}
          </span>
        )}

        {/* Note indicator */}
        {node.note && (
          <span title="Has note" style={{ fontSize: 9, color: T.green, flexShrink: 0 }}>📝</span>
        )}

        {/* Row actions — show on selected */}
        {selected && (
          <div style={{ display: "flex", gap: 2, flexShrink: 0, marginLeft: 4 }}
            onClick={e => e.stopPropagation()}>
            <IconBtn icon="↑" onClick={onMoveUp}   title="Move up"    active={false} />
            <IconBtn icon="↓" onClick={onMoveDown}  title="Move down"  active={false} />
            <IconBtn icon="→" onClick={onIndent}    title="Indent (make child of previous)" active={false} />
            <IconBtn icon="←" onClick={onOutdent}   title="Outdent (promote to parent level)" active={false} />
            <IconBtn icon="+" onClick={onAddSibling} title="Add sibling (Enter)" active={false} />
            <IconBtn icon="⤵" onClick={onAddChild}  title="Add child" active={false} />
            <IconBtn icon="✕" onClick={onDelete}    title="Delete node" danger />
          </div>
        )}
      </div>

      {/* Note editing row */}
      {selected && showNotes && (
        <div style={{ paddingLeft: indentPx + 28, paddingRight: 6, paddingBottom: 4 }}>
          <textarea
            ref={noteRef}
            value={node.note}
            onChange={e => onUpdate({ note: e.target.value })}
            placeholder="Note / definition (optional, maps to <hasNote>)…"
            rows={2}
            style={{ width: "100%", fontSize: 11, fontFamily: "inherit",
              border: `1.5px solid ${T.border}`, borderRadius: T.radius,
              padding: "5px 8px", outline: "none", resize: "vertical",
              boxSizing: "border-box", color: T.muted,
              background: "#fafbff",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TreeView — recursive renderer
// ─────────────────────────────────────────────────────────────────────────────

interface TreeViewProps {
  nodes: VocabNode[];
  path: NodePath;
  depth: number;
  expandedSet: Set<string>;
  selectedPath: NodePath | null;
  searchMatches: Set<string>;  // set of nodeId strings
  showNotes: boolean;
  editingPath: NodePath | null;
  editingField: "label" | "id" | "note" | null;
  onToggle: (path: NodePath) => void;
  onSelect: (path: NodePath) => void;
  onUpdate: (path: NodePath, patch: Partial<VocabNode>) => void;
  onAddChild: (path: NodePath) => void;
  onAddSibling: (path: NodePath) => void;
  onDelete: (path: NodePath) => void;
  onMoveUp: (path: NodePath) => void;
  onMoveDown: (path: NodePath) => void;
  onIndent: (path: NodePath) => void;
  onOutdent: (path: NodePath) => void;
  onStartEdit: (path: NodePath, field: "label" | "id" | "note") => void;
  onEndEdit: () => void;
}

function TreeView(props: TreeViewProps) {
  const { nodes, path, depth, expandedSet, selectedPath, searchMatches, showNotes,
    editingPath, editingField, onToggle, onSelect, onUpdate, onAddChild, onAddSibling,
    onDelete, onMoveUp, onMoveDown, onIndent, onOutdent, onStartEdit, onEndEdit } = props;

  return (
    <>
      {nodes.map((node, i) => {
        const nodePath = [...path, i];
        const pathKey  = nodePath.join("-");
        const expanded = expandedSet.has(node.id + "_" + pathKey);
        const selected = selectedPath !== null && selectedPath.join("-") === pathKey;
        const isEditingThis = editingPath !== null && editingPath.join("-") === pathKey;

        return (
          <React.Fragment key={node.id + "_" + pathKey}>
            <NodeRow
              node={node} path={nodePath} depth={depth}
              expanded={expanded} selected={selected}
              searchMatch={searchMatches.has(node.id + "_" + pathKey)}
              hasChildren={node.children.length > 0}
              canMoveUp={i > 0} canMoveDown={i < nodes.length - 1}
              showNotes={showNotes}
              onToggle={() => onToggle(nodePath)}
              onSelect={() => onSelect(nodePath)}
              onUpdate={patch => onUpdate(nodePath, patch)}
              onAddChild={() => onAddChild(nodePath)}
              onAddSibling={() => onAddSibling(nodePath)}
              onDelete={() => onDelete(nodePath)}
              onMoveUp={() => onMoveUp(nodePath)}
              onMoveDown={() => onMoveDown(nodePath)}
              onIndent={() => onIndent(nodePath)}
              onOutdent={() => onOutdent(nodePath)}
              editingField={isEditingThis ? editingField : null}
              onStartEdit={field => onStartEdit(nodePath, field)}
              onEndEdit={onEndEdit}
            />
            {expanded && node.children.length > 0 && (
              <TreeView
                {...props}
                nodes={node.children}
                path={nodePath}
                depth={depth + 1}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ImportModal
// ─────────────────────────────────────────────────────────────────────────────

function ImportModal({ onImport, onClose }: {
  onImport: (doc: VocabDoc) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function doImport() {
    try {
      const doc = parseXmlToDoc(text.trim());
      onImport(doc);
      onClose();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setText(ev.target?.result as string ?? "");
    reader.readAsText(file);
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      onClick={onClose}>
      <div style={{ background:T.panel, borderRadius:12, width:"100%", maxWidth:700, maxHeight:"80vh",
        display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.2)", overflow:"hidden" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${T.border}`,
          display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontWeight:700, fontSize:14, color:T.text }}>Import XML vocabulary</div>
          <Btn onClick={onClose} variant="ghost">✕</Btn>
        </div>
        <div style={{ padding:"16px 20px", flex:1, overflow:"auto", display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <Btn variant="outline" onClick={() => fileRef.current?.click()}>📁 Choose file</Btn>
            <span style={{ fontSize:12, color:T.muted }}>or paste XML below</span>
          </div>
          <input ref={fileRef} type="file" accept=".xml,text/xml" style={{ display:"none" }} onChange={handleFile} />
          <textarea value={text} onChange={e => { setText(e.target.value); setError(""); }}
            placeholder='<?xml version="1.0" encoding="UTF-8"?>&#10;<node id="..." label="...">&#10;  ...&#10;</node>'
            style={{ flex:1, minHeight:260, fontFamily:T.mono, fontSize:12, lineHeight:1.6,
              border:`1.5px solid ${T.border}`, borderRadius:T.radius, padding:"10px 12px",
              outline:"none", resize:"vertical", color:T.text }} />
          {error && (
            <div style={{ background:T.dangerSoft, color:T.danger, padding:"8px 12px",
              borderRadius:T.radius, fontSize:12 }}>⚠ {error}</div>
          )}
        </div>
        <div style={{ padding:"12px 20px", borderTop:`1px solid ${T.border}`,
          display:"flex", gap:8, justifyContent:"flex-end" }}>
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={doImport} disabled={!text.trim()}>Import</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExportModal
// ─────────────────────────────────────────────────────────────────────────────

function ExportModal({ doc, onClose }: { doc: VocabDoc; onClose: () => void }) {
  const xml = useMemo(() => generateXml(doc), [doc]);
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([xml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.rootId}.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copy() {
    navigator.clipboard.writeText(xml).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      onClick={onClose}>
      <div style={{ background:"#1e1e2e", borderRadius:12, width:"100%", maxWidth:800, maxHeight:"85vh",
        display:"flex", flexDirection:"column", boxShadow:"0 24px 80px rgba(0,0,0,0.5)", overflow:"hidden" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.08)",
          display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:"#e2e8f0" }}>{doc.rootId}.xml</div>
            <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
              {countNodes(doc.nodes)} nodes · {xml.split("\n").length} lines
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={download} style={{ padding:"6px 14px", borderRadius:T.radius,
              border:"none", background:"#059669", color:"#fff", fontSize:12,
              fontWeight:600, cursor:"pointer" }}>⬇ Download</button>
            <button onClick={copy} style={{ padding:"6px 14px", borderRadius:T.radius,
              border:"none", background:copied?"#22c55e":"#4f46e5", color:"#fff",
              fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {copied ? "✓ Copied!" : "Copy XML"}
            </button>
            <button onClick={onClose} style={{ padding:"6px 10px", borderRadius:T.radius,
              border:"1px solid rgba(255,255,255,0.12)", background:"transparent",
              color:"#94a3b8", fontSize:13, cursor:"pointer" }}>✕</button>
          </div>
        </div>
        <pre style={{ flex:1, overflowY:"auto", margin:0, padding:"16px 20px",
          fontFamily:T.mono, fontSize:12, lineHeight:1.6,
          color:"#a5f3fc", background:"transparent",
          whiteSpace:"pre-wrap", wordBreak:"break-all" }}>
          {xml}
        </pre>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// VocabularyEditor — main component
// ─────────────────────────────────────────────────────────────────────────────

export function VocabularyEditor() {
  const [state, dispatch] = useReducer(editorReducer, {
    doc: defaultDoc(), history: [], future: [],
  });
  const doc = state.doc;

  const [expandedSet,   setExpandedSet]   = useState<Set<string>>(new Set());
  const [selectedPath,  setSelectedPath]  = useState<NodePath | null>(null);
  const [editingPath,   setEditingPath]   = useState<NodePath | null>(null);
  const [editingField,  setEditingField]  = useState<"label"|"id"|"note"|null>(null);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [showNotes,     setShowNotes]     = useState(true);
  const [showImport,    setShowImport]    = useState(false);
  const [showExport,    setShowExport]    = useState(false);

  // Search match set
  const searchMatches = useMemo<Set<string>>(() => {
    if (!searchQuery.trim()) return new Set();
    const paths = searchNodes(doc.nodes, searchQuery);
    const set = new Set<string>();
    for (const p of paths) {
      const key = p.join("-");
      const node = nodeAt(doc.nodes, p);
      if (node) set.add(node.id + "_" + key);
    }
    return set;
  }, [doc.nodes, searchQuery]);

  // Expand ancestors of search matches when query changes
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const paths = searchNodes(doc.nodes, searchQuery);
    const toExpand = new Set(expandedSet);
    for (const p of paths) {
      for (let d = 1; d <= p.length; d++) {
        const anc = p.slice(0, d);
        const node = nodeAt(doc.nodes, anc);
        if (node) toExpand.add(node.id + "_" + anc.join("-"));
      }
    }
    setExpandedSet(toExpand);
  }, [searchQuery]); // eslint-disable-line

  // Keyboard undo/redo
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); dispatch({ type: "UNDO" }); }
      if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); dispatch({ type: "REDO" }); }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Helpers to get path key ───────────────────────────────────────────────

  function pathKey(path: NodePath) { return path.join("-"); }
  function nodeExpandKey(path: NodePath) {
    const node = nodeAt(doc.nodes, path);
    return node ? node.id + "_" + pathKey(path) : pathKey(path);
  }

  // ── Tree mutations ─────────────────────────────────────────────────────────

  function setNodes(nodes: VocabNode[]) { dispatch({ type: "SET_NODES", nodes }); }

  function handleToggle(path: NodePath) {
    const key = nodeExpandKey(path);
    setExpandedSet(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  }

  function handleUpdate(path: NodePath, patch: Partial<VocabNode>) {
    setNodes(setAt(doc.nodes, path, n => ({ ...n, ...patch })));
  }

  function handleAddChild(path: NodePath) {
    const newNode = makeNode(uid(), "");
    setNodes(appendChild(doc.nodes, path, newNode));
    // Expand parent
    setExpandedSet(prev => {
      const s = new Set(prev); s.add(nodeExpandKey(path)); return s;
    });
    // Select new child
    const node = nodeAt(doc.nodes, path);
    const childIdx = (node?.children.length ?? 0);
    const newPath = [...path, childIdx];
    setSelectedPath(newPath);
    setTimeout(() => { setEditingPath(newPath); setEditingField("label"); }, 30);
  }

  function handleAddSibling(path: NodePath) {
    const newNode = makeNode(uid(), "");
    setNodes(insertAfter(doc.nodes, path, newNode));
    const newPath = [...path.slice(0, -1), path[path.length - 1] + 1];
    setSelectedPath(newPath);
    setTimeout(() => { setEditingPath(newPath); setEditingField("label"); }, 30);
  }

  function handleAddTopLevel() {
    const newNode = makeNode(uid(), "");
    setNodes([...doc.nodes, newNode]);
    const newPath = [doc.nodes.length];
    setSelectedPath(newPath);
    setTimeout(() => { setEditingPath(newPath); setEditingField("label"); }, 30);
  }

  function handleDelete(path: NodePath) {
    setNodes(removeAt(doc.nodes, path));
    setSelectedPath(null);
    setEditingPath(null);
    setEditingField(null);
  }

  function handleMoveUp(path: NodePath) { setNodes(moveNode(doc.nodes, path, "up")); }
  function handleMoveDown(path: NodePath) { setNodes(moveNode(doc.nodes, path, "down")); }

  // Indent: make node the last child of its previous sibling
  function handleIndent(path: NodePath) {
    const idx = path[path.length - 1];
    if (idx === 0) return; // no previous sibling
    const prevSiblingPath = [...path.slice(0, -1), idx - 1];
    const node = nodeAt(doc.nodes, path);
    if (!node) return;
    let nodes = removeAt(doc.nodes, path);
    // After removal, prevSibling is still at idx-1
    const prevSib = nodeAt(nodes, prevSiblingPath);
    if (!prevSib) return;
    const childIdx = prevSib.children.length;
    nodes = appendChild(nodes, prevSiblingPath, node);
    // Expand the parent
    setExpandedSet(prev => { const s = new Set(prev); s.add(prevSib.id + "_" + prevSiblingPath.join("-")); return s; });
    const newPath = [...prevSiblingPath, childIdx];
    setSelectedPath(newPath);
    setNodes(nodes);
  }

  // Outdent: move node to be sibling of its parent (after parent)
  function handleOutdent(path: NodePath) {
    if (path.length <= 1) return; // already at top
    const parentPath = path.slice(0, -1);
    const node = nodeAt(doc.nodes, path);
    if (!node) return;
    let nodes = removeAt(doc.nodes, path);
    nodes = insertAfter(nodes, parentPath, node);
    const newPath = [...parentPath.slice(0, -1), parentPath[parentPath.length - 1] + 1];
    setSelectedPath(newPath);
    setNodes(nodes);
  }

  function expandAll() {
    const keys = new Set<string>();
    function walk(nodes: VocabNode[], p: NodePath) {
      for (let i = 0; i < nodes.length; i++) {
        const np = [...p, i];
        const key = nodes[i].id + "_" + np.join("-");
        if (nodes[i].children.length > 0) { keys.add(key); walk(nodes[i].children, np); }
      }
    }
    walk(doc.nodes, []);
    setExpandedSet(keys);
  }

  function collapseAll() { setExpandedSet(new Set()); }

  return (
    <div>
      {/* ── Config card ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">Root node configuration</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 110 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Root ID</label>
            <input value={doc.rootId} onChange={e => dispatch({ type: "PATCH_DOC", patch: { rootId: e.target.value } })}
              style={{ fontFamily: "monospace", fontSize: 12, padding: "4px 7px", border: "1px solid var(--border)", borderRadius: 5, outline: "none", color: T.accentText, background: T.accentSoft }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Root label</label>
            <input value={doc.rootLabel} onChange={e => dispatch({ type: "PATCH_DOC", patch: { rootLabel: e.target.value } })}
              style={{ fontSize: 12, padding: "4px 7px", border: "1px solid var(--border)", borderRadius: 5, outline: "none" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 160 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Output format</label>
            <select value={doc.format} onChange={e => dispatch({ type: "PATCH_DOC", patch: { format: e.target.value as VocabDoc["format"] } })}
              style={{ fontSize: 12, padding: "4px 7px", border: "1px solid var(--border)", borderRadius: 5, outline: "none", background: "#fff" }}>
              <option value="simple">simple (oecd)</option>
              <option value="coar">coar (with notes)</option>
              <option value="srsc">srsc (tab indented)</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 2, minWidth: 200 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>XML comment (optional)</label>
            <input value={doc.xmlComment} onChange={e => dispatch({ type: "PATCH_DOC", patch: { xmlComment: e.target.value } })}
              placeholder="e.g. OECD Fields of Science and Technology"
              style={{ fontSize: 12, padding: "4px 7px", border: "1px solid var(--border)", borderRadius: 5, outline: "none" }} />
          </div>
        </div>

        <hr className="divider" />

        {/* Action bar */}
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-sm" onClick={() => dispatch({ type: "UNDO" })} disabled={!state.history.length} title="Undo (⌘Z)">↩ Undo</button>
          <button className="btn btn-sm" onClick={() => dispatch({ type: "REDO" })} disabled={!state.future.length} title="Redo (⌘⇧Z)">↪ Redo</button>
          <div style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />
          <button className={`btn btn-sm${showNotes ? " btn-primary" : ""}`} onClick={() => setShowNotes(n => !n)}>📝 Notes</button>
          <button className="btn btn-sm" onClick={expandAll}>⊞ Expand all</button>
          <button className="btn btn-sm" onClick={collapseAll}>⊟ Collapse all</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => setShowImport(true)}>⬆ Import XML</button>
          <button className="btn btn-sm btn-primary" onClick={() => setShowExport(true)}>⬇ Export XML</button>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 12 }}>
        {([["Nodes", countNodes(doc.nodes)], ["Top-level", doc.nodes.length], ["Max depth", maxDepth(doc.nodes)]] as [string, number][]).map(([label, val]) => (
          <div key={label} className="stat-card">
            <div className="stat-value">{val}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tree card ─────────────────────────────────────────────────────── */}
      <div className="card">
        {/* Search + add */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0, flexShrink: 0 }}>
            Nodes <span className="count-badge">{countNodes(doc.nodes)}</span>
          </div>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 12, pointerEvents: "none" }}>⌕</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search labels or IDs…"
              style={{ width: "100%", padding: "5px 8px 5px 26px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, outline: "none", boxSizing: "border-box", background: searchQuery ? "#fffbeb" : "#fff" }} />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}
                style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>✕</button>
            )}
          </div>
          {searchQuery && (
            <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {searchMatches.size} match{searchMatches.size !== 1 ? "es" : ""}
            </span>
          )}
          <button className="btn btn-sm btn-primary" onClick={handleAddTopLevel}>+ Add top-level node</button>
        </div>

        {/* Root display row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "var(--bg)", borderRadius: 5, marginBottom: 6, border: "1px solid var(--border)" }}>
          <span className="chip chip-blue" style={{ fontFamily: "monospace", fontSize: 10 }}>ROOT</span>
          <code style={{ fontSize: 11, color: T.accentText }}>{doc.rootId}</code>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{doc.rootLabel}</span>
          <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto" }}>
            {doc.nodes.length} top-level · {countNodes(doc.nodes)} total
          </span>
        </div>

        {/* Tree body */}
        {doc.nodes.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🌱</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Empty vocabulary</div>
            <div style={{ fontSize: 12 }}>Click "Add top-level node" to start, or import an existing XML file.</div>
          </div>
        ) : (
          <TreeView
            nodes={doc.nodes} path={[]} depth={0}
            expandedSet={expandedSet}
            selectedPath={selectedPath}
            searchMatches={searchMatches}
            showNotes={showNotes}
            editingPath={editingPath}
            editingField={editingField}
            onToggle={handleToggle}
            onSelect={p => { setSelectedPath(p); setEditingPath(null); setEditingField(null); }}
            onUpdate={handleUpdate}
            onAddChild={handleAddChild}
            onAddSibling={handleAddSibling}
            onDelete={handleDelete}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onIndent={handleIndent}
            onOutdent={handleOutdent}
            onStartEdit={(path, field) => { setEditingPath(path); setEditingField(field); setSelectedPath(path); }}
            onEndEdit={() => { setEditingPath(null); setEditingField(null); }}
          />
        )}

        {/* Keyboard hints */}
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--muted)", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[["Click row", "Select"], ["Dbl-click label/ID", "Edit"], ["Enter", "Add sibling"],
            ["Tab / Shift+Tab", "Indent / Outdent"], ["↑↓ buttons", "Reorder"], ["⌘Z / ⌘Y", "Undo / Redo"]].map(([k, v]) => (
            <span key={k}>
              <kbd style={{ background: "var(--bg)", border: "1px solid var(--border)", padding: "1px 4px", borderRadius: 3, fontFamily: "monospace", fontSize: 9 }}>{k}</kbd> {v}
            </span>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showImport && (
        <ImportModal
          onImport={d => dispatch({ type: "SET_DOC", doc: d })}
          onClose={() => setShowImport(false)}
        />
      )}
      {showExport && (
        <ExportModal doc={doc} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}
