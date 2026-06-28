import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Bell, Check, Trash2, CheckCircle2, Clock, Package, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Notification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "@/services/notificationService";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const Notifications = () => {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    const data = await getUserNotifications(user.uid);
    setNotifications(data);
    setLoading(false);
  };

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: "read" } : n))
    );
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    await markAllAsRead(user.uid);
    setNotifications((prev) => prev.map((n) => ({ ...n, status: "read" })));
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  const getIcon = (type: string) => {
    switch (type) {
      case "PAYMENT_SUCCESS":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "ORDER_OTP":
        return <Package className="w-5 h-5 text-accent" />;
      case "TRACKING_UPDATE":
        return <Clock className="w-5 h-5 text-blue-500" />;
      case "STOCK_ALERT":
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      default:
        return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const unreadCount = notifications.filter((n) => n.status === "unread").length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-24 max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
              <Bell className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">Notifications</h1>
              <p className="text-muted-foreground text-sm">
                You have {unreadCount} unread message{unreadCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
              <Check className="w-4 h-4 mr-2" /> Mark all read
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-card rounded-xl animate-pulse" />
            ))}
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-4">
            {notifications.map((notif, index) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`relative p-5 rounded-xl border transition-all ${
                  notif.status === "unread"
                    ? "bg-card border-accent/20 shadow-md"
                    : "bg-muted/30 border-border"
                }`}
              >
                {notif.status === "unread" && (
                  <div className="absolute top-5 left-2 w-2 h-2 rounded-full bg-accent" />
                )}
                
                <div className="flex gap-4 items-start pl-3">
                  <div className="mt-1 flex-shrink-0">{getIcon(notif.type)}</div>
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className={`font-semibold ${notif.status === "unread" ? "text-foreground" : "text-muted-foreground"}`}>
                        {notif.title}
                      </h3>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(notif.created_at)}
                      </span>
                    </div>
                    
                    <p className={`mt-1 text-sm ${notif.status === "unread" ? "text-foreground/90" : "text-muted-foreground"}`}>
                      {notif.message}
                    </p>

                    {notif.metadata?.order_id && (
                      <Link to="/dashboard" className="inline-block mt-3">
                        <Button variant="link" className="h-auto p-0 text-accent">
                          View Details &rarr;
                        </Button>
                      </Link>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {notif.status === "unread" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-accent"
                        onClick={(e) => handleMarkAsRead(notif.id, e)}
                        title="Mark as read"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(notif.id, e)}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-card rounded-2xl border border-border">
            <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Notifications</h3>
            <p className="text-muted-foreground">You're all caught up!</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Notifications;
