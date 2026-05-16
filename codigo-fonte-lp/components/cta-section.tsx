"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { Phone, MessageCircle } from "lucide-react";

export function CtaSection() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/IMG_4275.webp"
          alt="Consultório Dr. Willian Holanda"
          fill
          className="object-cover object-[center_25%]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-900/95 to-teal-900/90" />
      </div>

      <div ref={ref} className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Dê o primeiro passo para uma{" "}
            <span className="text-cyan-300">nova vida</span>
          </h2>
          <p className="text-xl text-cyan-100 mb-10 max-w-2xl mx-auto">
            Agende sua consulta e conheça as opções de tratamento mais adequadas para o seu caso. Estamos prontos para ajudá-lo.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://wa.me/5599985246191?text=Ol%C3%A1%2C%20tudo%20bem%3F%20Quero%20agendar%20uma%20consulta%20com%20o%20Dr.%20William%20Holanda."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-cyan-700 px-8 py-4 rounded-full font-semibold text-lg transition-all hover:scale-105 shadow-xl"
            >
              <MessageCircle size={24} />
              WhatsApp
            </a>
            <a
              href="tel:+5599985246191"
              className="inline-flex items-center justify-center gap-3 bg-cyan-500 hover:bg-cyan-600 text-white px-8 py-4 rounded-full font-semibold text-lg transition-all hover:scale-105 shadow-xl border-2 border-cyan-400"
            >
              <Phone size={24} />
              Ligar Agora
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
