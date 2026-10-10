export { VerifyStatus } from "../../features/messages/domain/message";
export type { StoredMessage } from "../../features/messages/domain/message";

export interface SqlDatabase {
  run(sql: string, params?: unknown[]): void;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined;
  exec(sql: string): void;
}
