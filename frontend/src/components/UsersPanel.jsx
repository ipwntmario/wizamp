// src/components/UsersPanel.jsx
export default function UsersPanel({ onlineActive, connected, roomId, users = [], visible }) {
  if (!onlineActive || !visible) return null;
  return (
    <div style={{
      position: "absolute", // appears just under parent
      right: 0, top: "100%",
      marginTop: 6,
      background: "rgba(0,0,0,0.6)",
      color: "#fff",
      padding: "10px 12px",
      borderRadius: 8,
      minWidth: 220,
      zIndex: 50,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Room: {roomId || "(none)"} {connected ? "• online" : "• offline"}
      </div>
      {users.length === 0 && (
        <div style={{ fontSize: 12, opacity: 0.8 }}>No users yet.</div>
      )}
      {users.map(u => (
        <div key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginTop: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: u.ready ? "#4ade80" : "#f59e0b" }} />
          <span style={{ fontWeight: 600 }}>{u.name}</span>
          <span style={{ opacity: 0.8 }}>({u.role})</span>
        </div>
      ))}
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        Add <code>?room=table-alpha</code> to the URL to invite others.
      </div>
    </div>
  );
}
