import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Plus, Package, Users, CreditCard, TrendingUp, Trash2, LogOut,
  BarChart3, Upload, Image, Eye, EyeOff, Search, Filter, ChevronDown,
  DollarSign, Calendar, ShoppingBag, AlertCircle, CheckCircle,
  Clock, XCircle, Truck, ArrowUpRight, ArrowDownRight, MoreVertical,
  Bell, Activity, Send, RefreshCw, Shield, LogIn, UserPlus,
  AlertTriangle, Mail, Phone, MapPin, Settings, Key, ToggleLeft, ToggleRight,
  Pencil, Tag, History, ChevronRight
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db, auth } from "@/integrations/firebase/client";
import { collection, query, orderBy, limit, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";
import { uploadImages } from "@/services/cloudinaryService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatPrice } from "@/data/products";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { getOrderStatusConfig, formatOrderId } from "@/utils/orderStatusHelper";
import { updateOrderStatus, ORDER_STATUS } from "@/services/orderTrackingService";

interface DBProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string | null;
  overview: string | null;
  price: number;
  original_price: number | null;
  badge: string | null;
  min_deposit: number;
  max_installment_months: number;
  features: string[] | null;
  images: string[] | null;
  available: boolean;
  stock_count: number;
  unlimited_stock: boolean;
  inventory_status: string;
  sales: number;
  created_at: string;
}

interface DBOrder {
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
  created_at: string;
  user_id: string;
  installment_months: number | null;
  next_payment_due: string | null;
  deposit_amount: number | null;
}

interface DBPayment {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  status: string;
  payment_gateway: string | null;
  payment_reference: string | null;
  created_at: string;
}

interface DBProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

interface DBActivityLog {
  id: string;
  user_id: string | null;
  event_type: string;
  email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface DBInstallmentReminder {
  id: string;
  order_id: string;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  reminder_type: string;
  status: string;
  message: string | null;
  amount_due: number | null;
  days_overdue: number | null;
  sent_at: string;
  created_at: string;
}

type TabType = "overview" | "products" | "orders" | "payments" | "customers" | "reminders" | "activity" | "settings";

interface PaymentGatewaySetting {
  gateway: string;
  public_key: string;
  secret_key: string;
  enabled: boolean;
  updated_at?: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  deposit_paid: "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-purple-100 text-purple-800 border-purple-200",
  fully_paid: "bg-green-100 text-green-800 border-green-200",
  ready_for_delivery: "bg-orange-100 text-orange-800 border-orange-200",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  deposit_paid: DollarSign,
  in_progress: ShoppingBag,
  fully_paid: CheckCircle,
  ready_for_delivery: Truck,
  delivered: CheckCircle,
  cancelled: XCircle,
};

const activityConfig: Record<string, { label: string; color: string; icon: typeof LogIn }> = {
  login: { label: "Login", color: "bg-green-100 text-green-700 border-green-200", icon: LogIn },
  login_failed: { label: "Failed Login", color: "bg-red-100 text-red-700 border-red-200", icon: AlertTriangle },
  signup: { label: "Sign Up", color: "bg-blue-100 text-blue-700 border-blue-200", icon: UserPlus },
  signup_failed: { label: "Signup Failed", color: "bg-red-100 text-red-700 border-red-200", icon: AlertTriangle },
  logout: { label: "Logout", color: "bg-gray-100 text-gray-700 border-gray-200", icon: LogOut },
  password_reset: { label: "Password Reset", color: "bg-orange-100 text-orange-700 border-orange-200", icon: Shield },
};

const CHART_COLORS = ["hsl(38,92%,50%)", "hsl(222,47%,11%)", "hsl(220,26%,20%)", "hsl(43,96%,56%)", "hsl(33,90%,40%)", "hsl(220,9%,46%)"];
const DEFAULT_CATEGORIES = ["Televisions", "Refrigerators", "Washing Machines", "Air Conditioners", "Microwaves", "Generators"];

const AdminDashboard = () => {
  const { user, isAdmin, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [products, setProducts] = useState<DBProduct[]>([]);
  const [orders, setOrders] = useState<DBOrder[]>([]);
  const [payments, setPayments] = useState<DBPayment[]>([]);
  const [customers, setCustomers] = useState<DBProfile[]>([]);
  const [activityLogs, setActivityLogs] = useState<DBActivityLog[]>([]);
  const [reminders, setReminders] = useState<DBInstallmentReminder[]>([]);

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [productImages, setProductImages] = useState<File[]>([]);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dynamicCategories, setDynamicCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [savingCategories, setSavingCategories] = useState(false);

  const [showEditProduct, setShowEditProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<DBProduct | null>(null);
  const [editForm, setEditForm] = useState({ name: "", brand: "", category: "", description: "", overview: "", price: "", original_price: "", badge: "", min_deposit: "", max_installment_months: "", features: "", stock_count: "0", unlimited_stock: true, available: true });
  const [editImages, setEditImages] = useState<File[]>([]);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCustomer, setSelectedCustomer] = useState<DBProfile | null>(null);

  const [koraSettings, setKoraSettings] = useState<PaymentGatewaySetting>({
    gateway: "korapay", public_key: "", secret_key: "", enabled: true,
  });
  const [koraPublicKeyInput, setKoraPublicKeyInput] = useState("");
  const [koraSecretKeyInput, setKoraSecretKeyInput] = useState("");
  const [showKoraSecret, setShowKoraSecret] = useState(false);
  const [savingKora, setSavingKora] = useState(false);

  const [whatsappInput, setWhatsappInput] = useState("");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  const [newProduct, setNewProduct] = useState({
    name: "", brand: "Hisense", category: "Televisions",
    description: "", overview: "", price: "", original_price: "", badge: "",
    min_deposit: "", max_installment_months: "6",
    features: "", stock_count: "0", unlimited_stock: true, available: true
  });

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/login");
      return;
    }
    if (user && isAdmin) { fetchData(); loadCategories(); }
  }, [user, isAdmin, authLoading]);

  const fetchData = async () => {
    try {
      const [productsSnap, ordersSnap, paymentsSnap, customersSnap, activitySnap, remindersSnap, gatewaySnap, waSnap] = await Promise.all([
        getDocs(query(collection(db, "products"), orderBy("created_at", "desc"))),
        getDocs(query(collection(db, "orders"), orderBy("created_at", "desc"))),
        getDocs(query(collection(db, "payments"), orderBy("created_at", "desc"))),
        getDocs(query(collection(db, "profiles"), orderBy("created_at", "desc"))),
        getDocs(query(collection(db, "activity_logs"), orderBy("created_at", "desc"), limit(200))),
        getDocs(query(collection(db, "installment_reminders"), orderBy("created_at", "desc"), limit(100))),
        getDoc(doc(db, "payment_settings", "korapay")),
        getDoc(doc(db, "site_settings", "whatsapp_number"))
      ]);

      setProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as DBProduct)));
      setOrders(ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as DBOrder)));
      setPayments(paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as DBPayment)));
      setCustomers(customersSnap.docs.map(d => ({ id: d.id, ...d.data() } as DBProfile)));
      setActivityLogs(activitySnap.docs.map(d => ({ id: d.id, ...d.data() } as DBActivityLog)));
      setReminders(remindersSnap.docs.map(d => ({ id: d.id, ...d.data() } as DBInstallmentReminder)));

      if (gatewaySnap.exists()) {
        const gatewayData = gatewaySnap.data() as PaymentGatewaySetting;
        setKoraSettings(gatewayData);
        setKoraPublicKeyInput(gatewayData.public_key || "");
        setKoraSecretKeyInput(gatewayData.secret_key || "");
      }
      
      if (waSnap.exists()) {
        setWhatsappInput(waSnap.data().value || "");
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWhatsapp = async () => {
    setSavingWhatsapp(true);
    try {
      await setDoc(doc(db, "site_settings", "whatsapp_number"), { 
        key: "whatsapp_number", 
        value: whatsappInput, 
        updated_at: new Date().toISOString() 
      }, { merge: true });
      toast.success("WhatsApp number saved! Button will appear on the site.");
    } catch (error) {
      toast.error("Failed to save: " + (error as Error).message);
    } finally {
      setSavingWhatsapp(false);
    }
  };

  const handleImageUpload = async (files: File[]): Promise<string[]> => {
    try {
      return await uploadImages(files);
    } catch (error: any) {
      toast.error(`Image upload failed: ${error.message}`);
      return [];
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.price) { toast.error("Name and price are required"); return; }
    setUploadingImage(true);
    let imageUrls: string[] = [];
    if (productImages.length > 0) imageUrls = await handleImageUpload(productImages);
    try {
      await addDoc(collection(db, "products"), {
        name: newProduct.name, brand: newProduct.brand, category: newProduct.category,
        description: newProduct.description || null,
        overview: newProduct.overview || null,
        original_price: newProduct.original_price ? Number(newProduct.original_price) : null,
        badge: newProduct.badge || null,
        price: Number(newProduct.price), min_deposit: Number(newProduct.min_deposit) || 0,
        max_installment_months: Number(newProduct.max_installment_months) || 6,
        features: newProduct.features.split(",").map(f => f.trim()).filter(Boolean),
        images: imageUrls.length > 0 ? imageUrls : null,
        image: imageUrls[0] || null,
        stock_count: parseInt(newProduct.stock_count) || 0,
        unlimited_stock: newProduct.unlimited_stock,
        inventory_status: newProduct.unlimited_stock || parseInt(newProduct.stock_count) > 0 ? "in_stock" : "out_of_stock",
        available: newProduct.available,
        sales: 0,
        created_at: new Date().toISOString()
      });
      toast.success("Product added!");
      setShowAddProduct(false);
      setNewProduct({ name: "", brand: "Hisense", category: "Televisions", description: "", overview: "", price: "", original_price: "", badge: "", min_deposit: "", max_installment_months: "6", features: "", stock_count: "0", unlimited_stock: true, available: true });
      setProductImages([]);
      fetchData();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteDoc(doc(db, "products", id));
      toast.success("Product deleted");
      fetchData();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const openEditProduct = (product: DBProduct) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description || "",
      overview: product.overview || "",
      price: String(product.price),
      original_price: product.original_price ? String(product.original_price) : "",
      badge: product.badge || "",
      min_deposit: String(product.min_deposit),
      max_installment_months: String(product.max_installment_months),
      features: (product.features || []).join(", "),
      stock_count: product.stock_count?.toString() || "0",
      unlimited_stock: product.unlimited_stock !== false,
      available: product.available !== false
    });
    setEditImages([]);
    setShowEditProduct(true);
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct || !editForm.name || !editForm.price) { toast.error("Name and price are required"); return; }
    setUploadingImage(true);
    let imageUrls = editingProduct.images || [];
    if (editImages.length > 0) {
      const newUrls = await handleImageUpload(editImages);
      imageUrls = [...imageUrls, ...newUrls];
    }
    try {
      await updateDoc(doc(db, "products", editingProduct.id), {
        name: editForm.name,
        brand: editForm.brand,
        category: editForm.category,
        description: editForm.description || null,
        overview: editForm.overview || null,
        original_price: editForm.original_price ? Number(editForm.original_price) : null,
        badge: editForm.badge || null,
        price: Number(editForm.price),
        min_deposit: Number(editForm.min_deposit) || 0,
        max_installment_months: parseInt(editForm.max_installment_months),
        features: editForm.features.split(",").map(f => f.trim()).filter(Boolean),
        images: imageUrls.length > 0 ? imageUrls : null,
        image: imageUrls[0] || editingProduct.images?.[0] || null,
        stock_count: parseInt(editForm.stock_count) || 0,
        unlimited_stock: editForm.unlimited_stock,
        inventory_status: editForm.unlimited_stock || parseInt(editForm.stock_count) > 0 ? "in_stock" : "out_of_stock",
        available: editForm.available,
        updated_at: new Date().toISOString()
      });
      toast.success("Product updated!");
      setShowEditProduct(false);
      setEditingProduct(null);
      fetchData();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploadingImage(false);
    }
  };

  const loadCategories = async () => {
    try {
      const snap = await getDoc(doc(db, "site_settings", "product_categories"));
      if (snap.exists() && snap.data().value) {
        const cats = JSON.parse(snap.data().value as string);
        if (Array.isArray(cats) && cats.length > 0) setDynamicCategories(cats);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed || dynamicCategories.includes(trimmed)) return;
    const updated = [...dynamicCategories, trimmed];
    setSavingCategories(true);
    try {
      await setDoc(doc(db, "site_settings", "product_categories"), { key: "product_categories", value: JSON.stringify(updated), updated_at: new Date().toISOString() }, { merge: true });
      setDynamicCategories(updated);
      setNewCategoryInput("");
      toast.success("Category added");
    } catch (e) {
      toast.error("Failed to add category");
    } finally {
      setSavingCategories(false);
    }
  };

  const handleRemoveCategory = async (cat: string) => {
    const updated = dynamicCategories.filter(c => c !== cat);
    try {
      await setDoc(doc(db, "site_settings", "product_categories"), { key: "product_categories", value: JSON.stringify(updated), updated_at: new Date().toISOString() }, { merge: true });
      setDynamicCategories(updated);
      toast.success("Category removed");
    } catch (e) {
      toast.error("Failed to remove category");
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      await updateOrderStatus(orderId, status as any, "Status updated by admin");
      toast.success("Status updated");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSendReminder = async (order: DBOrder) => {
    setSendingReminder(order.id);
    const customer = customers.find(c => c.user_id === order.user_id);
    const daysOverdue = order.next_payment_due
      ? Math.floor((Date.now() - new Date(order.next_payment_due).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // We need the customer's email — we'll grab from auth context/user or just a placeholder if not found.
    const token = await auth.currentUser?.getIdToken();

    if (!token) { toast.error("Session expired, please re-login"); setSendingReminder(null); return; }

    // We need the customer's email — stored in auth.users, not profiles
    // Use a placeholder email format or retrieve it
    const customerEmail = customer?.phone
      ? `customer-${order.user_id.slice(0, 8)}@placeholder.com`
      : `customer-${order.user_id.slice(0, 8)}@placeholder.com`;

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reminder`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        order_id: order.id,
        user_id: order.user_id,
        customer_name: customer?.full_name || "Customer",
        customer_email: customerEmail,
        product_name: order.product_name,
        amount_due: order.remaining_balance,
        days_overdue: Math.max(0, daysOverdue),
      }),
    });

    const result = await res.json();
    setSendingReminder(null);

    if (result.success !== false) {
      toast.success(result.message || "Reminder logged successfully");
      fetchData();
    } else {
      toast.error(result.error || "Failed to send reminder");
    }
  };

  const handleSaveKoraSettings = async () => {
    setSavingKora(true);
    const updates: Partial<PaymentGatewaySetting> & { updated_at: string } = {
      public_key: koraPublicKeyInput,
      updated_at: new Date().toISOString(),
    };
    if (koraSecretKeyInput && koraSecretKeyInput !== maskKey(koraSettings.secret_key)) {
      updates.secret_key = koraSecretKeyInput;
    }
    try {
      await setDoc(doc(db, "payment_settings", "korapay"), updates, { merge: true });
      toast.success("KoraPay settings saved successfully"); 
      fetchData();
    } catch (error) {
      toast.error("Failed to save: " + (error as Error).message);
    } finally {
      setSavingKora(false);
    }
  };

  const handleToggleKora = async () => {
    const newEnabled = !koraSettings.enabled;
    try {
      await updateDoc(doc(db, "payment_settings", "korapay"), { 
        enabled: newEnabled, 
        updated_at: new Date().toISOString() 
      });
      setKoraSettings(s => ({ ...s, enabled: newEnabled }));
      toast.success(`KoraPay ${newEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      toast.error("Failed to update: " + (error as Error).message);
    }
  };

  const maskKey = (key: string) => {
    if (!key || key.length < 8) return key;
    return key.slice(0, 8) + "•".repeat(Math.min(key.length - 8, 20));
  };

  // Analytics
  const totalRevenue = orders.reduce((sum, o) => sum + o.total_paid, 0);
  const pendingPayments = orders.reduce((sum, o) => sum + o.remaining_balance, 0);
  const completedOrders = orders.filter(o => o.status === "delivered").length;
  const activeOrders = orders.filter(o => !["delivered", "cancelled"].includes(o.status)).length;

  // Overdue installments
  const overdueOrders = orders.filter(o =>
    o.payment_type === "installment" &&
    o.remaining_balance > 0 &&
    o.next_payment_due &&
    new Date(o.next_payment_due) < new Date() &&
    !["delivered", "cancelled", "fully_paid"].includes(o.status)
  );

  // Upcoming (due within 7 days)
  const upcomingOrders = orders.filter(o =>
    o.payment_type === "installment" &&
    o.remaining_balance > 0 &&
    o.next_payment_due &&
    new Date(o.next_payment_due) >= new Date() &&
    new Date(o.next_payment_due) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) &&
    !["delivered", "cancelled", "fully_paid"].includes(o.status)
  );

  const ordersByStatus = Object.entries(
    orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));

  const productsByCategory = Object.entries(
    products.reduce((acc, p) => { acc[p.category] = (acc[p.category] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const revenueByMonth = orders.reduce((acc, o) => {
    const month = new Date(o.created_at).toLocaleDateString("en", { month: "short", year: "2-digit" });
    const existing = acc.find(a => a.month === month);
    if (existing) { existing.revenue += o.total_paid; existing.orders += 1; }
    else acc.push({ month, revenue: o.total_paid, orders: 1 });
    return acc;
  }, [] as { month: string; revenue: number; orders: number }[]);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredOrders = orders.filter(o =>
    o.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.status.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredPayments = payments.filter(p =>
    p.payment_reference?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.payment_gateway?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.status.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredCustomers = customers.filter(c =>
    c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredActivity = activityLogs.filter(a =>
    (activityFilter === "all" || a.event_type === activityFilter) &&
    (searchQuery === "" || a.email?.toLowerCase().includes(searchQuery.toLowerCase()) || a.event_type.includes(searchQuery.toLowerCase()))
  );

  // Activity stats
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayLogins = activityLogs.filter(a => a.event_type === "login" && new Date(a.created_at) >= todayStart).length;
  const todaySignups = activityLogs.filter(a => a.event_type === "signup" && new Date(a.created_at) >= todayStart).length;
  const failedLogins = activityLogs.filter(a => a.event_type === "login_failed").length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: typeof BarChart3; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "products", label: "Products", icon: Package },
    { id: "orders", label: "Orders", icon: ShoppingBag, badge: activeOrders || undefined },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "customers", label: "Customers", icon: Users },
    { id: "reminders", label: "Reminders", icon: Bell, badge: overdueOrders.length || undefined },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-gold flex items-center justify-center">
                <Package className="w-4 h-4 text-accent-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-display font-bold text-foreground">Olas & Bs Admin</h1>
                <p className="text-[10px] text-muted-foreground">Management Console</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={fetchData} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
                <LogOut className="w-4 h-4 mr-1" /> Logout
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide -mb-px">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                onClick={() => { setActiveTab(id); setSearchQuery(""); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === id
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {badge !== undefined && badge > 0 && (
                  <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 lg:px-8 py-6">
        <AnimatePresence mode="wait">

          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  { icon: DollarSign, label: "Total Revenue", value: formatPrice(totalRevenue), trend: "+12%", up: true, color: "bg-green-50 text-green-600" },
                  { icon: Clock, label: "Pending Balance", value: formatPrice(pendingPayments), trend: `${activeOrders} active`, up: false, color: "bg-orange-50 text-orange-600" },
                  { icon: ShoppingBag, label: "Total Orders", value: orders.length.toString(), trend: `${completedOrders} delivered`, up: true, color: "bg-blue-50 text-blue-600" },
                  { icon: Users, label: "Customers", value: customers.length.toString(), trend: `${products.length} products`, up: true, color: "bg-purple-50 text-purple-600" },
                ].map(({ icon: Icon, label, value, trend, up, color }, i) => (
                  <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    className="bg-card rounded-2xl p-4 shadow-sm border border-border/50">
                    <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center mb-3`}><Icon className="w-4 h-4" /></div>
                    <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
                    <p className="text-lg font-display font-bold text-foreground">{value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {up ? <ArrowUpRight className="w-3 h-3 text-green-500" /> : <ArrowDownRight className="w-3 h-3 text-orange-500" />}
                      <span className="text-[10px] text-muted-foreground">{trend}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Alert bar for overdue installments */}
              {overdueOrders.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-800">{overdueOrders.length} overdue installment{overdueOrders.length !== 1 ? "s" : ""}</p>
                      <p className="text-xs text-red-600">Customers with missed installment payments</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setActiveTab("reminders")} className="border-red-300 text-red-700 hover:bg-red-100 text-xs flex-shrink-0">
                    View <ArrowUpRight className="w-3 h-3 ml-1" />
                  </Button>
                </motion.div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-4">Revenue Trend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={revenueByMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(220,9%,46%)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(220,9%,46%)" />
                      <Tooltip formatter={(v: number) => formatPrice(v)} />
                      <Line type="monotone" dataKey="revenue" stroke="hsl(38,92%,50%)" strokeWidth={2} dot={{ fill: "hsl(38,92%,50%)" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-4">Orders by Status</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={ordersByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
                        label={({ name, value }) => `${name} (${value})`} labelLine={{ stroke: "hsl(220,9%,46%)" }}>
                        {ordersByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50 mb-4">
                <h3 className="text-sm font-display font-semibold text-foreground mb-4">Products by Category</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={productsByCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(220,9%,46%)" angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(220,9%,46%)" />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(38,92%,50%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-display font-semibold text-foreground">Recent Orders</h3>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab("orders")} className="text-xs text-accent">
                    View all <ArrowUpRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {orders.slice(0, 5).map((order) => {
                    const StatusIcon = statusIcons[order.status] || Clock;
                    return (
                      <div key={order.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${statusColors[order.status] || "bg-muted"}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-foreground">{order.product_name}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-foreground">{formatPrice(order.total_payable)}</p>
                          <Badge variant="outline" className={`text-[9px] ${statusColors[order.status]}`}>
                            {order.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                  {orders.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">No orders yet</p>}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── PRODUCTS TAB ── */}
          {activeTab === "products" && (
            <motion.div key="products" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 rounded-xl" />
                </div>
                <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-gold text-accent-foreground rounded-xl shadow-gold">
                      <Plus className="mr-2 w-4 h-4" /> Add Product
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="font-display">Add New Product</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Product Name</label>
                        <Input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} placeholder='Hisense 55" 4K Smart TV' className="rounded-xl" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Brand</label>
                          <Input value={newProduct.brand} onChange={e => setNewProduct({ ...newProduct, brand: e.target.value })} className="rounded-xl" />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Category</label>
                          <Select value={newProduct.category} onValueChange={v => setNewProduct({ ...newProduct, category: v })}>
                            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {dynamicCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Description</label>
                        <Textarea value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} className="rounded-xl" rows={3} />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Overview <span className="text-muted-foreground text-xs">(short blurb shown on product page)</span></label>
                        <Textarea value={newProduct.overview} onChange={e => setNewProduct({ ...newProduct, overview: e.target.value })} className="rounded-xl" rows={2} placeholder="e.g. The ultimate smart TV for your home..." />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Selling Price (₦)</label>
                          <Input type="number" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} className="rounded-xl" />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Original Price (₦) <span className="text-muted-foreground text-xs">for discount</span></label>
                          <Input type="number" value={newProduct.original_price} onChange={e => setNewProduct({ ...newProduct, original_price: e.target.value })} className="rounded-xl" placeholder="Leave blank if no discount" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Min Deposit (₦)</label>
                          <Input type="number" value={newProduct.min_deposit} onChange={e => setNewProduct({ ...newProduct, min_deposit: e.target.value })} className="rounded-xl" />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Product Badge</label>
                          <Select value={newProduct.badge} onValueChange={v => setNewProduct({ ...newProduct, badge: v })}>
                            <SelectTrigger className="rounded-xl"><SelectValue placeholder="None" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">None</SelectItem>
                              {["Best Seller","New Arrival","Hot Deal","Top Rated","Trending","Clearance","Premium","Limited"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Max Installment Months</label>
                        <Input type="number" value={newProduct.max_installment_months} onChange={e => setNewProduct({ ...newProduct, max_installment_months: e.target.value })} className="rounded-xl" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Stock Count</label>
                          <Input type="number" disabled={newProduct.unlimited_stock} value={newProduct.stock_count} onChange={e => setNewProduct({ ...newProduct, stock_count: e.target.value })} className="rounded-xl" />
                        </div>
                        <div className="flex items-center gap-2 mt-7">
                          <input type="checkbox" id="unlimited" checked={newProduct.unlimited_stock} onChange={e => setNewProduct({ ...newProduct, unlimited_stock: e.target.checked })} className="rounded text-accent" />
                          <label htmlFor="unlimited" className="text-sm text-foreground">Unlimited Stock</label>
                        </div>
                        <div className="flex items-center gap-2 mt-4">
                          <input type="checkbox" id="add-available" checked={newProduct.available} onChange={e => setNewProduct({ ...newProduct, available: e.target.checked })} className="rounded text-accent" />
                          <label htmlFor="add-available" className="text-sm font-medium cursor-pointer">Product is Active (Visible on site)</label>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Features (comma-separated)</label>
                        <Input value={newProduct.features} onChange={e => setNewProduct({ ...newProduct, features: e.target.value })} placeholder="4K, Smart TV, HDR" className="rounded-xl" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Product Images</label>
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-accent transition-colors"
                        >
                          <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Click to upload images</p>
                          <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG up to 5MB each</p>
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                          onChange={e => setProductImages(Array.from(e.target.files || []))} />
                        {productImages.length > 0 && (
                          <div className="flex gap-2 mt-3 flex-wrap">
                            {productImages.map((file, i) => (
                              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                                <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                                <button onClick={(e) => { e.stopPropagation(); setProductImages(productImages.filter((_, j) => j !== i)); }}
                                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                                  <XCircle className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button onClick={handleAddProduct} disabled={uploadingImage} className="w-full bg-gradient-gold text-accent-foreground rounded-xl shadow-gold">
                        {uploadingImage ? "Uploading..." : "Add Product"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="text-xs text-muted-foreground mb-3">{filteredProducts.length} products</div>
              <div className="space-y-2">
                {filteredProducts.map((product, i) => (
                  <motion.div key={product.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className="bg-card rounded-xl p-3 shadow-sm border border-border/50 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
                      {product.images && product.images[0]
                        ? <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                        : <Image className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-semibold text-foreground truncate">{product.name}</h3>
                      <p className="text-[10px] text-muted-foreground">{product.brand} • {product.category}</p>
                      <p className="text-xs font-bold text-accent mt-0.5">{formatPrice(product.price)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="flex gap-2">
                        <Badge variant="outline" className={product.available ? "text-green-600 border-green-200 bg-green-50 text-[10px]" : "text-red-600 border-red-200 bg-red-50 text-[10px]"}>
                          {product.available ? "Active" : "Inactive"}
                        </Badge>
                        <button 
                          onClick={() => {
                            updateDoc(doc(db, "products", product.id), { available: !product.available })
                              .then(() => { toast.success("Status updated"); fetchData(); })
                              .catch(e => toast.error(e.message));
                          }}
                          className={`ml-2 text-xs hover:underline ${product.available ? "text-amber-600" : "text-green-600"}`}
                        >
                          Make {product.available ? "Inactive" : "Active"}
                        </button>
                        <Badge variant="outline" className={product.unlimited_stock || product.stock_count > 0 ? "text-blue-600 border-blue-200 bg-blue-50 text-[10px]" : "text-orange-600 border-orange-200 bg-orange-50 text-[10px]"}>
                          {product.unlimited_stock ? "∞ Stock" : `${product.stock_count} in stock`}
                        </Badge>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <Button size="icon" variant="ghost" onClick={() => openEditProduct(product)} className="text-accent w-7 h-7">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteProduct(product.id)} className="text-destructive w-7 h-7">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <Package className="w-10 h-10 mx-auto mb-2 text-border" /> No products found
                  </div>
                )}
              </div>

              {/* Edit Product Dialog */}
              <Dialog open={showEditProduct} onOpenChange={setShowEditProduct}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-display">Edit Product</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Product Name</label>
                      <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="rounded-xl" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Brand</label>
                        <Input value={editForm.brand} onChange={e => setEditForm({ ...editForm, brand: e.target.value })} className="rounded-xl" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Category</label>
                        <Select value={editForm.category} onValueChange={v => setEditForm({ ...editForm, category: v })}>
                          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {dynamicCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Description</label>
                      <Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="rounded-xl" rows={3} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Overview <span className="text-muted-foreground text-xs">(short blurb on product page)</span></label>
                      <Textarea value={editForm.overview} onChange={e => setEditForm({ ...editForm, overview: e.target.value })} className="rounded-xl" rows={2} placeholder="e.g. The ultimate smart TV for your home..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Selling Price (₦)</label>
                        <Input type="number" value={editForm.price} onChange={e => setEditForm({ ...editForm, price: e.target.value })} className="rounded-xl" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Original Price (₦) <span className="text-muted-foreground text-xs">for discount</span></label>
                        <Input type="number" value={editForm.original_price} onChange={e => setEditForm({ ...editForm, original_price: e.target.value })} className="rounded-xl" placeholder="Leave blank if no discount" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Min Deposit (₦)</label>
                        <Input type="number" value={editForm.min_deposit} onChange={e => setEditForm({ ...editForm, min_deposit: e.target.value })} className="rounded-xl" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Product Badge</label>
                        <Select value={editForm.badge} onValueChange={v => setEditForm({ ...editForm, badge: v })}>
                          <SelectTrigger className="rounded-xl"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {["Best Seller","New Arrival","Hot Deal","Top Rated","Trending","Clearance","Premium","Limited"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Max Installment Months</label>
                      <Input type="number" value={editForm.max_installment_months} onChange={e => setEditForm({ ...editForm, max_installment_months: e.target.value })} className="rounded-xl" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Stock Count</label>
                        <Input type="number" disabled={editForm.unlimited_stock} value={editForm.stock_count} onChange={e => setEditForm({ ...editForm, stock_count: e.target.value })} className="rounded-xl" />
                      </div>
                      <div className="flex items-center gap-2 mt-7">
                        <input type="checkbox" id="edit-unlimited" checked={editForm.unlimited_stock} onChange={e => setEditForm({ ...editForm, unlimited_stock: e.target.checked })} className="rounded text-accent" />
                        <label htmlFor="edit-unlimited" className="text-sm cursor-pointer">Unlimited Stock</label>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <input type="checkbox" id="edit-available" checked={editForm.available} onChange={e => setEditForm({ ...editForm, available: e.target.checked })} className="rounded text-accent" />
                        <label htmlFor="edit-available" className="text-sm font-medium cursor-pointer">Product is Active (Visible on site)</label>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Features (comma-separated)</label>
                      <Input value={editForm.features} onChange={e => setEditForm({ ...editForm, features: e.target.value })} placeholder="4K, Smart TV, HDR" className="rounded-xl" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Add More Images</label>
                      {editingProduct?.images && editingProduct.images.length > 0 && (
                        <div className="flex gap-2 mb-3 flex-wrap">
                          {editingProduct.images.map((url, i) => (
                            <div key={i} className="w-14 h-14 rounded-lg overflow-hidden border border-border">
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      )}
                      <div onClick={() => editFileInputRef.current?.click()} className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-accent transition-colors">
                        <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Click to add images</p>
                      </div>
                      <input ref={editFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => setEditImages(Array.from(e.target.files || []))} />
                      {editImages.length > 0 && (
                        <p className="text-xs text-accent mt-2">{editImages.length} new image(s) selected</p>
                      )}
                    </div>
                    <Button onClick={handleUpdateProduct} disabled={uploadingImage} className="w-full bg-gradient-gold text-accent-foreground rounded-xl shadow-gold">
                      {uploadingImage ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </motion.div>
          )}

          {/* ── ORDERS TAB ── */}
          {activeTab === "orders" && (
            <motion.div key="orders" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 rounded-xl" />
              </div>
              <div className="text-xs text-muted-foreground mb-3">{filteredOrders.length} orders</div>
              <div className="space-y-2">
                {filteredOrders.map((order, i) => {
                  const config = getOrderStatusConfig(order.status);
                  const StatusIcon = config.icon;
                  const isOverdue = order.next_payment_due && new Date(order.next_payment_due) < new Date() && order.remaining_balance > 0;
                  return (
                    <motion.div key={order.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                      className={`bg-card rounded-xl p-4 shadow-sm border ${isOverdue ? "border-red-200 bg-red-50/30" : "border-border/50"}`}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.badgeClass || config.colorClass}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h3 className="text-xs font-semibold text-foreground">{order.product_name}</h3>
                            <p className="text-[10px] text-muted-foreground">{formatOrderId(order.id)} • {new Date(order.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        {isOverdue && (
                          <Badge variant="outline" className="text-[9px] bg-red-50 text-red-700 border-red-200 flex-shrink-0">Overdue</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
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
                      {order.next_payment_due && (
                        <p className={`text-[10px] mb-2 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                          {isOverdue ? "⚠ Overdue since" : "Next due:"} {new Date(order.next_payment_due).toLocaleDateString()}
                        </p>
                      )}
                      <div className="w-full bg-secondary rounded-full h-1.5 mb-3">
                        <div className="bg-accent rounded-full h-1.5 transition-all"
                          style={{ width: `${order.total_payable > 0 ? Math.min((order.total_paid / order.total_payable) * 100, 100) : 0}%` }} />
                      </div>
                      <Select value={order.status} onValueChange={v => handleUpdateOrderStatus(order.id, v)}>
                        <SelectTrigger className="w-full rounded-xl text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.values(ORDER_STATUS).map(s => (
                            <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-border" /> No orders found
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── PAYMENTS TAB ── */}
          {activeTab === "payments" && (
            <motion.div key="payments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search payments..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 rounded-xl" />
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-card rounded-xl p-3 shadow-sm border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground">Total</p>
                  <p className="text-sm font-bold text-foreground">{payments.length}</p>
                </div>
                <div className="bg-card rounded-xl p-3 shadow-sm border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground">Successful</p>
                  <p className="text-sm font-bold text-green-600">{payments.filter(p => p.status === "success").length}</p>
                </div>
                <div className="bg-card rounded-xl p-3 shadow-sm border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground">Pending</p>
                  <p className="text-sm font-bold text-orange-600">{payments.filter(p => p.status === "pending").length}</p>
                </div>
              </div>

              {/* Kora Payment Info Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-start gap-3">
                <CreditCard className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-800">Kora Payment Gateway Active</p>
                  <p className="text-[11px] text-blue-600 mt-0.5">Payments via Korapay are processed securely. Set <code className="bg-blue-100 px-1 rounded">KORA_SECRET_KEY</code> in Supabase Edge Function secrets to activate.</p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground mb-3">{filteredPayments.length} payments</div>
              <div className="space-y-2">
                {filteredPayments.map((payment, i) => (
                  <motion.div key={payment.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className="bg-card rounded-xl p-3 shadow-sm border border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          payment.status === "success" ? "bg-green-50 text-green-600" :
                          payment.status === "pending" ? "bg-yellow-50 text-yellow-600" : "bg-red-50 text-red-600"}`}>
                          {payment.status === "success" ? <CheckCircle className="w-4 h-4" /> :
                           payment.status === "pending" ? <Clock className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{formatPrice(payment.amount)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {payment.payment_gateway || "N/A"} • {new Date(payment.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={`text-[9px] ${
                          payment.status === "success" ? "text-green-600 border-green-200 bg-green-50" :
                          payment.status === "pending" ? "text-yellow-600 border-yellow-200 bg-yellow-50" :
                          "text-red-600 border-red-200 bg-red-50"}`}>
                          {payment.status}
                        </Badge>
                        {payment.payment_reference && (
                          <p className="text-[9px] text-muted-foreground mt-1 truncate max-w-[100px]">{payment.payment_reference}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {filteredPayments.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <CreditCard className="w-10 h-10 mx-auto mb-2 text-border" /> No payments found
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── CUSTOMERS TAB ── */}
          {activeTab === "customers" && (
            <motion.div key="customers" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search customers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 rounded-xl" />
              </div>
              <div className="text-xs text-muted-foreground mb-3">{filteredCustomers.length} customers</div>
              <div className="space-y-2">
                {filteredCustomers.map((customer, i) => {
                  const customerOrders = orders.filter(o => o.user_id === customer.user_id);
                  const totalSpent = customerOrders.reduce((s, o) => s + o.total_paid, 0);
                  const hasOverdue = customerOrders.some(o =>
                    o.next_payment_due && new Date(o.next_payment_due) < new Date() && o.remaining_balance > 0
                  );
                  return (
                    <motion.div key={customer.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                      onClick={() => setSelectedCustomer(customer)}
                      className="bg-card rounded-xl p-4 shadow-sm border border-border/50 cursor-pointer hover:border-accent/40 hover:shadow-md transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-accent">{(customer.full_name || "?")[0].toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-semibold text-foreground">{customer.full_name || "Unknown"}</h3>
                            {hasOverdue && <Badge variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200">Overdue</Badge>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {customer.phone && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Phone className="w-2.5 h-2.5" />{customer.phone}</span>}
                            <span className="text-[10px] text-muted-foreground">Joined {new Date(customer.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-bold text-foreground">{formatPrice(totalSpent)}</p>
                            <p className="text-[10px] text-muted-foreground">{customerOrders.length} orders</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                      {customer.address && (
                        <p className="text-[10px] text-muted-foreground mt-2 pl-[52px] flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />{customer.address}
                        </p>
                      )}
                    </motion.div>
                  );
                })}
                {filteredCustomers.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <Users className="w-10 h-10 mx-auto mb-2 text-border" /> No customers found
                  </div>
                )}
              </div>

              {/* Customer History Dialog */}
              <Dialog open={!!selectedCustomer} onOpenChange={open => { if (!open) setSelectedCustomer(null); }}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  {selectedCustomer && (() => {
                    const cOrders = orders.filter(o => o.user_id === selectedCustomer.user_id);
                    const cPayments = payments.filter(p => cOrders.some(o => o.id === p.order_id));
                    const totalSpent = cOrders.reduce((s, o) => s + o.total_paid, 0);
                    const totalBalance = cOrders.reduce((s, o) => s + o.remaining_balance, 0);
                    const hasOverdue = cOrders.some(o =>
                      o.next_payment_due && new Date(o.next_payment_due) < new Date() && o.remaining_balance > 0
                    );
                    return (
                      <>
                        <DialogHeader>
                          <DialogTitle className="font-display flex items-center gap-2">
                            <History className="w-5 h-5 text-accent" />
                            Order History
                          </DialogTitle>
                        </DialogHeader>

                        {/* Customer profile */}
                        <div className="bg-secondary/50 rounded-xl p-4 flex items-center gap-3 mt-2">
                          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-base font-bold text-accent">{(selectedCustomer.full_name || "?")[0].toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-foreground">{selectedCustomer.full_name || "Unknown"}</h3>
                              {hasOverdue && <Badge variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200">Overdue</Badge>}
                            </div>
                            {selectedCustomer.phone && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" />{selectedCustomer.phone}
                              </p>
                            )}
                            {selectedCustomer.address && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />{selectedCustomer.address}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Joined {new Date(selectedCustomer.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        {/* Summary stats */}
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="bg-card border border-border rounded-xl p-3 text-center">
                            <p className="text-[10px] text-muted-foreground">Total Paid</p>
                            <p className="text-xs font-bold text-green-600">{formatPrice(totalSpent)}</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-3 text-center">
                            <p className="text-[10px] text-muted-foreground">Balance Due</p>
                            <p className="text-xs font-bold text-orange-600">{formatPrice(totalBalance)}</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-3 text-center">
                            <p className="text-[10px] text-muted-foreground">Orders</p>
                            <p className="text-xs font-bold text-foreground">{cOrders.length}</p>
                          </div>
                        </div>

                        {/* Orders list */}
                        <div className="mt-4 space-y-3">
                          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">Orders</h4>
                          {cOrders.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-6">No orders yet</p>
                          )}
                          {cOrders.map(order => {
                            const orderPayments = cPayments.filter(p => p.order_id === order.id);
                            const StatusIcon = statusIcons[order.status] || Clock;
                            const isOverdue = order.next_payment_due && new Date(order.next_payment_due) < new Date() && order.remaining_balance > 0;
                            return (
                              <div key={order.id} className={`bg-card border rounded-xl overflow-hidden ${isOverdue ? "border-red-200" : "border-border/50"}`}>
                                {/* Order header */}
                                <div className="flex items-center gap-2 p-3 bg-secondary/30">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${statusColors[order.status] || "bg-muted"}`}>
                                    <StatusIcon className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-foreground truncate">{order.product_name}</p>
                                    <p className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString()} · {order.payment_type.replace(/_/g, " ")}</p>
                                  </div>
                                  <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${statusColors[order.status]}`}>
                                    {order.status.replace(/_/g, " ")}
                                  </Badge>
                                </div>

                                {/* Order financials */}
                                <div className="grid grid-cols-3 gap-2 p-3">
                                  <div>
                                    <p className="text-[9px] text-muted-foreground">Total</p>
                                    <p className="text-[11px] font-bold text-foreground">{formatPrice(order.total_payable)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] text-muted-foreground">Paid</p>
                                    <p className="text-[11px] font-bold text-green-600">{formatPrice(order.total_paid)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] text-muted-foreground">Balance</p>
                                    <p className={`text-[11px] font-bold ${order.remaining_balance > 0 ? "text-orange-600" : "text-green-600"}`}>{formatPrice(order.remaining_balance)}</p>
                                  </div>
                                </div>

                                {/* Progress bar */}
                                <div className="px-3 pb-2">
                                  <div className="w-full bg-secondary rounded-full h-1">
                                    <div className="bg-accent rounded-full h-1 transition-all"
                                      style={{ width: `${order.total_payable > 0 ? Math.min((order.total_paid / order.total_payable) * 100, 100) : 0}%` }} />
                                  </div>
                                </div>

                                {order.next_payment_due && order.remaining_balance > 0 && (
                                  <p className={`text-[10px] px-3 pb-2 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                    {isOverdue ? "⚠ Overdue since" : "Next due:"} {new Date(order.next_payment_due).toLocaleDateString()}
                                  </p>
                                )}

                                {/* Payment entries for this order */}
                                {orderPayments.length > 0 && (
                                  <div className="border-t border-border/50 p-3">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payments ({orderPayments.length})</p>
                                    <div className="space-y-1.5">
                                      {orderPayments.map(pmt => (
                                        <div key={pmt.id} className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                              pmt.status === "success" ? "bg-green-100" : pmt.status === "pending" ? "bg-yellow-100" : "bg-red-100"
                                            }`}>
                                              {pmt.status === "success"
                                                ? <CheckCircle className="w-3 h-3 text-green-600" />
                                                : pmt.status === "pending"
                                                ? <Clock className="w-3 h-3 text-yellow-600" />
                                                : <XCircle className="w-3 h-3 text-red-600" />}
                                            </div>
                                            <div>
                                              <p className="text-[10px] font-medium text-foreground">{formatPrice(pmt.amount)}</p>
                                              <p className="text-[9px] text-muted-foreground">{new Date(pmt.created_at).toLocaleDateString()} · {pmt.payment_gateway || "—"}</p>
                                            </div>
                                          </div>
                                          <Badge variant="outline" className={`text-[9px] ${
                                            pmt.status === "success" ? "text-green-600 border-green-200 bg-green-50" :
                                            pmt.status === "pending" ? "text-yellow-600 border-yellow-200 bg-yellow-50" :
                                            "text-red-600 border-red-200 bg-red-50"
                                          }`}>{pmt.status}</Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </DialogContent>
              </Dialog>
            </motion.div>
          )}

          {/* ── REMINDERS TAB ── */}
          {activeTab === "reminders" && (
            <motion.div key="reminders" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-red-600 font-medium">Overdue</p>
                  <p className="text-xl font-bold text-red-700">{overdueOrders.length}</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-yellow-600 font-medium">Due This Week</p>
                  <p className="text-xl font-bold text-yellow-700">{upcomingOrders.length}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-green-600 font-medium">Reminders Sent</p>
                  <p className="text-xl font-bold text-green-700">{reminders.length}</p>
                </div>
              </div>

              {/* Overdue Installments */}
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50 mb-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <h3 className="text-sm font-display font-semibold text-foreground">Overdue Installments</h3>
                  {overdueOrders.length > 0 && (
                    <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">{overdueOrders.length}</Badge>
                  )}
                </div>

                {overdueOrders.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No overdue installments</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {overdueOrders.map((order, i) => {
                      const customer = customers.find(c => c.user_id === order.user_id);
                      const daysOverdue = order.next_payment_due
                        ? Math.floor((Date.now() - new Date(order.next_payment_due).getTime()) / (1000 * 60 * 60 * 24))
                        : 0;
                      const alreadySent = reminders.some(r => r.order_id === order.id);
                      return (
                        <motion.div key={order.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className="border border-red-100 bg-red-50/40 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-xs font-semibold text-foreground truncate">{order.product_name}</p>
                                <Badge variant="outline" className="text-[9px] bg-red-100 text-red-700 border-red-200 flex-shrink-0">
                                  {daysOverdue}d overdue
                                </Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground mb-2">
                                Customer: {customer?.full_name || "Unknown"} {customer?.phone ? `• ${customer.phone}` : ""}
                              </p>
                              <div className="flex gap-3">
                                <div>
                                  <p className="text-[9px] text-muted-foreground">Balance Due</p>
                                  <p className="text-xs font-bold text-red-700">{formatPrice(order.remaining_balance)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-muted-foreground">Due Date</p>
                                  <p className="text-xs font-medium text-foreground">{order.next_payment_due ? new Date(order.next_payment_due).toLocaleDateString() : "N/A"}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-muted-foreground">Installment</p>
                                  <p className="text-xs font-medium text-foreground">{order.installment_months}mo plan</p>
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleSendReminder(order)}
                              disabled={sendingReminder === order.id}
                              className={`flex-shrink-0 rounded-xl text-[11px] h-8 px-3 ${
                                alreadySent
                                  ? "bg-secondary text-foreground hover:bg-secondary/80"
                                  : "bg-gradient-gold text-accent-foreground shadow-gold"
                              }`}
                            >
                              {sendingReminder === order.id
                                ? <RefreshCw className="w-3 h-3 animate-spin" />
                                : <><Send className="w-3 h-3 mr-1" />{alreadySent ? "Re-send" : "Remind"}</>}
                            </Button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Upcoming This Week */}
              {upcomingOrders.length > 0 && (
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50 mb-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <Calendar className="w-3.5 h-3.5 text-yellow-600" />
                    </div>
                    <h3 className="text-sm font-display font-semibold text-foreground">Due This Week</h3>
                    <Badge className="bg-yellow-100 text-yellow-700 border-0 text-[10px]">{upcomingOrders.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {upcomingOrders.map((order) => {
                      const customer = customers.find(c => c.user_id === order.user_id);
                      const daysUntilDue = order.next_payment_due
                        ? Math.ceil((new Date(order.next_payment_due).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : 0;
                      return (
                        <div key={order.id} className="border border-yellow-100 bg-yellow-50/40 rounded-xl p-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{order.product_name}</p>
                            <p className="text-[10px] text-muted-foreground">{customer?.full_name || "Unknown"} • Due in {daysUntilDue}d</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-bold text-yellow-700">{formatPrice(order.remaining_balance)}</p>
                            <p className="text-[9px] text-muted-foreground">{order.next_payment_due ? new Date(order.next_payment_due).toLocaleDateString() : ""}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reminder History */}
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Mail className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <h3 className="text-sm font-display font-semibold text-foreground">Reminder History</h3>
                </div>

                {reminders.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-6">No reminders sent yet</p>
                ) : (
                  <div className="space-y-2">
                    {reminders.map((reminder, i) => (
                      <motion.div key={reminder.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                        className="flex items-center justify-between gap-3 py-2.5 border-b border-border/30 last:border-0">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            reminder.status === "sent" ? "bg-green-100 text-green-600" :
                            reminder.status === "failed" ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600"}`}>
                            {reminder.status === "sent" ? <CheckCircle className="w-3.5 h-3.5" /> :
                             reminder.status === "failed" ? <XCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{reminder.customer_name || "Customer"}</p>
                            <p className="text-[10px] text-muted-foreground">{reminder.amount_due ? formatPrice(reminder.amount_due) : ""} • {reminder.days_overdue}d overdue</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <Badge variant="outline" className={`text-[9px] ${
                            reminder.status === "sent" ? "text-green-600 border-green-200 bg-green-50" :
                            reminder.status === "failed" ? "text-red-600 border-red-200 bg-red-50" : "text-yellow-600 border-yellow-200 bg-yellow-50"}`}>
                            {reminder.status}
                          </Badge>
                          <p className="text-[9px] text-muted-foreground mt-1">{new Date(reminder.sent_at).toLocaleDateString()}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── ACTIVITY TAB ── */}
          {activeTab === "activity" && (
            <motion.div key="activity" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-green-600 font-medium">Today's Logins</p>
                  <p className="text-xl font-bold text-green-700">{todayLogins}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-blue-600 font-medium">Today's Signups</p>
                  <p className="text-xl font-bold text-blue-700">{todaySignups}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-red-600 font-medium">Failed Logins</p>
                  <p className="text-xl font-bold text-red-700">{failedLogins}</p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 rounded-xl" />
                </div>
                <Select value={activityFilter} onValueChange={setActivityFilter}>
                  <SelectTrigger className="w-full sm:w-44 rounded-xl">
                    <SelectValue placeholder="Filter by event" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    <SelectItem value="login">Logins</SelectItem>
                    <SelectItem value="login_failed">Failed Logins</SelectItem>
                    <SelectItem value="signup">Sign Ups</SelectItem>
                    <SelectItem value="signup_failed">Failed Signups</SelectItem>
                    <SelectItem value="logout">Logouts</SelectItem>
                    <SelectItem value="password_reset">Password Resets</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="text-xs text-muted-foreground mb-3">{filteredActivity.length} events</div>

              <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
                {filteredActivity.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <Activity className="w-10 h-10 mx-auto mb-2 text-border" />
                    <p>No activity logs yet</p>
                    <p className="text-xs mt-1">Logs will appear as users sign in and sign up</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {filteredActivity.map((log, i) => {
                      const config = activityConfig[log.event_type] || {
                        label: log.event_type.replace(/_/g, " "),
                        color: "bg-gray-100 text-gray-700 border-gray-200",
                        icon: Activity,
                      };
                      const Icon = config.icon;
                      const meta = log.metadata as Record<string, unknown>;
                      return (
                        <motion.div key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${config.color}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`text-[9px] border ${config.color}`}>{config.label}</Badge>
                              {log.email && <span className="text-xs text-foreground font-medium truncate">{log.email}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                              {meta?.provider && typeof meta.provider === "string" && (
                                <span className="text-[10px] text-muted-foreground">via {meta.provider}</span>
                              )}
                              {meta?.reason && typeof meta.reason === "string" && (
                                <span className="text-[10px] text-red-500 truncate max-w-[160px]">{meta.reason}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[9px] text-muted-foreground">
                              {new Date(log.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}
                            </p>
                            <p className="text-[9px] text-muted-foreground">
                              {new Date(log.created_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── SETTINGS TAB ── */}
          {activeTab === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="mb-6">
                <h2 className="text-xl font-display font-bold text-foreground">Settings</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage payment gateways and store configuration</p>
              </div>

              {/* Product Categories Card */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden mb-6">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 bg-secondary/20">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Tag className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Product Categories</p>
                    <p className="text-[11px] text-muted-foreground">Manage categories shown in the Add/Edit Product form</p>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={newCategoryInput}
                      onChange={e => setNewCategoryInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                      placeholder="e.g. Laptops, Speakers..."
                      className="rounded-xl flex-1"
                    />
                    <Button onClick={handleAddCategory} disabled={savingCategories || !newCategoryInput.trim()} className="bg-gradient-gold text-accent-foreground rounded-xl shadow-gold flex-shrink-0">
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dynamicCategories.map(cat => (
                      <span key={cat} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary rounded-full text-xs font-medium text-foreground">
                        {cat}
                        <button onClick={() => handleRemoveCategory(cat)} className="w-4 h-4 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive transition-colors">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* KoraPay Gateway Card */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden mb-6">
                {/* Card Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-secondary/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">KoraPay</p>
                      <p className="text-[11px] text-muted-foreground">Payment gateway · Nigeria</p>
                    </div>
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={handleToggleKora}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                      koraSettings.enabled
                        ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    }`}
                  >
                    {koraSettings.enabled
                      ? <><ToggleRight className="w-4 h-4" /> Active</>
                      : <><ToggleLeft className="w-4 h-4" /> Disabled</>
                    }
                  </button>
                </div>

                {/* Status banner */}
                {!koraSettings.enabled && (
                  <div className="flex items-center gap-2 px-5 py-3 bg-red-50 border-b border-red-100">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-600">Payment gateway is disabled. Customers cannot make payments.</p>
                  </div>
                )}
                {koraSettings.enabled && (
                  <div className="flex items-center gap-2 px-5 py-3 bg-green-50 border-b border-green-100">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <p className="text-xs text-green-600">Payment gateway is active. Customers can pay via KoraPay.</p>
                  </div>
                )}

                {/* Form fields */}
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      <Key className="w-3 h-3 inline mr-1" />Public Key
                    </label>
                    <Input
                      value={koraPublicKeyInput}
                      onChange={e => setKoraPublicKeyInput(e.target.value)}
                      placeholder="pk_live_... or pk_test_..."
                      className="rounded-xl font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Used on the client side to initialize payments</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      <Shield className="w-3 h-3 inline mr-1" />Secret Key
                    </label>
                    <div className="relative">
                      <Input
                        type={showKoraSecret ? "text" : "password"}
                        value={koraSecretKeyInput}
                        onChange={e => setKoraSecretKeyInput(e.target.value)}
                        placeholder="sk_live_... or sk_test_..."
                        className="rounded-xl font-mono text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKoraSecret(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKoraSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Used by the server to verify and process payments. Never share this key.</p>
                  </div>

                  {koraSettings.updated_at && (
                    <p className="text-[10px] text-muted-foreground">
                      Last updated: {new Date(koraSettings.updated_at).toLocaleString()}
                    </p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={handleSaveKoraSettings}
                      disabled={savingKora}
                      className="flex-1 rounded-xl bg-gradient-gold text-accent-foreground shadow-gold"
                    >
                      {savingKora ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Keys"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { setKoraPublicKeyInput(koraSettings.public_key); setKoraSecretKeyInput(koraSettings.secret_key); }}
                      className="rounded-xl"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </div>

              {/* WhatsApp Contact Card */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden mb-6">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 bg-secondary/20">
                  <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#25D366" className="w-5 h-5">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">WhatsApp Contact</p>
                    <p className="text-[11px] text-muted-foreground">Floating button on landing page</p>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      <Phone className="w-3 h-3 inline mr-1" />WhatsApp Number (with country code)
                    </label>
                    <Input
                      value={whatsappInput}
                      onChange={e => setWhatsappInput(e.target.value)}
                      placeholder="e.g. 2348012345678"
                      className="rounded-xl text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Include country code without + or spaces. Example: 2348012345678 for a Nigerian number.
                      Leave empty to hide the button.
                    </p>
                  </div>
                  <Button
                    onClick={handleSaveWhatsapp}
                    disabled={savingWhatsapp}
                    className="w-full rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white shadow-sm"
                  >
                    {savingWhatsapp ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save WhatsApp Number"}
                  </Button>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Security Notice</p>
                    <p className="text-[11px] text-amber-700 mt-1">
                      Your secret key is stored securely and is only accessible to the server. Use test keys during development and switch to live keys when you are ready to accept real payments.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminDashboard;
