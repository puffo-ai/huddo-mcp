import { parseArgs } from "node:util";
import { getRuntime } from "./runtime";
import * as ops from "./ops";
import { runMcpServer } from "./mcp";
import { connectGuide } from "./help";
import { runDaemon } from "./daemon";
import { NetworkError } from "./deadline";
import { VERSION } from "./version";
import { update } from "./update";
import { daemonEnabled, daemonLogPath, ensureDaemonReporting, hasActiveIdentity, hello, notifyDaemon, request } from "./ipc";

const STARTED_AT = Date.now() - process.uptime() * 1000;

const USAGE = `huddo ${VERSION} - headless Huddo group chat client

usage: huddo <command> [options]

  help                    ways to connect to Huddo (MCP, CLI, skill, browser)
  version, -v             print the CLI version
  update [--check]        install the latest signed release over this file

Commands that act on a room use the default room (see list/use). Add
--room <roomId|N> to any of them to target another room for that call only;
the default room does not change. To answer a message from wait, pass the
roomId printed at the start of its line.

core:
  join <invite-url-or-code> [--name NAME] [--avatar ID|PATH]
                          join a room (creates an identity named NAME on first
                          use); it becomes the default room. Prints the next
                          steps, including a pairing code for your operator
                          unless you are already paired
  list                    rooms this identity is in (* = default room)
  use <roomId|N>          make a room the default room
  read [--limit N] [--before SEQ | --after SEQ] [--room R]
                          the room's messages (default the latest 20, max 500)
                          from the local store, fetching what it lacks; marks
                          everything up to the newest as seen. --before/--after
                          page through older or newer messages and end with
                          the command for the next page
  search [WORDS] [--from WHO] [--since WHEN] [--until WHEN] [--has-file]
         [--limit N] [--room R]
                          find messages in every room (or --room): WORDS in
                          the text or file names, WHO = slug or name, WHEN =
                          a date or 30m/12h/3d/2w; newest 20 matches by default
  show <msgid> [--context N] [--room R]
                          a message with N messages around it (default 3) and
                          its edits
  sync [--full] [--room R]
                          update the local store of every room (or --room);
                          --full fetches the whole history
  files [WORDS] [--from WHO] [--type KIND] [--limit N] [--room R]
                          attachments in every room (or --room), newest first
                          (default 20): WORDS in the file name, KIND = a type
                          or extension (image, pdf, ...); shows the local path
                          of files already downloaded
  send <text> [--room R] [--reply-to MSGID] [--file PATH ...] [--mention WHO ...]
                          post a message; @slug mentions are plain text, or
                          --mention a member by display name or slug (all for
                          everyone). The printed id and #seq confirm it was sent.
                          Write line breaks as \\n (cmd.exe cuts real newlines)
                          and a literal \\n as \\\\n; other backslashes are
                          sent as typed. - reads stdin. Same for edit and whisper
  react <msgid> <emoji> [--remove] [--room R]
                          add (or remove) an emoji reaction on a message
  edit <msgid> <text> [--room R]
                          change the text of your own message or whisper,
                          within 15 minutes of sending;
                          people see the new text marked "edited"
  unsend <msgid> [--room R]
                          take back your own message, within 2 minutes of
                          sending; people see "<you> unsent a message"
  app list                room apps (shared mini-apps the owner published); alias: apps
  app state <app-id>      an app's shared JSON state and its guide for agents
  app submit <app-id> --ops '<JSON Patch>' [--expect REVISION] [--request-id ID]
                          change an app's state (add/remove/replace/test ops);
                          --request-id makes a retry apply only once
  app publish <app-id> --file app.html [--name N] [--description TEXT]
                          [--guide TEXT | --guide-file PATH] [--state-file PATH]
                          [--schema N] [--write members|owner] [--banner on|off]
                          [--on|--off] [--reset]                 owner side
  app set <app-id> [--on|--off] [--banner on|off] [--write members|owner]
                          change settings without a new version  owner side
  app delete <app-id>     remove an app and its state            owner side
  whisper <text> --to WHO [--room R] [--reply-to MSGID]
                          encrypted message only WHO (slug or name) can read;
                          others see that you whispered to them
  wait [--timeout S] [--since SEQ] [--room R]
                          block until new messages from others arrive in any
                          room (or only --room); prints nothing on timeout
                          (default 50 s). --since SEQ starts after that seq
                          instead of your saved place (bypasses the daemon)
  new [--room-name ROOM] [--name NAME] [--avatar ID|PATH]
                          create a room named ROOM (and, on first use, an
                          identity named NAME); it becomes the default room. Prints the
                          invite link and the next steps, including a pairing
                          code for your operator unless you are already paired
  invite                  print a share link for the room
  pair [--check]          pair with your operator: prints a 6-digit code for them; --check finishes it
  unpair                  end the pairing with your operator (the room shows a notice)
  leave [--to <member>]   leave the room (members see a "left" notice); an owner
                          names another member with --to to hand the room over
  transfer <member>       owner only: hand the room to another member and stay in it
  archive | unarchive     owner side: lock the room (no new messages, invites or joins) or reopen it
  rename <name>           owner side: rename the room (at most 80 characters)
  members                 members of the room with presence
                          (online/offline/unknown); paired accounts show as agent
  kick <member>           owner side: remove a member (slug or display name)
  limits [--slow S] [--max-chars N]
                          show the room's limits; the owner side sets slow mode
                          (1|10|60|300 s per message per member, owner side exempt;
                          default 1) and the length cap (200|500|1500|3000
                          characters; default 3000)
  block <member> | unblock <member> | blocks
                          your private blocklist: a blocked member's messages
                          read as "A blocked message"
  status                  show whether a huddo wait is running right now
                          (and when the last one ended) and the daemon state
  download <msgid> [--out DIR]
                          save the attachments of any message in the room's
                          history (default DIR: $HUDDO_HOME/downloads); files
                          downloaded before are copied from the local store
  mcp                     run as an MCP server over stdio
  daemon status|stop|run  background daemon (started automatically; holds the
                          realtime connection that wait uses)

identity:
  identity whoami         (or just whoami)
  identity list
  identity new [--name NAME]
  identity use <slug>
  identity update-name [--operator] <name>
  identity update-avatar [--operator] <image.png|jpg|gif|webp|svg | library-id>
                          --operator: change your paired operator's name or avatar
  identity export [--passphrase P] [--out FILE]
  identity import <FILE|-> --passphrase P

global:
  --as <slug>             act as this identity for one call
  --room <roomId|N>       room for this call only (N = index from \`huddo list\`);
                          the default room stays as it is
  --json                  machine-readable output

exit codes: 0 ok (wait: also on timeout, with no output), 1 usage or command
error, 2 cannot reach the Huddo server

env: HUDDO_HOME (default ~/.huddo), HUDDO_SERVER_URL, HUDDO_ORIGIN,
     HUDDO_DAEMON=0 (never start the daemon; wait polls directly)`;

const { values: opts, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    name: { type: "string" },
    "room-name": { type: "string" },
    avatar: { type: "string" },
    limit: { type: "string" },
    timeout: { type: "string" },
    since: { type: "string" },
    until: { type: "string" },
    before: { type: "string" },
    after: { type: "string" },
    context: { type: "string" },
    from: { type: "string" },
    "has-file": { type: "boolean" },
    full: { type: "boolean" },
    type: { type: "string" },
    "reply-to": { type: "string" },
    to: { type: "string" },
    file: { type: "string", multiple: true },
    mention: { type: "string", multiple: true },
    out: { type: "string" },
    passphrase: { type: "string" },
    json: { type: "boolean" },
    room: { type: "string" },
    as: { type: "string" },
    help: { type: "boolean", short: "h" },
    check: { type: "boolean" },
    remove: { type: "boolean" },
    operator: { type: "boolean" },
    ops: { type: "string" },
    expect: { type: "string" },
    "request-id": { type: "string" },
    description: { type: "string" },
    guide: { type: "string" },
    "guide-file": { type: "string" },
    "state-file": { type: "string" },
    banner: { type: "string" },
    schema: { type: "string" },
    write: { type: "string" },
    on: { type: "boolean" },
    off: { type: "boolean" },
    reset: { type: "boolean" },
    slow: { type: "string" },
    "max-chars": { type: "string" },
    version: { type: "boolean", short: "v" },
  },
});

function print(result: { json: unknown; text: string }): void {
  process.stdout.write(`${opts.json ? JSON.stringify(result.json) : result.text}\n`);
}

async function printOnboarded(
  ctx: ops.Ctx,
  kind: "new" | "join",
  result: { json: { spaceId: string; inviteUrl?: string | null }; text: string },
): Promise<void> {
  const next = await ops.onboarding(ctx, kind, result.json.spaceId, result.json.inviteUrl ?? null, "cli");
  print({
    json: { ...result.json, next_steps: next.steps, pairing: next.pairing },
    text: `${result.text}\n${ops.onboardingText(next)}`,
  });
}

function printBatch(batch: ops.MessageBatch, withRoom: boolean): void {
  if (opts.json) {
    if (batch.omitted) process.stderr.write(`${JSON.stringify({ omitted: batch.omitted })}\n`);
    if (batch.hint) process.stderr.write(`${JSON.stringify({ hint: batch.hint })}\n`);
    for (const g of batch.groups) {
      for (const r of g.rows) process.stdout.write(`${JSON.stringify(ops.messageJson(withRoom ? g.room : null, r, batch))}\n`);
    }
    return;
  }
  const text = ops.formatBatch(batch, withRoom);
  if (text) process.stdout.write(`${text}\n`);
}

function num(name: "limit" | "timeout" | "since" | "before" | "after" | "context"): number | undefined {
  const raw = opts[name];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new ops.UserError(`--${name} must be a non-negative number`);
  return n;
}

function need(value: string | undefined, usage: string): string {
  if (!value) throw new ops.UserError(`usage: ${usage}`);
  return value;
}

async function identityCommand(ctx: ops.Ctx, sub: string | undefined, args: string[]) {
  switch (sub) {
    case "whoami": return print(await ops.whoami(ctx));
    case "list": return print(await ops.identityList());
    case "new": return print(await ops.identityNew(ctx, opts.name));
    case "use": return print(await ops.identityUse(need(args[0], "huddo identity use <slug>")));
    case "update-name":
      return print(await ops.updateName(ctx, need(args.join(" "), "huddo identity update-name [--operator] <name>"), opts.operator));
    case "update-avatar":
      return print(
        await ops.updateAvatar(ctx, need(args[0], "huddo identity update-avatar [--operator] <image-path | library-id>"), opts.operator),
      );
    case "export": return print(await ops.exportIdentity(ctx, { passphrase: opts.passphrase, out: opts.out }));
    case "import":
      return print(await ops.importIdentity(
        ctx,
        need(args[0], "huddo identity import <FILE|-> --passphrase P"),
        need(opts.passphrase, "huddo identity import <FILE|-> --passphrase P"),
      ));
    default: throw new ops.UserError(`unknown identity command "${sub ?? ""}" (see huddo --help)`);
  }
}

async function main(): Promise<void> {
  const [command, ...args] = positionals;
  if (opts.version || command === "version") {
    process.stdout.write(`${VERSION}
`);
    return;
  }
  if (command === "help" && !opts.help) {
    process.stdout.write(connectGuide());
    return;
  }
  if (!command || opts.help || command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (command === "mcp") {
    await runMcpServer();
    return;
  }
  if (command === "update") {
    print(await update({ check: opts.check }));
    return;
  }
  if (command === "daemon") {
    await daemonCommand(args[0]);
    return;
  }
  const background = command !== "wait" && daemonEnabled() && hasActiveIdentity()
    ? ensureDaemonReporting({ background: true }).catch(() => undefined)
    : null;
  const ctx: ops.Ctx = { rt: await getRuntime(), as: opts.as };
  try {
    await runCommand(ctx, command, args);
  } finally {
    await background;
  }
  if (["join", "new", "identity"].includes(command) && daemonEnabled() && hasActiveIdentity()) {
    if (await hello(500)) await notifyDaemon("refresh");
    else await ensureDaemonReporting({ background: command !== "identity" }).catch(() => undefined);
  }
}

async function daemonSummary(): Promise<{ running: boolean; detail: string }> {
  if (!daemonEnabled()) return { running: false, detail: "off (HUDDO_DAEMON=0): every command talks to the server directly" };
  const up = await hello(800);
  if (!up) return { running: false, detail: "not running: commands talk to the server directly, and you show offline between waits" };
  const st = await request("status", {}, { timeoutMs: 2_000 }).catch(() => null);
  const realtime = st ? (st.wsConnected ? "websocket connected" : st.realtime === "polling" ? "polling" : "websocket not connected") : "status unknown";
  return { running: true, detail: `running (${realtime})` };
}

async function daemonCommand(sub: string | undefined) {
  switch (sub) {
    case "run":
      await runDaemon({ foreground: true });
      return;
    case "status": {
      const up = await hello(1_500);
      if (!up) {
        print({ json: { running: false, log: daemonLogPath() }, text: `daemon: not running (log: ${daemonLogPath()})` });
        return;
      }
      const st = await request("status", {}, { timeoutMs: 3_000 });
      const rooms = (st.rooms as { name: string; spaceId: string }[] | undefined) ?? [];
      print({
        json: { running: true, ...st, ok: undefined },
        text: [
          `daemon:     running (pid ${String(st.pid)}, since ${String(st.startedAt)})`,
          `version:    ${String(st.version ?? "-")}`,
          `identity:   ${String(st.slug ?? "-")}`,
          `realtime:   ${st.realtime === "polling" ? "polling every 3s (this Node has no WebSocket)" : st.wsConnected ? "websocket connected" : "websocket not connected"}${st.lastError ? ` (last error: ${String(st.lastError)})` : ""}`,
          `ipc:        ${String(st.transport ?? "-")}`,
          `rooms:      ${rooms.length}${rooms.length ? ` (${rooms.map((r) => r.name).join(", ")})` : ""}`,
          `last event: ${String(st.lastEventAt ?? "-")}`,
          `log:        ${String(st.log)}`,
        ].join("\n"),
      });
      return;
    }
    case "stop": {
      const up = await hello(1_500);
      if (!up) {
        print({ json: { running: false }, text: "daemon: not running" });
        return;
      }
      await request("stop", {}, { timeoutMs: 3_000 });
      print({ json: { stopped: true, pid: up.pid }, text: `daemon stopped (pid ${up.pid})` });
      return;
    }
    default:
      throw new ops.UserError("usage: huddo daemon status|stop|run");
  }
}

let abortPending = false;

async function runCommand(ctx: ops.Ctx, command: string, args: string[]): Promise<void> {
  switch (command) {
    case "join":
      await printOnboarded(ctx, "join", await ops.join(ctx, need(args[0], "huddo join <invite-url-or-code> [--name NAME] [--avatar ID|PATH]"), opts.name, opts.avatar));
      break;
    case "list": print(await ops.list(ctx)); break;
    case "read":
      printBatch(await ops.read(ctx, { room: opts.room, limit: num("limit"), before: num("before"), after: num("after") }), false);
      break;
    case "search":
      printBatch(
        await ops.search(ctx, {
          query: args.join(" "),
          room: opts.room,
          from: opts.from,
          since: opts.since,
          until: opts.until,
          hasFile: opts["has-file"],
          limit: num("limit"),
        }),
        true,
      );
      break;
    case "show":
      printBatch(await ops.show(ctx, { id: need(args[0], "huddo show <msgid>"), room: opts.room, context: num("context") }), false);
      break;
    case "sync": print(await ops.sync(ctx, { room: opts.room, full: opts.full })); break;
    case "files":
      print(await ops.files(ctx, { query: args.join(" "), room: opts.room, from: opts.from, type: opts.type, limit: num("limit") }));
      break;
    case "send":
      print(await ops.send(ctx, { text: ops.messageText(args), room: opts.room, replyTo: opts["reply-to"], files: opts.file, mentions: opts.mention }));
      break;
    case "react":
      print(await ops.react(ctx, { message: args[0], emoji: args[1], remove: opts.remove, room: opts.room }));
      break;
    case "edit":
      print(await ops.edit(ctx, { message: args[0], text: ops.messageText(args.slice(1)), room: opts.room }));
      break;
    case "unsend":
      print(await ops.unsend(ctx, { message: args[0], room: opts.room }));
      break;
    case "app":
    case "apps": {
      const enabled = opts.off ? false : opts.on ? true : undefined;
      if (args[0] === "publish") {
        print(
          await ops.publish(ctx, {
            app: args[1],
            file: opts.file?.[0],
            name: opts.name,
            description: opts.description,
            guide: opts.guide,
            guideFile: opts["guide-file"],
            stateFile: opts["state-file"],
            schema: opts.schema,
            writeAccess: opts.write,
            banner: opts.banner,
            enabled,
            reset: opts.reset,
            room: opts.room,
          }),
        );
      } else if (args[0] === "submit") {
        print(await ops.appSubmit(ctx, { app: args[1], ops: opts.ops, expect: opts.expect, requestId: opts["request-id"], room: opts.room }));
      } else if (args[0] === "set") {
        print(await ops.appSettings(ctx, { app: args[1], enabled, banner: opts.banner, writeAccess: opts.write, room: opts.room }));
      } else if (args[0] === "delete") {
        print(await ops.appDelete(ctx, { app: args[1], room: opts.room }));
      } else {
        print(await ops.apps(ctx, { app: args[0] === "state" ? args[1] : args[0] === "list" ? undefined : args[0], room: opts.room }));
      }
      break;
    }
    case "whisper":
      print(await ops.whisper(ctx, { text: ops.messageText(args), to: opts.to, room: opts.room, replyTo: opts["reply-to"] }));
      break;
    case "wait": {
      abortPending = true;
      const deadline = STARTED_AT + (num("timeout") ?? 50) * 1000;
      const batch = await ops.wait(ctx, { deadline, room: opts.room, since: num("since") });
      printBatch(batch, true);
      if (batch.lease) {
        await new Promise<void>((done) => process.stdout.write("", () => done()));
        await ops.commitBatch(batch);
      }
      if (!batch.groups.length) {
        const synced = batch.synced !== false;
        if (opts.json) process.stderr.write(`${JSON.stringify({ timeout: true, synced })}\n`);
        else if (!synced) process.stderr.write("note: timed out before the first sync completed; no messages confirmed\n");
      }
      break;
    }
    case "new": await printOnboarded(ctx, "new", await ops.newHuddo(ctx, opts["room-name"], { displayName: opts.name, avatar: opts.avatar })); break;
    case "invite": print(await ops.invite(ctx, opts.room)); break;
    case "archive": print(await ops.archive(ctx, true, opts.room)); break;
    case "rename": print(await ops.rename(ctx, need(args.join(" "), "huddo rename <new room name>"), opts.room)); break;
    case "leave": print(await ops.leave(ctx, opts.room, opts.to)); break;
    case "transfer": print(await ops.transfer(ctx, need(args.join(" "), "huddo transfer <member>"), opts.room)); break;
    case "pair": print(opts.check ? await ops.pairCheck(ctx) : await ops.pair(ctx, opts.room)); break;
    case "unpair": print(await ops.unpair(ctx)); break;
    case "unarchive": print(await ops.archive(ctx, false, opts.room)); break;
    case "members": print(await ops.members(ctx, opts.room)); break;
    case "kick": print(await ops.kick(ctx, need(args.join(" "), "huddo kick <member>"), opts.room)); break;
    case "limits": print(await ops.limits(ctx, { slow: opts.slow, maxChars: opts["max-chars"], room: opts.room })); break;
    case "block": print(await ops.block(ctx, need(args.join(" "), "huddo block <member>"), true, opts.room)); break;
    case "unblock": print(await ops.block(ctx, need(args.join(" "), "huddo unblock <member>"), false, opts.room)); break;
    case "blocks": print(await ops.blocks(ctx)); break;
    case "status":
      if (args[0]) throw new ops.UserError("usage: huddo status (takes no arguments)");
      print(await ops.listening(ctx, await daemonSummary()));
      break;
    case "use": print(await ops.use(ctx, need(args[0], "huddo use <roomId|N>"))); break;
    case "download":
      print(await ops.download(ctx, need(args[0], "huddo download <msgid> [--out DIR]"), { room: opts.room, outDir: opts.out }));
      break;
    case "whoami": print(await ops.whoami(ctx)); break;
    case "identity": await identityCommand(ctx, args[0], args.slice(1)); break;
    default: throw new ops.UserError(`unknown command "${command}" (see huddo --help)`);
  }
}

function finish(code: number): void {
  process.exitCode = code;
  const dispatcher = (globalThis as Record<symbol, { close?: () => Promise<void>; destroy?: () => Promise<void> } | undefined>)[
    Symbol.for("undici.globalDispatcher.1")
  ];
  const release = abortPending ? dispatcher?.destroy : dispatcher?.close;
  void release?.call(dispatcher).catch(() => undefined);
  if (abortPending) setTimeout(() => process.exit(code), 50).unref();
}

main().then(
  () => finish(0),
  (e: unknown) => {
    process.stderr.write(`error: ${ops.errorText(e)}\n`);
    finish(e instanceof NetworkError ? 2 : 1);
  },
);
