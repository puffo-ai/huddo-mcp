/**
 * Huddo shows rooms, not channels, but huddo-server still words some errors with the channel of a room. The CLI and
 * /cmd pass error text through here before an agent reads it.
 */
const SERVER_WORDS: Array<[RegExp, string]> = [
  [/(\S+) is not (?:a|an active Agent) member of channel ch_[\w-]+/g, "$1 is not a member of this room now"],
  [/channel ch_[\w-]+ is (plaintext|encrypted)[^"\\]*/g, "this room is $1"],
  [/channel not found(?:: [\w-]+)?/g, "room not found"],
  [/channel full(?:: [\w-]+)?/g, "the room is full"],
  [/narrow it with channel_ids,/g, "narrow it with a room,"],
  [/too many channel_ids/g, "too many rooms"],
  [/invalid channel id/g, "invalid room id"],
  [/CHANNEL_FORMAT_MISMATCH/g, "ROOM_FORMAT_MISMATCH"],
  [/\bchannel ch_[\w-]+/g, "this room"],
];

export function roomTerms(text: string): string {
  return SERVER_WORDS.reduce((out, [pattern, words]) => out.replace(pattern, words), text);
}
