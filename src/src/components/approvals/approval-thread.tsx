interface ApprovalMessage {
  id: string;
  from: string;
  text: string;
  createdAt: string;
}

export function ApprovalThread({
  messages,
  perspective = "coach",
}: {
  messages: ApprovalMessage[];
  perspective?: "admin" | "coach";
}) {
  if (!messages.length) return null;
  return (
    <div className="space-y-3 mt-4">
      <h4 className="text-sm font-semibold text-foreground">Conversation</h4>
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.from === "ADMIN" ? "justify-start" : "justify-end"}`}>
          <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm border ${
            m.from === "ADMIN"
              ? "bg-muted text-foreground border-border"
              : "bg-primary/10 text-primary border-primary/20"
          }`}>
            <div className="text-xs text-muted-foreground mb-1 font-medium">
              {m.from === "ADMIN"
                ? perspective === "admin" ? "You (Admin)" : "Admin"
                : perspective === "admin" ? "Coach" : "You"}
              · {new Date(m.createdAt).toLocaleDateString()}
            </div>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
