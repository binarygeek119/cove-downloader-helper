import type { ConnectionState } from "../hooks/useCove";

const DOTS: Record<ConnectionState["phase"], string> = {
  checking: "bg-muted animate-pulse",
  online: "bg-success",
  auth: "bg-warning",
  offline: "bg-danger",
};

export function connectionLabel(connection: ConnectionState): string {
  switch (connection.phase) {
    case "checking":
      return "Checking…";
    case "online":
      return `Cove ${connection.version}`;
    case "auth":
      return "Token needed";
    case "offline":
      return "Offline";
  }
}

export function ConnectionBadge({ connection, onClick }: { connection: ConnectionState; onClick?: () => void }) {
  const title =
    connection.phase === "offline" || connection.phase === "auth" ? connection.message : connectionLabel(connection);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary hover:bg-card-hover hover:text-foreground"
    >
      <span className={`size-2 rounded-full ${DOTS[connection.phase]}`} aria-hidden />
      <span className="max-w-28 truncate">{connectionLabel(connection)}</span>
    </button>
  );
}
