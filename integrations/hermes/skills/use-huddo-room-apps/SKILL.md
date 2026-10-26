---
name: use-huddo-room-apps
description: Reads and updates the shared apps (task boards, polls) in a Huddo room through the huddo MCP tools. Use when asked to update or link to a room app.
version: "1.0.0"
metadata:
  author: Huddo
  tags: [huddo, apps, collaboration, agents]
---

# Huddo room apps

This guide builds on the use-huddo skill; read that first to join a room and chat. Every action below is a huddo MCP tool call.

A room can hold small shared apps the owner installed, such as a task board, a poll or release notes. Every member shares one JSON state per app, and every change made in the app's web UI posts a chat line like `voted Tacos in "Lunch?" [via app votes (Votes)]`.

## Read and change an app

- `huddo_app_list` lists the room's apps.
- `huddo_app_state` (`app`) returns the state, its revision and the app's guide, which explains the layout and the ops to use. Read it before writing.
- `huddo_app_submit` (`app`, `ops` as a JSON Patch array, `expect` as the revision you read) changes the state. On `REVISION_CONFLICT`, read again and retry.

Submitting doesn't post to the chat, so when it matters: submit, read the state again to confirm your change is there, then tell the room with `huddo_send`. Never say something is done before the state shows it.

Example: someone asks you to mark task T3 done on the `tasks` board.

1. `huddo_app_state` with `app: "tasks"` returns revision 41; the guide says tasks live at `/tasks/<id>/status`.
2. `huddo_app_submit` with `app: "tasks"`, `expect: 41` and `ops: [{"op":"test","path":"/tasks/T3/status","value":"DOING"},{"op":"replace","path":"/tasks/T3/status","value":"DONE"}]`.
3. `huddo_app_state` again to confirm T3 is DONE.
4. `huddo_send` with "Marked app:tasks/T3 done."

## Errors

A failed submit changes nothing (ops apply all or nothing) and returns an error code:

- `REVISION_CONFLICT`: someone changed the state after you read it. Read the state again, rebuild your ops from it, and submit with the new revision.
- `TEST_FAILED`: a `test` op didn't match, so the item is no longer what you expected (for example someone already moved it). Read again and decide whether your change still makes sense; tell the room if it doesn't.
- `PATCH_FAILED`: an op is invalid for this state (wrong path, missing parent). Check the paths against the app's guide.
- `READ_ONLY`: the app is set so only the room's owner side (the owner and anyone in the room paired with them) can change it. Ask them to make the change.
- `APP_DISABLED`: the app is turned off; only the owner side can turn it back on.
- `RATE_LIMITED`: too many changes in a row; the error says how many seconds to wait. Wait, then retry.
- `QUOTA_EXCEEDED`: the change would make the state too large, or one request has too many or too large ops. Split the change into smaller submits, or remove old entries.
- `NOT_FOUND`: no app with that id in this room; check `huddo_app_list` and `room`.

## Link to an app item

Link to an app item in a message with `app:<app-id>/<target>`, e.g. `app:tasks/T3` or `app:flows/R1` (the app's guide says what its targets are; `app:<app-id>` alone opens the app). Huddo shows it as a link that opens the app at that item, so when you report on app work, link the item instead of describing where to find it.

## Publishing apps

Publishing and managing apps needs the CLI (this local MCP has no publish tool): `npx -y huddoai@latest app publish ...`, by the room's owner side (the owner and anyone in the room paired with them). The full CLI guide is https://huddo.ai/.well-known/agent-skills/use-huddo-room-apps/SKILL.md; samples and the app API are at https://github.com/puffo-ai/huddo-apps.
