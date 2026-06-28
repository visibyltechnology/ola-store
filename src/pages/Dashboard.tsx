import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Package, CreditCard, Clock, LogOut, ShoppingBag, CheckCircle,
  XCircle, DollarSign, Truck, Calendar, ArrowUpRight, ChevronRight,
  AlertCircle, User, Phone, MapPin, Receipt
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/firebase/client";
import { collection, query, where, orderBy, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/data/products";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getOrderStatusConfig, formatOrderId, formatTimestamp } from "@/utils/orderStatusHelper";

interface Order {
  id: string;
  product_name: string;
  product_price: number;
  payment_type: string;
  total_payable: number;
  total_paid: number;
  remaining_balance: number;
  status: string;
  tracking_status?: string;
  status_history?: any[];
  delivery_token?: string | null;
  installment_months: number | null;
  next_payment_due: string | null;
  deposit_amount: number | null;
  delivery_date: string | null;
  created_at: string;
}

interface Payment {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  payment_gateway: string | null;
  payment_reference: string | null;
  created_at: string;
}

interface Profile {
  full_name: string | null;
  phone: string | null;
  address: string | null;
}

type TabType = "orders" | "payments" | "profile";

const statusConfig: Record<string, { color: string; icon: typeof Clock; label: string }> = {
  pending: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock, label: "Pending" },
  deposit_paid: { color: "bg-blue-100 text-blue-800 border-blue-200", icon: DollarSign, label: "Deposit Paid" },
  in_progress: { color: "bg-purple-100 text-purple-800 border-purple-200", icon: ShoppingBag, label: "In Progress" },
  fully_paid: { color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle, label: "Fully Paid" },
  ready_for_delivery: { color: "bg-orange-100 text-orange-800 border-orange-200", icon: Truck, label: "Ready for Delivery" },
  delivered: { color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle, label: "Delivered" },
  cancelled: { color: "bg-red-100 text-red-800 border-red-200", icon: XCircle, label: "Cancelled" },
};

const Dashboard = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("orders");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "", address: "" });

  useEffect(() => {
    // Wait for auth to fully resolve before making any navigation decision
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    fetchData();
  }, [user, authLoading]);

  const fetchData = async () => {
    try {
      const ordersRef = collection(db, "orders");
      const ordersQ = query(ordersRef, where("user_id", "==", user!.uid), orderBy("created_at", "desc"));
      const paymentsRef = collection(db, "payments");
      const paymentsQ = query(paymentsRef, where("user_id", "==", user!.uid), orderBy("created_at", "desc"));
      const profileRef = doc(db, "profiles", user!.uid);

      const [ordersSnap, paymentsSnap, profileSnap] = await Promise.all([
        getDocs(ordersQ),
        getDocs(paymentsQ),
        getDoc(profileRef)
      ]);

      const fetchedOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      const fetchedPayments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));

      setOrders(fetchedOrders);
      setPayments(fetchedPayments);

      if (profileSnap.exists()) {
        const profileData = profileSnap.data() as Profile;
        setProfile(profileData);
        setProfileForm({
          full_name: profileData.full_name || "",
          phone: profileData.phone || "",
          address: profileData.address || "",
        });
      }
    } catch {
      // silently handle errors, still stop the spinner
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await updateDoc(doc(db, "profiles", user!.uid), {
        full_name: profileForm.full_name,
        phone: profileForm.phone,
        address: profileForm.address
      });
      toast.success("Profile updated!");
      setProfile(profileForm);
      setEditingProfile(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const totalSpent = orders.reduce((sum, o) => sum + o.total_paid, 0);
  const totalOutstanding = orders.reduce((sum, o) => sum + o.remaining_balance, 0);
  const activeOrders = orders.filter(o => !["delivered", "cancelled"].includes(o.status));

  const upcomingPayments = orders
    .filter(o => o.next_payment_due && o.remaining_balance > 0)
    .sort((a, b) => new Date(a.next_payment_due!).getTime() - new Date(b.next_payment_due!).getTime());

  const getOrderPayments = (orderId: string) => payments.filter(p => p.order_id === orderId);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: typeof Package }[] = [
    { id: "orders", label: "Orders", icon: ShoppingBag },
    { id: "payments", label: "Payments", icon: Receipt },
    { id: "profile", label: "Profile", icon: User },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 pb-16">
        <div className="container mx-auto px-4 lg:px-8">
          {/* Welcome Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground">
                  Welcome back, {profile?.full_name?.split(" ")[0] || "there"} 👋
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              </div>
              <div className="flex gap-2">
                <Link to="/shop">
                  <Button size="sm" className="bg-gradient-gold text-accent-foreground rounded-xl shadow-gold text-xs">
                    <ShoppingBag className="w-3.5 h-3.5 mr-1" /> Shop
                  </Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={signOut} className="text-muted-foreground">
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { icon: ShoppingBag, label: "Active", value: activeOrders.length.toString(), color: "bg-blue-50 text-blue-600" },
              { icon: CheckCircle, label: "Paid", value: formatPrice(totalSpent), color: "bg-green-50 text-green-600" },
              { icon: AlertCircle, label: "Balance", value: formatPrice(totalOutstanding), color: "bg-orange-50 text-orange-600" },
            ].map(({ icon: Icon, label, value, color }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-card rounded-2xl p-3 shadow-sm border border-border/50"
              >
                <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center mb-2`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-sm font-display font-bold text-foreground truncate">{value}</p>
              </motion.div>
            ))}
          </div>

          {/* Upcoming Payments Alert */}
          {upcomingPayments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-accent/10 border border-accent/20 rounded-xl p-3 mb-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-accent" />
                <span className="text-xs font-semibold text-foreground">Upcoming Payments</span>
              </div>
              {upcomingPayments.slice(0, 3).map(order => (
                <div key={order.id} className="flex items-center justify-between py-1.5 border-b border-accent/10 last:border-0">
                  <div>
                    <p className="text-[11px] font-medium text-foreground">{order.product_name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      Due: {new Date(order.next_payment_due!).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-accent">{formatPrice(order.remaining_balance)}</span>
                </div>
              ))}
            </motion.div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-5 bg-secondary/50 p-1 rounded-xl">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ORDERS TAB */}
            {activeTab === "orders" && (
              <motion.div key="orders" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {orders.length === 0 ? (
                  <div className="bg-card rounded-2xl p-10 text-center shadow-sm border border-border/50">
                    <ShoppingBag className="w-10 h-10 text-border mx-auto mb-3" />
                    <h3 className="font-display font-semibold text-foreground mb-1 text-sm">No orders yet</h3>
                    <p className="text-xs text-muted-foreground mb-4">Start shopping to see your orders here.</p>
                    <Link to="/shop">
                      <Button size="sm" className="bg-gradient-gold text-accent-foreground rounded-xl shadow-gold text-xs">
                        Browse Products
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((order, i) => {
                      const config = getOrderStatusConfig(order.tracking_status || order.status);
                      const StatusIcon = config.icon;
                      const isExpanded = expandedOrder === order.id;
                      const orderPayments = getOrderPayments(order.id);
                      const progressPercent = order.total_payable > 0 ? Math.min((order.total_paid / order.total_payable) * 100, 100) : 0;

                      return (
                        <motion.div
                          key={order.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden"
                        >
                          <div
                            className="p-4 cursor-pointer"
                            onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                          >
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.badgeClass || config.colorClass}`}>
                                  <StatusIcon className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <h3 className="text-xs font-semibold text-foreground leading-tight">{order.product_name}</h3>
                                  <p className="text-[10px] text-muted-foreground">
                                    {formatOrderId(order.id)} • {order.payment_type.replace(/_/g, " ")}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${config.badgeClass || config.colorClass}`}>
                                {config.label}
                              </Badge>
                            </div>

                            {/* Payment Progress */}
                            <div className="mb-3">
                              <div className="flex justify-between text-[10px] mb-1">
                                <span className="text-muted-foreground">Payment Progress</span>
                                <span className="font-medium text-foreground">{Math.round(progressPercent)}%</span>
                              </div>
                              <div className="w-full bg-secondary rounded-full h-2">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progressPercent}%` }}
                                  transition={{ duration: 1, delay: i * 0.1 }}
                                  className="bg-accent rounded-full h-2"
                                />
                              </div>
                            </div>

                            {/* Financial Summary */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-secondary/50 rounded-lg p-2">
                                <p className="text-[9px] text-muted-foreground">Total</p>
                                <p className="text-[11px] font-bold text-foreground">{formatPrice(order.total_payable)}</p>
                              </div>
                              <div className="bg-secondary/50 rounded-lg p-2">
                                <p className="text-[9px] text-muted-foreground">Paid</p>
                                <p className="text-[11px] font-bold text-green-600">{formatPrice(order.total_paid)}</p>
                              </div>
                              <div className="bg-secondary/50 rounded-lg p-2">
                                <p className="text-[9px] text-muted-foreground">Balance</p>
                                <p className="text-[11px] font-bold text-orange-600">{formatPrice(order.remaining_balance)}</p>
                              </div>
                            </div>

                            {order.next_payment_due && order.remaining_balance > 0 && (
                              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-accent">
                                <Calendar className="w-3 h-3" />
                                Next payment due: {new Date(order.next_payment_due).toLocaleDateString()}
                              </div>
                            )}

                            <div className="flex items-center justify-center mt-2">
                              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </div>
                          </div>

                          {/* Expanded: Payment History for this order */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-border/50 overflow-hidden"
                              >
                                <div className="p-4 bg-secondary/20">
                                  {/* Tracking Stepper */}
                                  <div className="mb-5">
                                    <h4 className="text-[11px] font-semibold text-foreground mb-3 flex items-center gap-1">
                                      <Truck className="w-3 h-3 text-accent" /> Tracking Status
                                    </h4>
                                    <div className="relative pl-3 space-y-4 before:absolute before:inset-y-2 before:left-[11px] before:w-[2px] before:bg-border">
                                      {order.status_history && order.status_history.map((hist: any, idx: number) => {
                                        const histConfig = getOrderStatusConfig(hist.status);
                                        const HistIcon = histConfig.icon;
                                        return (
                                          <div key={idx} className="relative flex gap-3 items-start">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 relative z-10 ${histConfig.badgeClass || histConfig.colorClass}`}>
                                              <HistIcon className="w-3 h-3" />
                                            </div>
                                            <div>
                                              <p className="text-[11px] font-semibold text-foreground">{histConfig.label}</p>
                                              <p className="text-[9px] text-muted-foreground">{formatTimestamp(hist.timestamp)}</p>
                                              {hist.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{hist.notes}</p>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {(!order.status_history || order.status_history.length === 0) && (
                                        <div className="relative flex gap-3 items-start">
                                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 relative z-10 ${config.badgeClass || config.colorClass}`}>
                                            <StatusIcon className="w-3 h-3" />
                                          </div>
                                          <div>
                                            <p className="text-[11px] font-semibold text-foreground">{config.label}</p>
                                            <p className="text-[9px] text-muted-foreground">{formatTimestamp(order.created_at)}</p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    {order.delivery_token && (
                                      <div className="mt-4 p-3 bg-card border border-border rounded-xl">
                                        <p className="text-[10px] text-muted-foreground">Delivery Token</p>
                                        <p className="text-xs font-mono font-bold text-accent">{order.delivery_token}</p>
                                        <p className="text-[9px] text-muted-foreground mt-1">Provide this to your dispatch rider upon delivery.</p>
                                      </div>
                                    )}
                                  </div>

                                  <h4 className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1">
                                    <Receipt className="w-3 h-3 text-accent" /> Payment History
                                  </h4>
                                  {orderPayments.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {orderPayments.map(p => (
                                        <div key={p.id} className="flex items-center justify-between bg-card rounded-lg p-2 text-[10px]">
                                          <div className="flex items-center gap-2">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                              p.status === "success" ? "bg-green-100 text-green-600" : "bg-yellow-100 text-yellow-600"
                                            }`}>
                                              {p.status === "success" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                            </div>
                                            <div>
                                              <span className="font-medium text-foreground">{formatPrice(p.amount)}</span>
                                              <span className="text-muted-foreground ml-1">via {p.payment_gateway || "N/A"}</span>
                                            </div>
                                          </div>
                                          <span className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[10px] text-muted-foreground text-center py-3">No payments recorded yet</p>
                                  )}

                                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                                    {order.installment_months && (
                                      <div className="bg-card rounded-lg p-2">
                                        <span className="text-muted-foreground">Installment Plan</span>
                                        <p className="font-semibold text-foreground">{order.installment_months} months</p>
                                      </div>
                                    )}
                                    {order.deposit_amount != null && order.deposit_amount > 0 && (
                                      <div className="bg-card rounded-lg p-2">
                                        <span className="text-muted-foreground">Deposit</span>
                                        <p className="font-semibold text-foreground">{formatPrice(order.deposit_amount)}</p>
                                      </div>
                                    )}
                                    {order.delivery_date && (
                                      <div className="bg-card rounded-lg p-2">
                                        <span className="text-muted-foreground">Delivery Date</span>
                                        <p className="font-semibold text-foreground">{new Date(order.delivery_date).toLocaleDateString()}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* PAYMENTS TAB */}
            {activeTab === "payments" && (
              <motion.div key="payments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {/* Payment summary */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-card rounded-xl p-3 shadow-sm border border-border/50 text-center">
                    <p className="text-[10px] text-muted-foreground">Successful</p>
                    <p className="text-lg font-display font-bold text-green-600">
                      {payments.filter(p => p.status === "success").length}
                    </p>
                  </div>
                  <div className="bg-card rounded-xl p-3 shadow-sm border border-border/50 text-center">
                    <p className="text-[10px] text-muted-foreground">Total Paid</p>
                    <p className="text-lg font-display font-bold text-foreground">
                      {formatPrice(payments.filter(p => p.status === "success").reduce((s, p) => s + p.amount, 0))}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {payments.map((payment, i) => {
                    const order = orders.find(o => o.id === payment.order_id);
                    return (
                      <motion.div
                        key={payment.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="bg-card rounded-xl p-3 shadow-sm border border-border/50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              payment.status === "success" ? "bg-green-50 text-green-600" :
                              payment.status === "pending" ? "bg-yellow-50 text-yellow-600" :
                              "bg-red-50 text-red-600"
                            }`}>
                              {payment.status === "success" ? <CheckCircle className="w-4 h-4" /> :
                               payment.status === "pending" ? <Clock className="w-4 h-4" /> :
                               <XCircle className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-foreground">{formatPrice(payment.amount)}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {order?.product_name || "Unknown"} • {payment.payment_gateway || "N/A"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className={`text-[9px] ${
                              payment.status === "success" ? "text-green-600 border-green-200 bg-green-50" :
                              payment.status === "pending" ? "text-yellow-600 border-yellow-200 bg-yellow-50" :
                              "text-red-600 border-red-200 bg-red-50"
                            }`}>
                              {payment.status}
                            </Badge>
                            <p className="text-[9px] text-muted-foreground mt-1">{new Date(payment.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                  {payments.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      <Receipt className="w-10 h-10 mx-auto mb-2 text-border" />
                      No payment history yet
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* PROFILE TAB */}
            {activeTab === "profile" && (
              <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                      <span className="text-lg font-bold text-accent">
                        {(profile?.full_name || "?")[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-display font-bold text-foreground">{profile?.full_name || "Set your name"}</h3>
                      <p className="text-[11px] text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>

                  {editingProfile ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-medium text-foreground mb-1 block">Full Name</label>
                        <Input value={profileForm.full_name} onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })} className="rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-foreground mb-1 block">Phone</label>
                        <Input value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+234..." className="rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-foreground mb-1 block">Address</label>
                        <Input value={profileForm.address} onChange={e => setProfileForm({ ...profileForm, address: e.target.value })} placeholder="Delivery address" className="rounded-xl text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleUpdateProfile} className="bg-gradient-gold text-accent-foreground rounded-xl shadow-gold text-xs flex-1">
                          Save Changes
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingProfile(false)} className="rounded-xl text-xs">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">{profile?.full_name || "Not set"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">{profile?.phone || "Not set"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">{profile?.address || "Not set"}</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setEditingProfile(true)} className="rounded-xl text-xs w-full mt-3">
                        Edit Profile
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Dashboard;
