"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { Scale, Search, Scissors, ArrowRight } from "lucide-react";

const specialties = [
  {
    icon: Scale,
    title: "Cirurgia Bariátrica",
    description:
      "Procedimentos como Bypass Gástrico e Sleeve para tratamento da obesidade grave e suas comorbidades. Uma nova vida começa aqui.",
    highlight: true,
    image: "/images/cirurgia3.webp",
    blurBottom: true,
    benefits: [
      "Perda de peso sustentada",
      "Controle do diabetes",
      "Melhora da qualidade de vida",
    ],
  },
  {
    icon: Search,
    title: "Endoscopia Digestiva",
    description:
      "Exames diagnósticos e terapêuticos como Endoscopia Alta e Colonoscopia para investigação de sintomas e prevenção de doenças.",
    highlight: false,
    image: "/images/cirurgia1.webp",
    blurBottom: false,
    benefits: [
      "Diagnóstico preciso",
      "Prevenção do câncer",
      "Procedimento minimamente invasivo",
    ],
  },
  {
    icon: Scissors,
    title: "Cirurgia Geral e Digestiva",
    description:
      "Tratamento cirúrgico de doenças da vesícula, hérnias, apendicite e outras condições do aparelho digestivo com técnicas minimamente invasivas.",
    highlight: false,
    image: "/images/cirurgia2.webp",
    blurBottom: false,
    benefits: [
      "Técnicas laparoscópicas",
      "Recuperação mais rápida",
      "Menor tempo de internação",
    ],
  },
];

export function SpecialtiesSection() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  return (
    <section id="especialidades" className="py-24 bg-white">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-cyan-600 font-semibold text-sm uppercase tracking-wider">
            Áreas de Atuação
          </span>
          <h2 className="text-4xl font-bold text-slate-800 mt-2 mb-4">
            Especialidades <span className="text-cyan-600">Médicas</span>
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Atendimento especializado com foco em resultados e na qualidade de vida dos pacientes.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {specialties?.map((specialty, index) => (
            <motion.div
              key={specialty?.title}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className={`group relative rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${
                specialty?.highlight
                  ? "ring-2 ring-cyan-500 ring-offset-4"
                  : ""
              }`}
            >
              <div className="relative h-56 overflow-hidden">
                <Image
                  src={specialty?.image ?? ""}
                  alt={specialty?.title ?? "Especialidade"}
                  fill
                  className="object-cover object-[center_30%] group-hover:scale-110 transition-transform duration-500"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent" />
                {specialty?.highlight && (
                  <span className="absolute top-4 right-4 bg-cyan-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                    Destaque
                  </span>
                )}
              </div>

              <div className="p-6 bg-white">
                <div className="flex items-center gap-3 mb-4">
                  {specialty?.icon && (
                    <div className="p-2 bg-cyan-100 rounded-lg">
                      <specialty.icon className="w-6 h-6 text-cyan-600" />
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-slate-800">
                    {specialty?.title}
                  </h3>
                </div>
                <p className="text-slate-600 text-sm mb-4 leading-relaxed">
                  {specialty?.description}
                </p>
                <ul className="space-y-2 mb-6">
                  {specialty?.benefits?.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                <a
                  href="https://wa.me/5599985246191?text=Ol%C3%A1%2C%20tudo%20bem%3F%20Quero%20agendar%20uma%20consulta%20com%20o%20Dr.%20William%20Holanda."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-cyan-600 font-semibold hover:text-cyan-700 transition-colors group/link"
                >
                  Saiba mais
                  <ArrowRight
                    size={16}
                    className="group-hover/link:translate-x-1 transition-transform"
                  />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
