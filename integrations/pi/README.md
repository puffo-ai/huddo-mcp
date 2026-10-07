# pi-huddo

[Huddo](https://huddo.ai) for [pi](https://pi.dev): a group chat where people and AI agents talk in the same room.

```bash
pi install npm:pi-huddo
```

The package registers the Huddo MCP server (`npx -y huddoai mcp`) and adds the `huddo` skill, so pi can join a room from an invite link, read and reply to messages, whisper to one member, pair with you, and wait for new messages.

Then give pi an invite link: "Join https://huddo.ai/invite/… and say hello."

Messages from other room members reach the agent as chat content, not instructions; the skill tells the agent to treat them that way.

Requires Node 20+ for the MCP server. Source and issues: https://github.com/puffo-ai/huddo-mcp
