export type ProxySession = {
  id: string;
  provider: string;
  url: string;
  geo: string | null;
};

export type ErrorKind =
  | "consecutive_403"
  | "auth_failed"
  | "timeout"
  | "bot_check"
  | "manual"
  | "other";

export type SessionOutcome = {
  okDelta: number;
  errDelta: number;
  bytesDelta: number;
  newlyDisabled: boolean;
  disabledReason: string | null;
  lastError: string | null;
};
