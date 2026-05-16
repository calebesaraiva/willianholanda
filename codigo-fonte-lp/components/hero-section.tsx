"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Phone, Calendar, ChevronDown } from "lucide-react";

export function HeroSection() {
  return (
    <section
      id="inicio"
      className="relative min-h-screen flex items-center overflow-hidden"
    >
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/IMG_4275.webp"
          alt="Dr. Willian Holanda - Cirurgião Bariátrico"
          fill
          className="object-cover object-[center_25%]"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block bg-cyan-500/20 text-cyan-300 px-4 py-1.5 rounded-full text-sm font-medium mb-6 backdrop-blur-sm border border-cyan-400/30">
              Especialista em Cirurgia Bariátrica
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight"
          >
            Dr. Willian{" "}
            <span className="text-cyan-400">Holanda</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-slate-300 mb-4"
          >
            Cirurgia Geral, Digestiva e Bariátrica
            <br />
            Endoscopia Digestiva
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-slate-400 mb-8"
          >
            CRM-MA: 7829 | RQE: 3972
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <a
              href="https://wa.me/5599985246191?text=Ol%C3%A1%2C%20tudo%20bem%3F%20Quero%20agendar%20uma%20consulta%20com%20o%20Dr.%20William%20Holanda."
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-8 py-4 rounded-full font-semibold text-lg transition-all hover:scale-105 shadow-lg shadow-cyan-500/30"
            >
              <Phone size={20} />
              Agendar Consulta
            </a>
            <a
              href="tel:+5599985246191"
              className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-full font-semibold text-lg transition-all backdrop-blur-sm border border-white/20"
            >
              <Calendar size={20} />
              Ligar Agora
            </a>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <a
          href="#sobre"
          className="flex flex-col items-center text-white/60 hover:text-white transition-colors"
        >
          <span className="text-sm mb-2">Saiba mais</span>
          <ChevronDown className="animate-bounce" size={24} />
        </a>
      </motion.div>
    </section>
  );
}
