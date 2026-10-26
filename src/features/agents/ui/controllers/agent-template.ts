import {
  findAgentTemplate,
  galleryAgentTemplates,
  publicAgentTemplateItemFields,
  shippedAgentTemplates,
  agentTemplateItemSourceNote,
  buildAgentTemplateChecklist,
  buildAgentTemplateCreateFields,
  defaultAgentTemplateChecklistSelection,
  isAgentTemplateChecklistItemAvailable,
  isAgentTemplateChecklistItemSelectable,
  type AgentTemplateChecklistItem,
} from "../../application/agent-template";
import {
  readAgentTemplateCatalog,
  soulForTemplateId,
  templateHasSoul,
} from "../../adapters/agent-template";
import {
  agentTemplateRestrictsCommercialUse,
  resolveAgentTemplateItemSource,
  visibleAgentTemplateItems,
  type AgentTemplate,
  type AgentTemplateBundlingCondition,
  type AgentTemplateItem,
  type AgentTemplateLocalFootprint,
  type AgentTemplateSoulRef,
  type AgentTemplateSource,
} from "../../domain/agent-template";

export type {
  AgentTemplate,
  AgentTemplateBundlingCondition,
  AgentTemplateChecklistItem,
  AgentTemplateItem,
  AgentTemplateLocalFootprint,
  AgentTemplateSoulRef,
  AgentTemplateSource,
};

export type SourceRef = AgentTemplateSource;
export type TemplateItem = AgentTemplateItem;
export type SoulRef = AgentTemplateSoulRef;
export type LocalFootprint = AgentTemplateLocalFootprint;
export type BundlingCondition = AgentTemplateBundlingCondition;
export type TemplateChecklistItem = AgentTemplateChecklistItem;

export {
  agentTemplateItemSourceNote,
  agentTemplateRestrictsCommercialUse,
  buildAgentTemplateChecklist,
  buildAgentTemplateCreateFields,
  defaultAgentTemplateChecklistSelection,
  isAgentTemplateChecklistItemAvailable,
  isAgentTemplateChecklistItemSelectable,
  publicAgentTemplateItemFields,
  resolveAgentTemplateItemSource,
  soulForTemplateId,
  templateHasSoul,
  visibleAgentTemplateItems,
};

export const AGENT_TEMPLATE_RESTRICTION_TEXT =
  "Contains components that may restrict commercial use — see details.";
export const RESTRICTION_FLAG_TEXT = AGENT_TEMPLATE_RESTRICTION_TEXT;

const DEFAULT_PUBLISHER = {
  name: "3XIA00",
  slug: "136154-moss-9ab7",
} as const;
export const TEMPLATE_PUBLISHER_SLUG = DEFAULT_PUBLISHER.slug;
export const TEMPLATE_PUBLISHER_NAME = DEFAULT_PUBLISHER.name;
export const TEMPLATE_PUBLISHER = `${TEMPLATE_PUBLISHER_NAME} (@${TEMPLATE_PUBLISHER_SLUG})`;

const STATUS_LABELS: Record<string, string> = {
  shipped: "Shipped",
  "publisher-authored": "Publisher-authored",
  "shipped-ok": "Shipped",
  "earlier-revision": "Earlier revision",
  "fast-follow-pending": "Fast-follow pending",
  "not-distributable": "Not distributable",
  held: "Held",
  staged: "Staged (not yet published)",
};

const MODEL_LABELS: Record<string, string> = {
  "claude-fable-5-1": "Fable 5.1",
  "claude-fable-5": "Fable 5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-opus-5": "Opus 5",
  "claude-opus-4-8": "Opus 4.8",
  "claude-opus-4-7": "Opus 4.7",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
};

const ROLE_WORD_OVERRIDES: Record<string, string> = { qa: "QA" };

export function getAgentTemplates(): readonly AgentTemplate[] {
  return readAgentTemplateCatalog();
}

export function getGalleryAgentTemplates(): AgentTemplate[] {
  return galleryAgentTemplates(readAgentTemplateCatalog());
}

export function getShippedAgentTemplates(): AgentTemplate[] {
  return shippedAgentTemplates(readAgentTemplateCatalog());
}

export function getAgentTemplateById(id: string): AgentTemplate | undefined {
  return findAgentTemplate(readAgentTemplateCatalog(), id);
}

export function getAgentHubTemplates(): {
  templates: AgentTemplate[];
  previewAll: boolean;
} {
  const previewAll = import.meta.env.DEV
    && typeof localStorage !== "undefined"
    && localStorage.getItem("puffo-template-preview-all") === "1";
  return {
    templates: previewAll ? getGalleryAgentTemplates() : getShippedAgentTemplates(),
    previewAll,
  };
}

export function agentTemplatePublisher(template: Pick<AgentTemplate, "publisher">): string {
  const publisher = template.publisher ?? DEFAULT_PUBLISHER;
  return `${publisher.name} (@${publisher.slug})`;
}

export function agentTemplateStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function agentTemplateRoleWord(id: string): string {
  return ROLE_WORD_OVERRIDES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function agentTemplateModelLabel(modelId: string): string {
  return MODEL_LABELS[modelId] ?? modelId;
}

export function agentTemplateProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export const getTemplates = getAgentTemplates;
export const getGalleryTemplates = getGalleryAgentTemplates;
export const getShippedTemplates = getShippedAgentTemplates;
export const getTemplateById = getAgentTemplateById;
export const getHubTemplates = getAgentHubTemplates;
export const resolvePublisher = agentTemplatePublisher;
export const resolveItemSource = resolveAgentTemplateItemSource;
export const templateRestrictsCommercialUse = agentTemplateRestrictsCommercialUse;
export const publicItemExtraFields = publicAgentTemplateItemFields;
export const sourceNote = agentTemplateItemSourceNote;
export const statusLabel = agentTemplateStatusLabel;
export const templateRoleWord = agentTemplateRoleWord;
export const modelLabel = agentTemplateModelLabel;
export const providerLabel = agentTemplateProviderLabel;
export const buildTemplateChecklist = buildAgentTemplateChecklist;
export const templateChecklistDefaultSelection = defaultAgentTemplateChecklistSelection;
export const buildTemplateCreateFields = buildAgentTemplateCreateFields;
export const isSelectableEntry = isAgentTemplateChecklistItemSelectable;
export const isCatalogAvailable = isAgentTemplateChecklistItemAvailable;
