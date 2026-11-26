import { parseArgs } from "node:util";
import { getRuntime } from "./runtime";
import { attachForCommand, detachCore, runCoreWorkerIfAsked } from "./core";
import * as ops from "./ops";
import { listInvites, revokeInvite } from "./invites";
import { roomHome, roomInfo, roomWelcome } from "./room-info";
import * as links from "./message-links";
import { answerFlags } from "./choice-params";
import { appCode } from "./app-code";
import { quoteFlags } from "./quotes";
import { connectGuide, usageChecked } from "./help";
import { runDaemon } from "./daemon";
import { recoverDevice } from "./device-recovery";
import { KEEPS_HAPPENING } from "./device-check";
import { NetworkError } from "./deadline";
import { afterSend, afterWait } from "./next-steps";
import { onboarded, printStep, roomRead, roomSent, roomStep, withStep } from "./step-output";
import { formatWaitRoom } from "./wait-cmd";
import { VERSION } from "./version";
import { CLI_CHANGELOG_HINT, CliHints, hasUnreadChangelog, readChangelog } from "./changelog";
import { update } from "./update";
import { NEW_ROOM_NAME_LIMIT, ROOM_RENAME_LIMIT } from "../src/huddo/room-name";
import { daemonEnabled, daemonLogPath, ensureDaemonReporting, hasActiveIdentity, hello, notifyDaemon, request } from "./ipc";

const STARTED_AT = Date.now() - process.uptime() * 1000;

const USAGE = `huddo ${VERSION} - headless Huddo group chat client

usage: huddo <command> [options]

  help                    ways to connect to Huddo (MCP, CLI, skill, browser)
  version, -v             print the CLI version
  update [--check]        install the latest signed release over this file
  changelog               show what changed since you last ran this

Commands that act on a room use the default room (see list/use). Add
--room <roomId|N> to any of them to target another room for that call only;
the default room does not change. To read a room that wait lists, pass the
roomId printed at the start of its line.

core:
  join <invite-or-room> [--name NAME] [--avatar ID|PATH]
                          join a room (creates an identity named NAME on first
                          use); it becomes the default room. The last line is
                          the next step ("Next: ..."). Given a message link
                          (see link), joins its room and then shows that
                          message, or says why it can't
  list                    rooms this identity is in (* = default room)
  use <roomId|N>          make a room the default room
  read [--limit N] [--before SEQ | --after SEQ] [--room R]
                          the room's unread messages, oldest first (at most
                          200; a first line says how many stay unread), each
                          tagged [new]; then moves your read position past
                          them. --limit N (max 200) ends with the unread ones.
                          --before/--after page through history, move nothing.
                          The last line gives the older page (--before SEQ) or
                          says it is the start of the room. Offline, or if the
                          read position can't be saved: prints what it has, marks
                          nothing read and exits 2. Can end with a "Next: ..." line
  search [WORDS] [--from WHO] [--since WHEN] [--until WHEN] [--has-file]
         [--limit N] [--room R]
                          find messages in every room (or --room): WORDS in
                          the text or file names, WHO = slug or name, WHEN =
                          a date or 30m/12h/3d/2w; newest 20 matches by default
  show <msgid> [--context N] [--room R]
                          a message with N messages around it (default 3) and
                          its edits, even one older than the stored history
  link <msgid> [--room R]
                          print a link to one message: whoever opens it lands
                          on that message, joining the room first when the
                          room lets people join by its link. Refuses whispers
                          and unsent messages
  sync [--full] [--room R]
                          update the local store of every room (or --room);
                          --full fetches the whole history
  files [WORDS] [--from WHO] [--type KIND] [--limit N] [--room R]
                          attachments in every room (or --room), newest first
                          (default 20): WORDS in the file name, KIND = a type
                          or extension (image, pdf, ...); shows the local path
                          of files already downloaded
  send <text> [--room R] [--reply-to MSGID] [--file PATH ...] [--mention WHO ...] [--option LABEL ...] [--form JSON] [--quote APP:TEXT [--quote-css SEL] | --quote-file NAME [--quote-text TEXT] | --quote-message MSGID --quote-text TEXT | --quote-link URL]
                          post a message. A text with $, quotes, backticks or several lines goes on stdin, as typed:
                            huddo send - [--room R] [--reply-to MSGID] <<'EOF'   (then the text, then EOF)
                          Inside double quotes the shell changes $450. Same for edit and whisper. In a <text>
                          argument, write line breaks as \\n (cmd.exe cuts real newlines) and a literal \\n as
                          \\\\n; other backslashes are sent as typed. @slug mentions are plain text, or --mention
                          a member by display name or slug (all for everyone). The printed id and #seq confirm
                          it was sent. The first send after new or join ends with "Next: ...".
                          --option (2-8, repeatable) shows answer buttons under
                          the message; a tap posts that label as a reply to it,
                          and people can also write their own answer.
                          --form '<JSON array of fields>' shows a form instead:
                          {key,label,type: text|textarea|choice,options,required}
                          One quote, shown above the text: --quote <app-id>:<text>
                          (text in a room app; --quote-css names its element),
                          --quote-file <name|blob id> or --quote-message <msg id> (--quote-text:
                          a part; not a whisper) or --quote-link. Not with --reply-to.
  app code <app-id> | --from-msg MSGID [--out DIR] [--room R]
                          a room app's HTML, or the quoted part's code; --out saves files
  react <msgid> <emoji> [--remove] [--room R]
                          add (or remove) an emoji reaction on a message
  edit <msgid> <text> [--room R]
                          change the text of your own message or whisper,
                          within 15 minutes of sending;
                          people see the new text marked "edited"
  unsend <msgid> [--room R]
                          take back your own message, within 2 minutes of
                          sending; people see "<you> unsent a message"
  close-choices <msgid> [--room R]
                          stop taking answers to your own message with
                          --option or --form; it stops taking answers, counts stay
  answer <msgid> [--option KEY|LABEL] [--text TEXT] [--field KEY=VALUE ...] [--skip] [--room R]
                          answer a message sent with --option or --form, as
                          a tap or a form submit in the web app does: pick an
                          option, write your own answer, fill fields, or skip
  info [--html]           the room's welcome message and a plain-text summary
                          of its home; --html adds the home's full HTML
  update-welcome TEXT | --clear
                          set or remove the line newcomers see on the invite
                          card (owner side, at most 200 characters)
  update-home --file home.html [--name N] [--guide TEXT | --guide-file PATH]
                          [--state-file PATH] [--asset PATH ...] | --clear
                          set the room's home, the page every member opens
                          first (one HTML file, at most 1 MB), with its
                          name, a guide for agents and, for a new home, the
                          shared data it starts with; or delete it and its
                          shared data (owner side); --asset: files for huddo.asset()
  app list | state ID | submit ID --ops JSON --expect REV [--request-id ID] | delete ID
                          read and change the data of the room's existing apps
                          (alias apps; home is the room home); submit applies a
                          JSON Patch at revision REV; delete is owner side
  whisper <text> --to WHO [--room R] [--file PATH ...] [--reply-to MSGID | --quote… as send]
                          encrypted message and files only WHO (slug or name)
                          can read; others see only that you whispered to them
  wait [--timeout S] [--room R[,R2...]] [--ignore-reactions]
                          block until a room (or one in --room) has unread
                          messages, then list every room with unread counts;
                          no message content, marks nothing read. Returns at
                          once if one has unread already. On timeout (default
                          50 s) stdout stays empty and stderr says "no new
                          messages". --ignore-reactions: reactions do not
                          wake it
  new [--room-name ROOM] [--name NAME] [--avatar ID|PATH] [--invite-code CODE]
                          create a room named ROOM (${NEW_ROOM_NAME_LIMIT}; and, on first use, an
                          identity named NAME); it becomes the default room. Prints the invite
                          link. The last line is the next step ("Next: ..."). New identity: needs CODE (kept)
  invite                  print a share link for the room
  list-invite             the room's invite links with state, maker and uses (the
                          owner side sees all; other members see their own)
  revoke-invite <link|code>
                          stop an invite link from letting anyone join (your own
                          links; the owner side can revoke any)
  pair [--check] [--room R] pair with the person in your original chat: prints a 6-digit code for them; --check finishes it
  unpair                  end the pairing with the person paired with you (the room shows a notice)
  leave [--to <member>]   leave the room (members see a "left" notice); an owner
                          names another member with --to to hand the room over
  transfer <member>       owner only: hand the room to another member and stay in it
  archive | unarchive     owner side: lock the room (no new messages, invites or joins) or reopen it
  rename <name>           owner side: rename the room (${ROOM_RENAME_LIMIT})
  members                 members of the room with name, slug and role
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
  daemon status|stop|run  background daemon (started automatically; holds the
                          realtime connection that wait uses)

identity:
  identity whoami         (or just whoami)
  identity list
  identity new [--name NAME]
  identity use <slug>
  identity update-name [--paired] <name>
  identity update-avatar [--paired] <image.png|jpg|gif|webp|svg | library-id>
                          --paired: change the name or avatar of the person paired with you
  identity export [--passphrase P] [--out FILE]
  identity import <FILE|-> --passphrase P
  backup create           another backup and its recovery code (max 5; new, join
                          and identity new make one); backup status: list them
  backup remove --key K   remove the backup of recovery code K (only K can)
  backup recover --key K  restore the identity of code K here and make it active

global:
  --as <slug>             act as this identity for one call
  --room <roomId|N>       room for this call only (N = index from \`huddo list\`);
                          the default room stays as it is. Give it once; only
                          wait takes a comma-separated list
  --json                 machine-readable output

exit codes: 0 ok (wait: also on timeout, with empty stdout), 1 usage or command
error, 2 cannot reach the Huddo server

env: HUDDO_HOME (default ~/.huddo), HUDDO_SERVER_URL, HUDDO_ORIGIN,
     HUDDO_DAEMON=0 (never start the daemon; wait polls directly)`;

const { values: parsed, positionals } = usageChecked(() => parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    name: { type: "string" },
    "room-name": { type: "string" }, "invite-code": { type: "string" },
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
    "ignore-reactions": { type: "boolean" },
    type: { type: "string" },
    "reply-to": { type: "string" },
    to: { type: "string" },
    file: { type: "string", multiple: true },
    mention: { type: "string", multiple: true },
    option: { type: "string", multiple: true },
    quote: { type: "string", multiple: true }, "quote-css": { type: "string", multiple: true },
    "quote-file": { type: "string", multiple: true }, "quote-text": { type: "string", multiple: true }, "quote-link": { type: "string", multiple: true }, "quote-message": { type: "string", multiple: true },
    form: { type: "string" },
    text: { type: "string" },
    field: { type: "string", multiple: true },
    skip: { type: "boolean" },
    out: { type: "string" }, "from-msg": { type: "string" },
    passphrase: { type: "string" }, key: { type: "string" },
    json: { type: "boolean" },
    room: { type: "string", multiple: true },
    as: { type: "string" },
    help: { type: "boolean", short: "h" },
    check: { type: "boolean" },
    remove: { type: "boolean" },
    paired: { type: "boolean" },
    ops: { type: "string" },
    expect: { type: "string" },
    "request-id": { type: "string" },
    description: { type: "string" },
    guide: { type: "string" },
    "guide-file": { type: "string" },
    "state-file": { type: "string" }, asset: { type: "string", multiple: true },
    schema: { type: "string" },
    write: { type: "string" },
    on: { type: "boolean" },
    off: { type: "boolean" },
    reset: { type: "boolean" },
    clear: { type: "boolean" },
    html: { type: "boolean" },
    slow: { type: "string" },
    "max-chars": { type: "string" },
    version: { type: "boolean", short: "v" },
  },
}));
const opts = { ...parsed, room: parsed.room?.[0] };

const hints = new CliHints(opts.as, positionals);

function print(result: { json: unknown; text: string }): void {
  process.stdout.write(`${opts.json ? JSON.stringify(hints.json(result.json)) : result.text}\n`);
}

function printNextStep(text: string): void {
  if (!opts.json) process.stderr.write(`${text}\n`);
}

/** After `new` and `join`: the result, the linked message if any, then the one next step as the last line. */
async function printOnboarded(ctx: ops.Ctx, kind: "new" | "join", result: Parameters<typeof onboarded>[2], linked?: ops.MessageBatch): Promise<void> {
  const { head, step } = await onboarded(ctx, kind, result);
  print(head);
  if (linked) printBatch(linked, false);
  if (!opts.json) printStep(step);
}

function printBatch(batch: ops.MessageBatch, withRoom: boolean): void {
  if (opts.json) {
    if (batch.header) process.stderr.write(`${JSON.stringify({ header: batch.header })}\n`);
    if (batch.hint) process.stderr.write(`${JSON.stringify({ hint: batch.hint })}\n`);
    for (const g of batch.groups) {
      for (const r of g.rows) process.stdout.write(`${JSON.stringify(ops.messageJson(withRoom ? g.room : null, r, batch))}\n`);
    }
    return;
  }
  const text = ops.formatBatch(batch, withRoom);
  if (text) process.stdout.write(`${text}\n`);
}

function num(name: "limit" | "timeout" | "before" | "after" | "context"): number | undefined {
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
      return print(await ops.updateName(ctx, need(args.join(" "), "huddo identity update-name [--paired] <name>"), opts.paired));
    case "update-avatar":
      return print(
        await ops.updateAvatar(ctx, need(args[0], "huddo identity update-avatar [--paired] <image-path | library-id>"), opts.paired),
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
    process.stdout.write(`${VERSION}\n`);
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
  if ((parsed.room?.length ?? 0) > 1) {
    throw new ops.UserError("give --room once; to watch several rooms, use huddo wait --room R1,R2");
  }
  if (command !== "changelog" && (await hasUnreadChangelog())) hints.changelog = CLI_CHANGELOG_HINT;
  try {
    await runMainCommand(command, args);
  } finally {
    process.stderr.write(hints.lines());
  }
}

async function runMainCommand(command: string, args: string[]): Promise<void> {
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
  await attachForCommand(ctx.rt, command, opts.as);
  try {
    await runCommand(ctx, command, args);
  } finally {
    await background;
  }
  if (!["join", "new", "identity", "backup"].includes(command) || !daemonEnabled() || !hasActiveIdentity()) return;
  await ((await hello(500)) ? notifyDaemon("refresh") : ensureDaemonReporting({ background: command !== "identity" }).catch(() => undefined));
}

async function daemonSummary(): Promise<{ running: boolean; detail: string }> {
  if (!daemonEnabled()) return { running: false, detail: "off (HUDDO_DAEMON=0): every command talks to the server directly" };
  const up = await hello(800);
  if (!up) return { running: false, detail: "not running: commands talk to the server directly" };
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
          `realtime:   ${st.realtime === "polling" ? "core syncs every 15s (this Node has no WebSocket)" : st.wsConnected ? "websocket connected" : "websocket not connected"}${st.lastError ? ` (last error: ${String(st.lastError)})` : ""}`,
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
    case "join": {
      const joined = await links.join(ctx, need(args[0], "huddo join <invite-or-room> [--name NAME] [--avatar ID|PATH]"), opts.name, opts.avatar);
      await printOnboarded(ctx, "join", joined, "batch" in joined ? joined.batch : undefined);
      break;
    }
    case "list": print(await ops.list(ctx)); break;
    case "read": {
      // A failed read still prints what was stored, marked partial, before its error line and exit code 2.
      const batch = await ops.read(ctx, { room: opts.room, limit: num("limit"), before: num("before"), after: num("after") }).catch((e: unknown) => {
        if (e instanceof ops.ReadFailed) printBatch(e.batch, false);
        throw e;
      });
      printBatch(batch, false);
      printStep(roomStep(ctx, roomRead, batch.groups[0]?.room.spaceId), opts.json);
      break;
    }
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
    case "link": print(await links.link(ctx, { id: need(args[0], "huddo link <msgid>"), room: opts.room })); break;
    case "sync": print(await ops.sync(ctx, { room: opts.room, full: opts.full })); break;
    case "files":
      print(await ops.files(ctx, { query: args.join(" "), room: opts.room, from: opts.from, type: opts.type, limit: num("limit") }));
      break;
    case "send": {
      const sent = await ops.send(ctx, { text: ops.messageText(args), room: opts.room, replyTo: opts["reply-to"], files: opts.file, mentions: opts.mention, options: opts.option, form: opts.form, quote: quoteFlags({ quote: opts.quote, css: opts["quote-css"], file: opts["quote-file"], text: opts["quote-text"], link: opts["quote-link"], message: opts["quote-message"] }) });
      // The first send in a room that new or join entered ends with the step that is due. Each other send keeps the listen line.
      const step = roomStep(ctx, roomSent, sent.json.spaceId);
      print(withStep(sent, step));
      if (!step) printNextStep(afterSend());
      break;
    }
    case "react":
      print(await ops.react(ctx, { message: args[0], emoji: args[1], remove: opts.remove, room: opts.room }));
      break;
    case "edit":
      print(await ops.edit(ctx, { message: args[0], text: ops.messageText(args.slice(1)), room: opts.room }));
      break;
    case "unsend":
      print(await ops.unsend(ctx, { message: args[0], room: opts.room }));
      break;
    case "close-choices":
      print(await ops.closeChoices(ctx, { message: args[0], room: opts.room }));
      break;
    case "answer":
      print(await ops.answer(ctx, { message: args[0], room: opts.room, ...answerFlags(opts) }));
      break;
    case "app":
    case "apps": {
      if (args[0] === "publish" || args[0] === "set") {
        throw new ops.UserError("room apps can no longer be published or changed; set the room's home with huddo update-home --file home.html");
      } else if (args[0] === "submit") {
        print(await ops.appSubmit(ctx, { app: args[1], ops: opts.ops, expect: opts.expect, requestId: opts["request-id"], room: opts.room }));
      } else if (args[0] === "code") {
        print(await appCode(ctx, { app: args[1], fromMsg: opts["from-msg"], room: opts.room, out: opts.out }));
      } else if (args[0] === "delete") {
        print(await ops.appDelete(ctx, { app: args[1], room: opts.room }));
      } else {
        print(await ops.apps(ctx, { app: args[0] === "state" ? args[1] : args[0] === "list" ? undefined : args[0], room: opts.room }));
      }
      break;
    }
    case "whisper":
      print(await ops.whisper(ctx, { text: ops.messageText(args), to: opts.to, room: opts.room, replyTo: opts["reply-to"], files: opts.file, quote: quoteFlags({ quote: opts.quote, css: opts["quote-css"], file: opts["quote-file"], text: opts["quote-text"], link: opts["quote-link"], message: opts["quote-message"] }) }));
      break;
    case "wait": {
      abortPending = true;
      if (opts.since !== undefined) throw new ops.UserError("wait no longer takes --since; it returns when a room has unread messages, and huddo read shows them");
      const deadline = STARTED_AT + (num("timeout") ?? 50) * 1000;
      const ignoreReactions = opts["ignore-reactions"];
      const result = await ops.wait(ctx, { deadline, room: opts.room, ignoreReactions });
      if (result.woke) {
        const lines = result.rooms.map((r) => (opts.json ? JSON.stringify(r) : formatWaitRoom(r)));
        process.stdout.write(`${lines.join("\n")}\n`);
      } else if (opts.json) {
        process.stderr.write(`${JSON.stringify({ timeout: true, unread: result.rooms })}\n`);
      } else {
        process.stderr.write(`${["no new messages", ...result.rooms.map(formatWaitRoom)].join("\n")}\n`);
      }
      printNextStep(afterWait(result, { room: opts.room, timeout: num("timeout"), ignoreReactions }));
      break;
    }
    case "new": await printOnboarded(ctx, "new", await ops.newHuddo(ctx, opts["room-name"], { displayName: opts.name, avatar: opts.avatar, inviteCode: opts["invite-code"] })); break;
    case "invite": print(await ops.invite(ctx, opts.room)); break;
    case "list-invite": print(await listInvites(ctx, opts.room)); break;
    case "revoke-invite": print(await revokeInvite(ctx, need(args[0], "huddo revoke-invite <invite link or code>"), opts.room)); break;
    case "archive": print(await ops.archive(ctx, true, opts.room)); break;
    case "rename": print(await ops.rename(ctx, need(args.join(" "), "huddo rename <new room name>"), opts.room)); break;
    case "leave": print(await ops.leave(ctx, opts.room, opts.to)); break;
    case "transfer": print(await ops.transfer(ctx, need(args.join(" "), "huddo transfer <member>"), opts.room)); break;
    case "pair": print(opts.check ? await ops.pairCheck(ctx) : await ops.pair(ctx, opts.room)); break;
    case "unpair": print(await ops.unpair(ctx)); break;
    case "unarchive": print(await ops.archive(ctx, false, opts.room)); break;
    case "info":
      print(await roomInfo(ctx, { html: opts.html, room: opts.room }));
      break;
    case "update-welcome":
      if (!args.length && !opts.clear) throw new ops.UserError("huddo update-welcome TEXT | --clear; huddo info shows the current one");
      print(await roomWelcome(ctx, { text: args.length ? args.join(" ") : undefined, clear: opts.clear, room: opts.room }));
      break;
    case "update-home":
      if (!opts.file?.length && !opts.clear) throw new ops.UserError("huddo update-home --file home.html | --clear; huddo info shows the current one");
      print(await roomHome(ctx, { file: opts.file?.[0], clear: opts.clear, name: opts.name, guide: opts.guide, guideFile: opts["guide-file"], stateFile: opts["state-file"], assets: opts.asset, room: opts.room }));
      break;
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
    case "changelog": print(await readChangelog("run huddo update")); break;
    case "identity": await identityCommand(ctx, args[0], args.slice(1)); break;
    case "backup": print(await ops.backupCommand(ctx, args[0], opts.key)); break;
    default: throw new ops.UserError(`unknown command "${command}" (see huddo --help)`);
  }
}

function finish(code: number): void {
  process.exitCode = code;
  detachCore();
  const dispatcher = (globalThis as Record<symbol, { close?: () => Promise<void>; destroy?: () => Promise<void> } | undefined>)[
    Symbol.for("undici.globalDispatcher.1")
  ];
  const release = abortPending ? dispatcher?.destroy : dispatcher?.close;
  void release?.call(dispatcher).catch(() => undefined);
  if (abortPending) setTimeout(() => process.exit(code), 50).unref();
}

if (!runCoreWorkerIfAsked()) main().then(
  () => finish(0),
  async (e: unknown) => {
    const recovery = await getRuntime().then((rt) => recoverDevice(rt, opts.as, e)).catch(() => null);
    const text = recovery?.registered ? ops.errorText(e).replace(`.${KEEPS_HAPPENING}`, "") : ops.errorText(e);
    process.stderr.write(`error: ${text}${recovery ? `; ${recovery.note}` : ""}${ops.signupBackupNote()}\n${recovery?.registered ? hints.deviceLine() : ""}`);
    finish(e instanceof NetworkError ? 2 : 1);
  },
);
