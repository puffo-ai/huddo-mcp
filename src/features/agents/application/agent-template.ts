import type { AgentTemplate, AgentTemplateItem } from "../domain/agent-template";

const EXPLICIT_ITEM_FIELDS = new Set([
  "name",
  "kind",
  "delta",
  "note",
  "source",
  "reason",
  "repo",
  "license",
  "license_short",
  "license_restricted",
  "copyright",
  "pin",
  "status",
  "hidden",
  "hidden_reason",
]);

export type AgentTemplateChecklistKind = "skill" | "subagent" | "mcp";

export interface AgentTemplateChecklistItem {
  id: string;
  kind: AgentTemplateChecklistKind;
  name: string;
  required: boolean;
  notBundled: boolean;
  item: AgentTemplateItem;
}

const CHECKLIST_GROUPS: Array<{
  kind: AgentTemplateChecklistKind;
  key: "skills" | "subagents" | "mcps";
}> = [
  { kind: "skill", key: "skills" },
  { kind: "subagent", key: "subagents" },
  { kind: "mcp", key: "mcps" },
];

export function galleryAgentTemplates(templates: readonly AgentTemplate[]): AgentTemplate[] {
  return templates.filter((template) => !template.gallery_excluded);
}

export function shippedAgentTemplates(templates: readonly AgentTemplate[]): AgentTemplate[] {
  return galleryAgentTemplates(templates).filter((template) => template.status === "shipped");
}

export function findAgentTemplate(
  templates: readonly AgentTemplate[],
  id: string,
): AgentTemplate | undefined {
  return templates.find((template) => template.id === id);
}

export function publicAgentTemplateItemFields(
  item: AgentTemplateItem,
): Array<[string, string]> {
  return Object.entries(item as unknown as Record<string, unknown>).filter(
    (entry): entry is [string, string] => {
      const [key, value] = entry;
      return !EXPLICIT_ITEM_FIELDS.has(key) && !key.startsWith("_") && typeof value === "string";
    },
  );
}

export function agentTemplateItemSourceNote(item: AgentTemplateItem): string | null {
  if (!item.source || item.source === "publisher-authored") return null;
  return item.source;
}

function checklistProse(item: AgentTemplateItem): string {
  return `${item.source ?? ""} ${item.note ?? ""} ${item.delta ?? ""} ${item.reason ?? ""}`.toLowerCase();
}

function isOptionalMcp(item: AgentTemplateItem): boolean {
  return checklistProse(item).includes("optional");
}

function isNotBundledMcp(item: AgentTemplateItem): boolean {
  return checklistProse(item).includes("not bundled");
}

export function buildAgentTemplateChecklist(
  template: AgentTemplate,
): AgentTemplateChecklistItem[] {
  return CHECKLIST_GROUPS.flatMap((group) =>
    (template[group.key] ?? [])
      .filter((item) => !item.hidden)
      .map((item, index) => {
        const notBundled = group.kind === "mcp" && isNotBundledMcp(item);
        return {
          id: `${group.kind}:${index}`,
          kind: group.kind,
          name: item.name,
          required: group.kind === "mcp" && !isOptionalMcp(item) && !notBundled,
          notBundled,
          item,
        };
      }),
  );
}

export function isAgentTemplateChecklistItemSelectable(
  entry: AgentTemplateChecklistItem,
): boolean {
  return entry.kind !== "subagent" && !entry.notBundled;
}

export function isAgentTemplateChecklistItemAvailable(
  entry: AgentTemplateChecklistItem,
  availableSkillIds: ReadonlySet<string> | null | undefined,
): boolean {
  return entry.kind !== "skill"
    || availableSkillIds == null
    || availableSkillIds.has(entry.name);
}

export function defaultAgentTemplateChecklistSelection(
  template: AgentTemplate,
  availableSkillIds?: ReadonlySet<string> | null,
): Set<string> {
  return new Set(
    buildAgentTemplateChecklist(template)
      .filter((entry) =>
        isAgentTemplateChecklistItemSelectable(entry)
        && isAgentTemplateChecklistItemAvailable(entry, availableSkillIds))
      .map((entry) => entry.id),
  );
}

export function buildAgentTemplateCreateFields(
  template: AgentTemplate,
  selection: ReadonlySet<string>,
  availableSkillIds?: ReadonlySet<string> | null,
  options?: { includeMcps?: boolean },
): { desiredSkills: string[]; desiredMcps: string[] } {
  const checklist = buildAgentTemplateChecklist(template);
  return {
    desiredSkills: checklist
      .filter((entry) =>
        entry.kind === "skill"
        && selection.has(entry.id)
        && isAgentTemplateChecklistItemAvailable(entry, availableSkillIds))
      .map((entry) => entry.name),
    desiredMcps: checklist
      .filter((entry) =>
        options?.includeMcps !== false
        && entry.kind === "mcp"
        && !entry.notBundled
        && (entry.required || selection.has(entry.id)))
      .map((entry) => entry.name),
  };
}
