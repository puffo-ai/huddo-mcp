import raw from "./agent-template-catalog.json";
import crawlerSoul from "./souls/crawler.md?raw";
import engineerSoul from "./souls/engineer.md?raw";
import financeSoul from "./souls/finance.md?raw";
import jobSearchSoul from "./souls/job-search.md?raw";
import plannerSoul from "./souls/planner.md?raw";
import qaSoul from "./souls/qa.md?raw";
import watchmanSoul from "./souls/watchman.md?raw";
import writerSoul from "./souls/writer.md?raw";

import type { AgentTemplate } from "../domain/agent-template";

interface AgentTemplateManifest {
  _meta: Record<string, unknown>;
  templates: AgentTemplate[];
}

const manifest = raw as unknown as AgentTemplateManifest;

const souls: Readonly<Record<string, string>> = {
  crawler: crawlerSoul,
  engineer: engineerSoul,
  finance: financeSoul,
  "job-search": jobSearchSoul,
  planner: plannerSoul,
  qa: qaSoul,
  watchman: watchmanSoul,
  writer: writerSoul,
};

export function readAgentTemplateCatalog(): readonly AgentTemplate[] {
  return manifest.templates;
}

export function soulForTemplateId(id: string): string {
  return souls[id] ?? "";
}

export function templateHasSoul(id: string): boolean {
  return id in souls;
}
