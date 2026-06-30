import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ShoppingBag, User, LayoutDashboard, Sun, Moon, Bell, Search } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import somisteamLogo from "@/assets/somisteam-logo.jpg";

const navLinks = [
  { label: "Home", path: "/" },
  { label: "Shop", path: "/shop" },
  { label: "Save to Buy", path: "/easybuy" },
  { label: "About", path: "/about" },
  { label: "Contact", path: "/contact" },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const { cartCount, setIsCartOpen } = useCart();
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user) return;
    let unsubscribe: (() => void) | undefined;
    import("@/services/notificationService").then(({ subscribeToUnreadCount }) => {
      unsubscribe = subscribeToUnreadCount(user.uid, setUnreadCount);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsOpen(false);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-border/30">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <Link to="/" className="flex items-center gap-2">
            <img
              src={somisteamLogo}
              alt="Olas & Bs NIG Ltd"
              className="h-10 lg:h-12 w-auto object-contain"
            />
          </Link>

          <div className="hidden lg:flex items-center gap-6 xl:gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`relative text-sm font-medium transition-colors duration-200 ${
                  location.pathname === link.path
                    ? "text-accent"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
                {location.pathname === link.path && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-gold rounded-full"
                  />
                )}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop Search */}
            <form onSubmit={handleSearch} className="hidden lg:flex relative items-center mr-2">
              <Search className="absolute left-3 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[200px] xl:w-[250px] bg-secondary/50 border-border/50 text-foreground dark:text-white placeholder:text-muted-foreground rounded-full h-9 focus-visible:ring-accent"
              />
            </form>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCartOpen(true)}
              className="relative text-muted-foreground hover:text-foreground mr-1"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Button>
            {user && (
              <Link to="/notifications">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative text-muted-foreground hover:text-foreground"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="text-muted-foreground hover:text-foreground"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
            {user ? (
              <>
                {isAdmin && (
                  <Link to="/admin">
                    <Button variant="ghost" size="icon" className="text-accent hover:text-accent">
                      <LayoutDashboard className="w-5 h-5" />
                    </Button>
                  </Link>
                )}
                <Link to="/dashboard">
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                    <User className="w-5 h-5" />
                  </Button>
                </Link>
              </>
            ) : (
              <Link to="/login">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  Sign In
                </Button>
              </Link>
            )}
            <button
              className="lg:hidden text-foreground"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden overflow-hidden bg-card border-t border-border"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
              <form onSubmit={handleSearch} className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full bg-secondary/50 border-border/50 text-foreground dark:text-white placeholder:text-muted-foreground rounded-xl h-10 focus-visible:ring-accent"
                />
              </form>
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === link.path
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {user ? (
                <>
                  <Link to="/dashboard" onClick={() => setIsOpen(false)} className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary">
                    Dashboard
                  </Link>
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setIsOpen(false)} className="px-4 py-3 rounded-lg text-sm font-medium text-accent hover:bg-accent/10">
                      Admin Panel
                    </Link>
                  )}
                </>
              ) : (
                <Link to="/login" onClick={() => setIsOpen(false)} className="px-4 py-3 rounded-lg text-sm font-medium text-accent hover:bg-accent/10">
                  Sign In
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
