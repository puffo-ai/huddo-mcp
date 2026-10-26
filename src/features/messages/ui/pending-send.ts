import type { StoredMessage } from "../domain/message";
import type { PendingSendStatus } from "../domain/pending-send";
export {
  isResendable,
  resendStrategy,
  type PendingSend,
  type PendingSendStatus,
  type ResendStrategy,
} from "../domain/pending-send";

export interface DisplayMessage extends StoredMessage {
  _pendingStatus?: PendingSendStatus;
  _pendingTempId?: string;
  _pendingFailureReason?: string;
  _pendingResendable?: boolean;
}
