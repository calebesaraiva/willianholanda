"use client";

import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import {
  Activity,
  Stethoscope,
  HeartPulse,
  Shield,
  Pill,
  Zap,
  ChevronRight,
} from "lucide-react";

const procedures = [
  {
    icon: Activity,
    title: "Bypass Gástrico",
    description:
      "Técnica que reduz o estômago e desvia parte do intestino, promovendo perda de peso significativa e controle de doenças metabólicas.",
    category: "Cirurgia Bariátrica",
  },
  {
    icon: HeartPulse,
    title: "Gastrectomia Vertical (Sleeve)",
    description:
      "Remoção de parte do estômago transformando-o em formato tubular, diminuindo a capacidade gástrica e o hormônio da fome.",
    category: "Cirurgia Bariátrica",
  },
  {
    icon: Stethoscope,
    title: "Endoscopia Digestiva Alta",
    description:
      "Exame que permite visualizar esôfago, estômago e duodeno para diagnóstico de gastrites, úlceras, refluxo e outras condições.",
    category: "Endoscopia",
  },
  {
    icon: Shield,
    title: "Colonoscopia",
    description:
      "Exame essencial para prevenção do câncer de intestino, permitindo visualização e remoção de pólipos precursores.",
    category: "Endoscopia",
  },
  {
    icon: Pill,
    title: "Cirurgia de Vesícula",
    description:
      "Remoção da vesícula biliar por videolaparoscopia para tratamento de cálculos (pedras na vesícula).",
    category: "Cirurgia Digestiva",
  },
  {
    icon: Zap,
    title: "Hernioplastia",
    description:
      "Correção cirúrgica de hérnias abdominais (inguinal, umbilical, incisional) com técnicas minimamente invasivas.",
    category: "Cirurgia Geral",
  },
];

const categoryColors: Record<string, string> = {
  "Cirurgia Bariátrica": "bg-cyan-100 text-cyan-700",
  Endoscopia: "bg-teal-100 text-teal-700",
  "Cirurgia Digestiva": "bg-emerald-100 text-emerald-700",
  "Cirurgia Geral": "bg-blue-100 text-blue-700",
};

export function ProceduresSection() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  return (
    <section id="procedimentos" className="py-24 bg-slate-900">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-cyan-400 font-semibold text-sm uppercase tracking-wider">
            O que tratamos
          </span>
          <h2 className="text-4xl font-bold text-white mt-2 mb-4">
            Principais <span className="text-cyan-400">Procedimentos</span>
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Conheça os procedimentos realizados pelo Dr. Willian Holanda com excelência e segurança.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {procedures?.map((procedure, index) => (
            <motion.div
              key={procedure?.title}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 hover:bg-slate-800 transition-all duration-300 border border-slate-700/50 hover:border-cyan-500/30"
            >
              <div className="flex items-start gap-4">
                {procedure?.icon && (
                  <div className="p-3 bg-cyan-500/10 rounded-lg group-hover:bg-cyan-500/20 transition-colors">
                    <procedure.icon className="w-6 h-6 text-cyan-400" />
                  </div>
                )}
                <div className="flex-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${
                      categoryColors?.[procedure?.category ?? ""] ?? "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {procedure?.category}
                  </span>
                  <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                    {procedure?.title}
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    {procedure?.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center mt-12"
        >
          <a
            href="https://wa.me/5599985246191?text=Ol%C3%A1%2C%20tudo%20bem%3F%20Quero%20agendar%20uma%20consulta%20com%20o%20Dr.%20William%20Holanda."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-8 py-4 rounded-full font-semibold transition-all hover:scale-105 shadow-lg shadow-cyan-500/30"
          >
            Agende sua Avaliação
            <ChevronRight size={20} />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
