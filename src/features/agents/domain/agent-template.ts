export type AgentTemplateStatus =
  | "shipped"
  | "publisher-authored"
  | "earlier-revision"
  | "fast-follow-pending"
  | "not-distributable"
  | "held"
  | "staged"
  | "shipped-ok";

export type AgentTemplateItemKind = "skill" | "subagent" | "mcp" | "soul" | "cli";

export interface AgentTemplateSource {
  repo?: string;
  license?: string;
  license_short?: string;
  license_restricted?: boolean;
  copyright?: string;
  pin?: string;
  status?: string;
}

export interface AgentTemplateItem extends AgentTemplateSource {
  name: string;
  kind?: AgentTemplateItemKind;
  delta?: string;
  note?: string;
  source?: string;
  reason?: string;
  hidden?: boolean;
  hidden_reason?: string;
}

export interface AgentTemplateSoulRef {
  kind: "soul";
  source?: string;
  note?: string;
}

export interface AgentTemplateLocalFootprint {
  required: boolean;
  disclosure: string;
  note?: string;
}

export interface AgentTemplateBundlingCondition {
  component: string;
  bundled: boolean;
  if_bundled: string[];
}

export interface AgentTemplate {
  id: string;
  name: string;
  role: string;
  card_blurb?: string;
  status: AgentTemplateStatus;
  multi_agent?: boolean;
  reason?: string;
  publisher?: { name: string; slug: string };
  gallery_excluded?: boolean;
  gallery_excluded_reason?: string;
  mandated_attribution?: string;
  suggested_model?: string;
  suggested_provider?: string;
  soul?: AgentTemplateSoulRef;
  source_default?: AgentTemplateSource;
  subagents?: AgentTemplateItem[];
  skills?: AgentTemplateItem[];
  mcps?: AgentTemplateItem[];
  hide_mcps_from_detail?: boolean;
  clis?: AgentTemplateItem[];
  platform_note?: string;
  note?: string;
  provenance_note?: string;
  gate_note?: string;
  local_footprint?: AgentTemplateLocalFootprint;
  bundling_conditions?: AgentTemplateBundlingCondition[];
  forward_obligation?: string;
}

export function resolveAgentTemplateItemSource(
  item: AgentTemplateItem,
  template: AgentTemplate,
): AgentTemplateSource {
  if (item.repo || item.license) {
    return {
      repo: item.repo,
      license: item.license,
      license_short: item.license_short,
      license_restricted: item.license_restricted,
      copyright: item.copyright,
      pin: item.pin,
      status: item.status,
    };
  }
  if (item.source) return { status: item.status };
  if (template.source_default) return { ...template.source_default };
  return { status: "publisher-authored" };
}

export function agentTemplateRestrictsCommercialUse(template: AgentTemplate): boolean {
  const sections = [template.skills, template.subagents, template.mcps, template.clis];
  return sections.some((items) =>
    (items ?? []).some((item) => {
      const source = resolveAgentTemplateItemSource(item, template);
      return source.license_restricted === true
        || Boolean(source.repo && !source.license)
        || Boolean(source.license && source.license_restricted === undefined);
    }),
  );
}

export function visibleAgentTemplateItems(items?: AgentTemplateItem[]): AgentTemplateItem[] {
  return (items ?? []).filter((item) => !item.hidden);
}
