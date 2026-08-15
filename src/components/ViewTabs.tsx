import { useState } from "react";
import { Download, FileUp, GanttChartSquare, MoreVertical, Plus, Table2, Trash2 } from "lucide-react";

interface ViewTabsProps {
  activeTab: string;
  tableNames: string[];
  canEdit: boolean;
  onSelect: (tab: string) => void;
  onAddTable: () => void;
  onRenameTable: (fromName: string, toName: string) => void;
  onDeleteTable: (name: string) => void;
  onImportTable: (name: string) => void;
  onExportTable: (name: string) => void;
}

export function ViewTabs({
  activeTab,
  tableNames,
  canEdit,
  onSelect,
  onAddTable,
  onRenameTable,
  onDeleteTable,
  onImportTable,
  onExportTable
}: ViewTabsProps) {
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState("");

  const submitRename = () => {
    const next = draft.trim();
    if (editing && next && next !== editing) onRenameTable(editing, next);
    setEditing("");
    setDraft("");
  };

  return (
    <nav className="view-tabs" aria-label="视图与表格">
      <button className={`view-tab gantt-tab ${activeTab === "gantt" ? "active" : ""}`} onClick={() => onSelect("gantt")}>
        <GanttChartSquare size={18} />
        甘特图
      </button>
      <span className="tab-divider" />
      {tableNames.map((name) => (
        <div className={`view-tab table-tab ${activeTab === name ? "active" : ""}`} key={name} onClick={() => onSelect(name)}>
          <Table2 size={18} />
          {editing === name ? (
            <input
              className="tab-name-input"
              value={draft}
              autoFocus
              onClick={(event) => event.stopPropagation()}
              onBlur={submitRename}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitRename();
                if (event.key === "Escape") {
                  setEditing("");
                  setDraft("");
                }
              }}
            />
          ) : (
            <button
              className="tab-name"
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (!canEdit) return;
                setEditing(name);
                setDraft(name);
              }}
            >
              {name}
            </button>
          )}
          <button
            className="tab-more"
            disabled={!canEdit}
            onClick={(event) => {
              event.stopPropagation();
              setMenu(menu === name ? "" : name);
            }}
            title="更多"
          >
            <MoreVertical size={16} />
          </button>
          {menu === name && (
            <div className="tab-menu" onClick={(event) => event.stopPropagation()}>
              <button onClick={() => { setEditing(name); setDraft(name); setMenu(""); }}>重命名</button>
              <button onClick={() => { onImportTable(name); setMenu(""); }}><FileUp size={14} /> 导入</button>
              <button onClick={() => { onExportTable(name); setMenu(""); }}><Download size={14} /> 导出</button>
              <button className="danger" onClick={() => { onDeleteTable(name); setMenu(""); }}><Trash2 size={14} /> 删除</button>
            </div>
          )}
        </div>
      ))}
      <button className="add-tab-button" onClick={onAddTable} disabled={!canEdit} title="新增需求表格">
        <Plus size={20} />
      </button>
    </nav>
  );
}
