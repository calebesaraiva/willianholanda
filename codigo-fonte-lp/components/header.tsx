"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Phone } from "lucide-react";

const navItems = [
  { name: "Início", href: "#inicio" },
  { name: "Sobre", href: "#sobre" },
  { name: "Especialidades", href: "#especialidades" },
  { name: "Procedimentos", href: "#procedimentos" },
  { name: "Contato", href: "#contato" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-white/95 backdrop-blur-md shadow-lg"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="#inicio" className="flex items-center gap-2">
            <span
              className={`text-xl font-bold transition-colors ${
                isScrolled ? "text-cyan-700" : "text-white"
              }`}
            >
              Dr. Willian Holanda
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {navItems?.map((item) => (
              <Link
                key={item?.name}
                href={item?.href ?? "#"}
                className={`text-sm font-medium transition-colors hover:text-cyan-500 ${
                  isScrolled ? "text-slate-700" : "text-white"
                }`}
              >
                {item?.name}
              </Link>
            ))}
            <a
              href="https://wa.me/5599985246191?text=Ol%C3%A1%2C%20tudo%20bem%3F%20Quero%20agendar%20uma%20consulta%20com%20o%20Dr.%20William%20Holanda."
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all hover:scale-105 shadow-lg"
            >
              <Phone size={16} />
              Agendar Consulta
            </a>
          </nav>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`lg:hidden p-2 rounded-lg ${
              isScrolled ? "text-slate-700" : "text-white"
            }`}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-white border-t shadow-xl"
          >
            <nav className="flex flex-col p-4 gap-2">
              {navItems?.map((item) => (
                <Link
                  key={item?.name}
                  href={item?.href ?? "#"}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-slate-700 hover:text-cyan-600 py-3 px-4 rounded-lg hover:bg-cyan-50 font-medium transition-colors"
                >
                  {item?.name}
                </Link>
              ))}
              <a
                href="https://wa.me/5599985246191?text=Ol%C3%A1%2C%20tudo%20bem%3F%20Quero%20agendar%20uma%20consulta%20com%20o%20Dr.%20William%20Holanda."
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white py-3 px-4 rounded-lg font-semibold mt-2"
              >
                <Phone size={18} />
                Agendar Consulta
              </a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
