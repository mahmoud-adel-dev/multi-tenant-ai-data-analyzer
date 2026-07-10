"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { getNotifications, markAllNotificationsAsRead, type NotificationDTO } from "@/actions/notifications";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Auto-refresh notifications every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    const result = await getNotifications();
    if (result.success) {
      setNotifications(result.data);
    }
  };

  const handleMarkAsRead = async () => {
    await markAllNotificationsAsRead();
    fetchNotifications();
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "32px", height: "32px", borderRadius: "8px",
          border: "1px solid var(--border-color)", background: "var(--bg-primary)",
          color: "var(--text-secondary)", cursor: "pointer", transition: "all 0.2s",
          position: "relative"
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--accent-primary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--border-color)"; }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: "-4px", right: "-4px",
            background: "#ef4444", color: "#fff", fontSize: "10px", fontWeight: "bold",
            padding: "2px 6px", borderRadius: "10px", border: "2px solid var(--bg-secondary)"
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: "absolute", bottom: "40px", left: "0", width: "300px",
          background: "var(--bg-card)", border: "1px solid var(--border-color)",
          borderRadius: "12px", boxShadow: "var(--card-shadow)", padding: "12px",
          zIndex: 50
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
            <h4 style={{ fontSize: "14px", fontWeight: 600 }}>Notifications</h4>
            {unreadCount > 0 && (
              <button onClick={handleMarkAsRead} style={{ fontSize: "12px", color: "var(--accent-primary)", background: "none", border: "none", cursor: "pointer" }}>Mark all as read</button>
            )}
          </div>
          
          <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
            {notifications.length === 0 ? (
              <div style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>No notifications yet</div>
            ) : (
              notifications.map((notif) => (
                <div key={notif.id} style={{
                  padding: "10px", borderRadius: "8px",
                  background: notif.isRead ? "transparent" : "var(--accent-light)",
                  border: "1px solid var(--border-color)",
                  borderLeft: notif.isRead ? "1px solid var(--border-color)" : "3px solid var(--accent-primary)"
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{notif.title}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>{notif.message}</div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px" }}>{new Date(notif.createdAt).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
