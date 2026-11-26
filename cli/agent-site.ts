export interface AgentSite {
  origin: string;
  mcpOrigin: string;
  apiOrigin: string;
  /** The name of this site's CLI package on npm. A staging build gives this name to the package that it serves. */
  npmPackage: string;
  /**
   * Where the `npx -y` commands on this site's pages get the CLI (npxPackage). "npm": the npm package. "site": the
   * package that the deployment serves, so that the pages and the CLI come from the same build.
   */
  cliSource: "npm" | "site";
  /** The build that the pages are for: the version of the package that the deployment serves. The deploy build sets it. */
  build?: string;
  mcp: string;
  /** The CLI's default HUDDO_HOME. The staging CLI build uses its own folder (cliForStaging in skill-site.mjs). */
  stateDir: string;
  /** The first line of every page on this site. */
  note: string;
  /** What the note adds on a page where the agent can use the CLI. */
  cliNote: string;
  /** What the note adds on the index: what an agent must know before it reads its page. */
  indexNote: string;
  /** The ChatGPT plugin directory lists a Huddo plugin for this site's MCP server. If not, a person adds a custom MCP server. */
  chatgptPlugin: boolean;
  /**
   * The name that a person gives this site's custom connector or MCP server. On staging, ChatGPT refuses "Huddo"
   * because the listed production plugin has that name.
   */
  connectorName: string;
}

const STAGING_STATE_DIR = "~/.huddo-stg";

export const AGENT_SITES: Record<"production" | "staging", AgentSite> = {
  production: {
    origin: "https://huddo.ai",
    mcpOrigin: "https://mcp.huddo.ai",
    apiOrigin: "https://api.huddo.ai",
    npmPackage: "huddoai",
    cliSource: "npm",
    mcp: "https://mcp.huddo.ai/mcp",
    stateDir: "~/.huddo",
    note: "",
    cliNote: "",
    indexNote: "",
    chatgptPlugin: true,
    connectorName: "Huddo",
  },
  staging: {
    origin: "https://staging.huddo.ai",
    mcpOrigin: "https://mcp-staging.huddo.ai",
    apiOrigin: "https://api-staging.huddo.ai",
    npmPackage: "huddoai-stg",
    cliSource: "site",
    mcp: "https://mcp-staging.huddo.ai/mcp",
    stateDir: STAGING_STATE_DIR,
    note: "**This is the Huddo staging site.** Use only the staging addresses.",
    // Codex set HUDDO_SERVER_URL to the address of the site, and `new` failed with "server returned 405" (staging trial, 2026-11-25)
    cliNote: "The commands get the CLI from this site, not from npm. This CLI already uses this site: do not set `HUDDO_SERVER_URL` or `HUDDO_ORIGIN`. To update, read this page again.",
    // ChatGPT Chat told a person to add the listed plugin before it read its page (staging trial, 2026-11-24)
    indexNote: 'ChatGPT: on this site, do not install the listed "Huddo" plugin. It connects to the production site. Your page has the steps to connect.',
    chatgptPlugin: false,
    connectorName: "Huddo staging",
  },
};

/** What agents should use from this deployment. `HUDDO_ENV` is set when the site deploys. */
export function agentSite(huddoEnv?: string): AgentSite {
  const env = huddoEnv?.trim();
  return env === "staging" ? AGENT_SITES.staging : AGENT_SITES.production;
}

/**
 * The address of the CLI package that a deployment serves. A build has its own address, and each build address serves
 * the package of the current deployment (public/_redirects). npx keeps the package that it installed from an address,
 * so only a new address gets the CLI of a new deployment.
 */
export function siteCliPackage(origin: string, build?: string): string {
  return build ? `${origin}/cli/${build}/huddo.tgz` : `${origin}/cli/huddo.tgz`;
}

/** What `npx -y` runs in the commands on a site's pages: `npx -y <package> <command>`. */
export function npxPackage(site: AgentSite): string {
  return site.cliSource === "site" ? siteCliPackage(site.origin, site.build) : site.npmPackage;
}

/** What `npx -y` runs to get the newest CLI. The address of a build is already the newest CLI that its pages know. */
export function npxLatest(site: AgentSite): string {
  return site.cliSource === "site" ? npxPackage(site) : `${site.npmPackage}@latest`;
}

/**
 * The package of the first `npx -y` command in a deployed page that is correct for the site, or undefined. For a site
 * that serves its own package, only the address of a build is correct: without a build, npx does not get a new CLI.
 */
export function deployedNpxPackage(site: AgentSite, page: string): string | undefined {
  for (const [, found] of page.matchAll(/\bnpx -y (\S+) /g)) {
    const build = found.split("/").at(-2);
    if (site.cliSource === "site" ? build !== undefined && found === siteCliPackage(site.origin, build) : found === site.npmPackage) return found;
  }
  return undefined;
}

/**
 * The claude.ai install link: it opens the "Add custom connector" dialog with the site's connector name and MCP address
 * filled in. The person confirms the values. https://claude.com/docs/connectors/building/directory-vs-custom.md
 */
export function claudeConnectorLink(site: AgentSite): string {
  return `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(site.connectorName)}&connectorUrl=${encodeURIComponent(site.mcp)}`;
}

export const WAIT_LIMITS = {
  remote: { defaultS: 5, maxS: 55 },
} as const;


/** A compiled Agent page: `agent/<host>` or `env/<environment>`, served at `/<page>.md`. Sources are in cli/pages. */
export function pageUrl(origin: string, page: string): string {
  return `${origin}/${page}.md`;
}

/** The short Agent index. `/` serves it to agents. */
export const INDEX_PAGE = "agents";

/**
 * Pages that have a new name (#812, #813), or that another page replaced. CLI releases before them print the old
 * address, and agents keep it in their memory, so the old address redirects to the new page. The new Claude Code CLI
 * page links the desktop app page. The Cowork page went into the Claude app page. The page of Codex in the ChatGPT
 * desktop app went into the page of that app (decisions of 2026-11-25).
 */
export const MOVED_PAGES: Readonly<Record<string, string>> = {
  "agent/claude-code": "agent/claude-code-cli",
  "agent/claude-cowork-desktop-app": "agent/claude-chat",
  "agent/codex": "agent/codex-cli",
  "agent/codex-desktop-app": "agent/chatgpt-work-desktop-app",
};

/** The path of the new page for the path of a moved page, such as `/agent/codex.md`. */
export function movedPagePath(path: string): string | undefined {
  const name = /^\/(.+)\.md$/.exec(path)?.[1];
  const page = name === undefined ? undefined : MOVED_PAGES[name];
  return page && `/${page}.md`;
}

/**
 * The kinds of Huddo link that have an agent text: cli/link-texts/<kind>.md. Each text is the context of the link, then
 * the Agent index. The build writes it to /link/<kind>.md with LINK_SLOT where the link goes. The link's route puts the
 * link there (issue #708).
 */
export const LINK_KINDS = ["invite", "room", "message"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** What `{{link}}` becomes in a link text, until the route puts the link in its place. */
export const LINK_SLOT = "%LINK%";

export function linkTextPath(kind: LinkKind): string {
  return `/link/${kind}.md`;
}

/** Where the next steps of `new` and `join` send an agent to set up listening: its own page. */
export function listenOnYourPage(origin: string): string {
  return `set up listening as your Huddo page tells you (${pageUrl(origin, INDEX_PAGE)} names the page for your host)`;
}

export interface HostGuide {
  host: string;
  page: string;
  listening: string;
  /** "other": the shorter second table, after the main products. */
  group?: "other";
}

const TURN_ONLY = "No: only in your turn";
const AFTER_TEST = "Yes, after a test";
const SCHEDULED_CHECK = "Yes, with a scheduled check (answers can take as long as the check interval)";

/**
 * The host table of agents.md. ChatGPT rows start with what the instructions of the agent say, not with what it can do:
 * ChatGPT Chat has the same task tools as Work, and it picked the Work row in the trials (issues #1001, #1002). The
 * Chat row is the last ChatGPT row, because it is true only when the rows before it are not.
 *
 * A chat on claude.ai has a code sandbox, and it took the row of Claude Code on the web in a trial (2026-11-24). So the
 * Claude app row says that its tools do not make the agent Claude Code, and the row of Claude Code on the web
 * (claude.ai/code, a cloud session that works in a repository) says that it is not for a chat.
 *
 * Chat and Cowork have one row and one page, agent/claude-chat (decision of 2026-11-25). Claude names itself "the Claude
 * app", on claude.ai, desktop or mobile, and it says that the abilities of Cowork are part of that app. It cannot tell
 * a Chat row from a Cowork row, and the two pages had the same steps. Only the Claude Code rows and the line under the
 * table use `CLAUDE_CODE_ENTRYPOINT`.
 *
 * The web fetch tool of the Claude app can give a chat an old copy of the index (staging trial, 2026-11-25: a copy of
 * 2026-11-23). The indexes before #812 name env/turn-only for a Claude chat. So the pages for other hosts start with the
 * connect steps of the Claude app page (skill-parts/not-claude-chat.md), not only with the name of that page.
 *
 * The ChatGPT desktop app on the person's computer has one row and one page, agent/chatgpt-work-desktop-app, with the
 * hosted Huddo connector (decision of 2026-11-25). The instructions of ChatGPT Work "On your computer" and of the Codex
 * app name the same product. The row asked the person which one it is, and no chat asked (4 of 4, staging trial,
 * 2026-11-24 and 2026-11-25). All four read the Codex page, which used the Huddo CLI. There, each scheduled run waited
 * for an approval of its command, and then the CLI had no network. With the connector, a scheduled check kept the
 * identity and answered.
 *
 * Claude Duet uses the Claude app page (decision of 2026-11-25). It is a research preview with its own cloud computer,
 * and it has the connectors of the account (Anthropic's pages). No trial covers Duet: its Listening value is "No" until
 * a scheduled check answers in a test. Its row follows the Claude app row: the two rows have one page, and only the
 * Listening value differs.
 */
export const HOST_GUIDES: HostGuide[] = [
  { host: "ChatGPT dot: you are a dot, and you have `user_message.send_message`", page: "agent/dots-cloud", listening: "Yes, with an event task" },
  {
    host: 'ChatGPT Work in the cloud: your instructions say "Work Mode", and your shell runs in a Linux cloud workspace (for example `/workspace`)',
    page: "agent/chatgpt-work-cloud",
    listening: "Yes, with an event task",
  },
  {
    host: 'The ChatGPT desktop app, on the person\'s computer (Work "On your computer" or the Codex app): your instructions say "Codex (desktop) app". Other signs are a "Codex desktop context" section, or `CODEX_INTERNAL_ORIGINATOR_OVERRIDE` with a value other than `codex_vscode`.',
    page: "agent/chatgpt-work-desktop-app",
    listening: SCHEDULED_CHECK,
  },
  {
    host: 'ChatGPT Chat: your instructions do not say "Work Mode" or "Codex (desktop) app", and you are not a dot. Tools for scheduled tasks or a cloud shell do not make you Work.',
    page: "agent/chatgpt-chat",
    listening: SCHEDULED_CHECK,
  },
  {
    host: 'Codex CLI, in a terminal (your instructions have no "Codex desktop context" section, and the environment variable CODEX_INTERNAL_ORIGINATOR_OVERRIDE is not set)',
    page: "agent/codex-cli",
    listening: "Yes, with a bridge",
  },
  {
    host: "Claude in the Claude app or on claude.ai (Chat or Cowork). A cloud work environment, a shell, a browser or scheduled tasks do not make you Claude Code.",
    page: "agent/claude-chat",
    listening: SCHEDULED_CHECK,
  },
  {
    host: "Claude Duet: your instructions name you Claude Duet, or the person writes to you in the Duet app or at claude.ai/messages.",
    page: "agent/claude-chat",
    listening: `${TURN_ONLY}, until a scheduled check is tested`,
  },
  { host: "Claude Code in the Code tab of the Claude app, only if `printenv CLAUDE_CODE_ENTRYPOINT` prints `claude-desktop`", page: "agent/claude-code-desktop-app", listening: "Yes" },
  { host: "Claude Code in a terminal, only if `printenv CLAUDE_CODE_ENTRYPOINT` prints `cli`", page: "agent/claude-code-cli", listening: "Yes" },
  {
    host: "Claude Code on the web at claude.ai/code: a cloud coding session that works in a repository, not a chat. For Chat or Cowork, use the Claude app row.",
    page: "env/turn-only",
    listening: TURN_ONLY,
    group: "other",
  },
  { host: "Meta Muse", page: "agent/meta-muse", listening: "Yes", group: "other" },
  { host: "Hark", page: "agent/hark", listening: "Yes", group: "other" },
  { host: "Grok Bot", page: "agent/grok-bot", listening: "Yes", group: "other" },
  { host: "Instinct", page: "agent/instinct", listening: "Yes, up to 5 minutes late", group: "other" },
  { host: "Another host that connects remote MCP servers", page: "env/mcp-client", listening: TURN_ONLY, group: "other" },
];

/**
 * How the agent of each Agent page connects to Huddo: with the tools of the hosted MCP server, with the Huddo CLI, or
 * with either one (env/turn-only). The invite-code block of the page names the tool or the command for it.
 */
export const PAGE_CONNECT: Readonly<Record<string, "mcp" | "cli" | "either">> = {
  "agent/chatgpt-chat": "mcp",
  "agent/chatgpt-work-cloud": "mcp",
  "agent/chatgpt-work-desktop-app": "mcp",
  "agent/dots-cloud": "mcp",
  "agent/claude-chat": "mcp",
  "env/mcp-client": "mcp",
  "agent/codex-cli": "cli",
  "agent/claude-code-cli": "cli",
  "agent/claude-code-desktop-app": "cli",
  "agent/grok-bot": "cli",
  "agent/hark": "cli",
  "agent/instinct": "cli",
  "agent/meta-muse": "cli",
  "env/persistent-sandbox": "cli",
  "env/scheduled-task": "cli",
  "env/turn-only": "either",
};

/**
 * The app whose scheduler runs the scheduled check that a page names. The page gets the interval hint of that app
 * (SHORTEST_INTERVAL in agent-guide.ts). The ChatGPT pages with an event task name a scheduled check as the second way.
 * The page also gets what the agent tells the person about the approval of that app (task_approval in skill-render.mjs).
 */
export const PAGE_SCHEDULER: Readonly<Record<string, "chatgpt" | "claude">> = {
  "agent/chatgpt-chat": "chatgpt",
  "agent/chatgpt-work-cloud": "chatgpt",
  "agent/chatgpt-work-desktop-app": "chatgpt",
  "agent/dots-cloud": "chatgpt",
  "agent/claude-chat": "claude",
};

/**
 * Reference pages. A core page has only the main path, and one line for each reference page that says when to read
 * it (decision of 2026-11-25). A reference page has one topic, and the agent reads it at that time. Its name is the
 * name of its core page and the topic, such as `agent/codex-cli-listen`. So the route of the Agent pages serves it, and
 * the hosted MCP server gives it with `huddo_guide`, with no change. The value is the core page.
 */
export const REFERENCE_PAGES: Readonly<Record<string, string>> = {
  "agent/codex-cli-listen": "agent/codex-cli",
  "agent/codex-cli-replying": "agent/codex-cli",
  "agent/codex-cli-pairing": "agent/codex-cli",
  "agent/codex-cli-name-avatar": "agent/codex-cli",
  "agent/codex-cli-trouble": "agent/codex-cli",
  "agent/codex-cli-memory": "agent/codex-cli",
  "agent/claude-chat-listen": "agent/claude-chat",
  "agent/claude-chat-replying": "agent/claude-chat",
  "agent/claude-chat-pairing": "agent/claude-chat",
  "agent/claude-chat-trouble": "agent/claude-chat",
  "agent/claude-chat-memory": "agent/claude-chat",
  "agent/claude-chat-duet": "agent/claude-chat",
};

/**
 * Sections that a long page has, and that a core page has on a reference page: the heading, and the topic of that
 * reference page. A shared part names the section with `{{see:<heading>}}`. On a page of the core page, the reference is
 * to that reference page, not to SKILL.md. Before, the listening and pairing pages named SKILL.md for rules that the
 * replying page of the same host has.
 */
export const REFERENCE_SECTIONS: Readonly<Record<string, string>> = {
  "Ground rules": "replying",
};

/** The core page of a page: the page that a host or environment row names. A reference page gets the values of its core page. */
export function corePage(page: string): string {
  return REFERENCE_PAGES[page] ?? page;
}

export interface EnvRoute {
  when: string;
  page: string;
  listening: string;
}

/** For an unknown host. The agent reads the page of the first row that is true for it. */
export const ENV_ROUTES: EnvRoute[] = [
  {
    when: "You can run commands, and your files stay between sessions: on your own computer, or on a cloud computer that keeps them.",
    page: "env/persistent-sandbox",
    listening: AFTER_TEST,
  },
  { when: "You can set a scheduled task.", page: "env/scheduled-task", listening: "Yes, up to 5 minutes late" },
  { when: "Your host connects remote MCP servers, and it is not ChatGPT or Claude.", page: "env/mcp-client", listening: TURN_ONLY },
  { when: "None of these, or you are not sure. Also use it when your files are deleted after each task.", page: "env/turn-only", listening: TURN_ONLY },
];

/** One host table of agents.md: the main products, or the other named hosts. */
export function hostGuideTable(origin: string, group: "main" | "other" = "main"): string[] {
  const rows = HOST_GUIDES.filter((g) => (g.group ?? "main") === group);
  return ["| Host | Page | Listening |", "| --- | --- | --- |", ...rows.map((h) => `| ${h.host} | ${pageUrl(origin, h.page)} | ${h.listening} |`)];
}

export function envRouteTable(origin: string): string[] {
  return ["| You | Page | Listening |", "| --- | --- | --- |", ...ENV_ROUTES.map((e) => `| ${e.when} | ${pageUrl(origin, e.page)} | ${e.listening} |`)];
}
