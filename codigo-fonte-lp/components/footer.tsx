"use client";

import Link from "next/link";
import { Instagram, MapPin, Phone } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-3 gap-12">
          <div>
            <h3 className="text-xl font-bold mb-4">Dr. Willian Holanda</h3>
            <p className="text-slate-400 mb-4">
              Cirurgia Geral, Digestiva e Bariátrica
              <br />
              Endoscopia Digestiva
            </p>
            <p className="text-sm text-slate-500">
              CRM-MA: 7829 | RQE: 3972
            </p>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4">Navegação</h4>
            <nav className="flex flex-col gap-2">
              <Link
                href="#inicio"
                className="text-slate-400 hover:text-cyan-400 transition-colors"
              >
                Início
              </Link>
              <Link
                href="#sobre"
                className="text-slate-400 hover:text-cyan-400 transition-colors"
              >
                Sobre
              </Link>
              <Link
                href="#especialidades"
                className="text-slate-400 hover:text-cyan-400 transition-colors"
              >
                Especialidades
              </Link>
              <Link
                href="#procedimentos"
                className="text-slate-400 hover:text-cyan-400 transition-colors"
              >
                Procedimentos
              </Link>
              <Link
                href="#contato"
                className="text-slate-400 hover:text-cyan-400 transition-colors"
              >
                Contato
              </Link>
            </nav>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4">Contato</h4>
            <div className="space-y-3">
              <a
                href="tel:+5599985246191"
                className="flex items-center gap-3 text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <Phone size={18} />
                (99) 98524-6191
              </a>
              <a
                href="https://instagram.com/drwillianholanda"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <Instagram size={18} />
                @drwillianholanda
              </a>
              <div className="flex items-center gap-3 text-slate-400">
                <MapPin size={18} />
                Imperatriz - MA
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-12 pt-8 text-center">
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} Dr. Willian Holanda. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
