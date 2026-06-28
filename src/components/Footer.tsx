import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Phone, Mail, MapPin } from "lucide-react";
import somisteamLogo from "@/assets/somisteam-logo.jpg";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const Footer = () => {
  return (
    <footer className="bg-navy text-white/70 overflow-hidden">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        className="container mx-auto px-4 lg:px-8 py-16"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          <motion.div variants={itemVariants}>
            <div className="flex items-center gap-2 mb-4">
              <img src={somisteamLogo} alt="Olas & Bs" className="h-10 w-auto object-contain" />
            </div>
            <p className="text-sm leading-relaxed">
              Your trusted electronics showroom for premium home appliances.
              Quality brands, flexible payments.
            </p>
          </motion.div>

          <motion.div variants={itemVariants}>
            <h4 className="font-display font-semibold text-white mb-4">Quick Links</h4>
            <div className="flex flex-col gap-2">
              {[
                { label: "Shop", path: "/shop" },
                { label: "Save to Buy", path: "/easybuy" },
                { label: "About", path: "/about" },
                { label: "Contact", path: "/contact" },
              ].map(({ label, path }) => (
                <Link key={path} to={path} className="text-sm hover:text-accent transition-colors hover:translate-x-1 inline-block transform duration-200">
                  {label}
                </Link>
              ))}
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <h4 className="font-display font-semibold text-white mb-4">Categories</h4>
            <div className="flex flex-col gap-2">
              {["Televisions", "Refrigerators", "Washing Machines", "Air Conditioners"].map((cat) => (
                <Link key={cat} to={`/shop?category=${encodeURIComponent(cat)}`} className="text-sm hover:text-accent transition-colors hover:translate-x-1 inline-block transform duration-200">
                  {cat}
                </Link>
              ))}
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <h4 className="font-display font-semibold text-white mb-4">Contact Us</h4>
            <div className="flex flex-col gap-3">
              {[
                { icon: Phone, text: "+234 800 olas-bs" },
                { icon: Mail, text: "info@olasbs.com" },
                { icon: MapPin, text: "Lagos, Nigeria" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm">
                  <Icon className="w-4 h-4 text-accent flex-shrink-0" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="border-t border-white/10 mt-12 pt-8 text-center text-sm origin-center"
        >
          <p>&copy; {new Date().getFullYear()} Olas & Bs NIG Ltd. All rights reserved.</p>
        </motion.div>
      </motion.div>
    </footer>
  );
};

export default Footer;
