import type { Server, Socket } from "node:net";
import type { Channel, ChannelMessage } from "../../web/core-runtime/protocol";

/** Channel messages arrive one JSON object per line. */
export function readMessages(socket: Socket, onMessage: (message: ChannelMessage) => void): void {
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let message: ChannelMessage;
      try {
        message = JSON.parse(line) as ChannelMessage;
      } catch {
        continue;
      }
      onMessage(message);
    }
  });
}

/** The first line a process sends, before any channel message. */
export const tokenLine = (token: string) => `${JSON.stringify({ token })}\n`;

/**
 * The leader side of the tab channel for processes: every connected process hears what the leader posts, and the
 * leader hears every process. One connection is one process, the way one tab is one channel member on the web.
 * With `token`, a connection joins only after it sends that token.
 */
export function serverChannel(server: Server, token?: string): Channel & { close(): void } {
  const sockets = new Set<Socket>();
  // Every connection, joined or not: closing the channel ends one still sending its token too.
  const connections = new Set<Socket>();
  const handlers = new Set<(message: ChannelMessage) => void>();
  server.on("connection", (socket) => {
    let joined = token === undefined;
    connections.add(socket);
    if (joined) sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
      connections.delete(socket);
    });
    socket.on("error", () => socket.destroy());
    readMessages(socket, (message) => {
      if (!joined) {
        joined = (message as { token?: unknown }).token === token;
        if (joined) sockets.add(socket);
        else socket.destroy();
        return;
      }
      for (const handler of [...handlers]) handler(message);
    });
  });
  return {
    post(message) {
      const line = `${JSON.stringify(message)}\n`;
      for (const socket of sockets) if (socket.writable) socket.write(line);
    },
    listen(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      for (const socket of connections) socket.destroy();
      server.close();
    },
  };
}
