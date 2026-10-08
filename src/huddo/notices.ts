export interface SpaceNotice {
  id: number;
  kind: string;
  actor: string;
  target: string | null;
  at: number;
}

interface Getter {
  get<T = unknown>(path: string): Promise<T>;
}

export async function fetchNotices(http: Getter, spaceId: string, since = 0): Promise<SpaceNotice[]> {
  const resp = await http.get<{ notices?: SpaceNotice[] }>(
    `/v2/notices/space/${encodeURIComponent(spaceId)}?since=${since}`,
  );
  return resp.notices ?? [];
}

export function noticeAction(notice: SpaceNotice): { action: string; target?: string } | null {
  switch (notice.kind) {
    case "archived":
      return { action: "archived this huddo; new messages are turned off" };
    case "unarchived":
      return { action: "unarchived this huddo" };
    case "unpaired":
      return notice.target ? { action: "ended the pairing with", target: notice.target } : null;
    default:
      return null;
  }
}
