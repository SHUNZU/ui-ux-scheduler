import { useState } from "react";
import { Plus } from "lucide-react";
import { ScheduledRequirement } from "../types";
import { RequirementTable } from "./RequirementTable";

interface ProjectTablesProps {
  requirements: ScheduledRequirement[];
  designOwners: string[];
  productOwners: string[];
  canEdit: boolean;
  onSelect: (requirement: ScheduledRequirement) => void;
  onUpdate: (requirement: ScheduledRequirement) => void;
  onReorder: (requirements: ScheduledRequirement[]) => void;
  onRenameProject: (fromProject: string, toProject: string) => void;
  onAddRequirement: (project: string) => void;
  onAddProject: () => void;
}

export function ProjectTables({
  requirements,
  designOwners,
  productOwners,
  canEdit,
  onSelect,
  onUpdate,
  onReorder,
  onRenameProject,
  onAddRequirement,
  onAddProject
}: ProjectTablesProps) {
  const [editingProject, setEditingProject] = useState("");
  const [draftName, setDraftName] = useState("");
  const groups = groupByProject(requirements);

  const startRename = (project: string) => {
    if (!canEdit) return;
    setEditingProject(project);
    setDraftName(project);
  };

  const submitRename = () => {
    const nextName = draftName.trim();
    if (editingProject && nextName && nextName !== editingProject) {
      onRenameProject(editingProject, nextName);
    }
    setEditingProject("");
    setDraftName("");
  };

  return (
    <section className="project-tables">
      <div className="project-tabs-bar">
        <div>
          <span className="eyebrow">Project Requirement Tables</span>
          <h2>项目需求表</h2>
        </div>
        <button className="ghost-button" onClick={onAddProject} disabled={!canEdit} title={canEdit ? "新增项目表" : "只读模式不可新增项目"}>
          <Plus size={16} />
          新增项目表
        </button>
      </div>

      {groups.map(([project, items]) => (
        <section className="project-table-section" key={project}>
          <header className="project-table-head">
            {editingProject === project ? (
              <input
                className="project-name-input"
                value={draftName}
                autoFocus
                onBlur={submitRename}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitRename();
                  if (event.key === "Escape") {
                    setEditingProject("");
                    setDraftName("");
                  }
                }}
              />
            ) : (
              <button
                className="project-name-button"
                onDoubleClick={() => startRename(project)}
                title={canEdit ? "双击自定义项目表名称" : "只读模式不可改名"}
              >
                {project}
              </button>
            )}
            <span>{items.length} 条需求</span>
            <button className="primary-button" onClick={() => onAddRequirement(project)} disabled={!canEdit}>
              <Plus size={16} />
              新增需求
            </button>
          </header>
          <RequirementTable
            requirements={items}
            designOwners={designOwners}
            productOwners={productOwners}
            canEdit={canEdit}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onReorder={onReorder}
          />
        </section>
      ))}
    </section>
  );
}

function groupByProject(requirements: ScheduledRequirement[]): Array<[string, ScheduledRequirement[]]> {
  const groups = new Map<string, ScheduledRequirement[]>();

  for (const requirement of requirements) {
    const project = requirement.project || "未归属项目";
    groups.set(project, [...(groups.get(project) ?? []), requirement]);
  }

  return [...groups.entries()].sort(([projectA, itemsA], [projectB, itemsB]) => {
    const firstA = Math.min(...itemsA.map((item) => item.sequence));
    const firstB = Math.min(...itemsB.map((item) => item.sequence));
    if (firstA !== firstB) return firstA - firstB;
    return projectA.localeCompare(projectB, "zh-CN");
  });
}
