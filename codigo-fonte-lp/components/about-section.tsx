"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { Scale, Search, Scissors, Activity } from "lucide-react";

const stats = [
  { icon: Scale, value: "100+", label: "Bariátricas" },
  { icon: Scissors, value: "700+", label: "Videolaparoscopias" },
  { icon: Search, value: "3.000+", label: "EDA e Colonoscopia" },
  { icon: Activity, value: "CRM 7829", label: "RQE 3972" },
];

export function AboutSection() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  return (
    <section id="sobre" className="py-24 bg-slate-50">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl">
              <Image
                src="/images/OK.webp"
                alt="Dr. Willian Holanda"
                fill
                className="object-cover object-[center_15%]"
              />
            </div>
            <div className="absolute -bottom-6 -right-6 bg-cyan-600 text-white p-6 rounded-2xl shadow-xl">
              <p className="text-3xl font-bold">Imperatriz-MA</p>
              <p className="text-cyan-100">Atendimento Especializado</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="text-cyan-600 font-semibold text-sm uppercase tracking-wider">
              Conheça o Profissional
            </span>
            <h2 className="text-4xl font-bold text-slate-800 mt-2 mb-6">
              Sobre o <span className="text-cyan-600">Dr. Willian</span>
            </h2>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>
                O Dr. Willian Holanda é médico especialista em <strong>Cirurgia Geral, Digestiva e Bariátrica</strong>, além de <strong>Endoscopia Digestiva</strong>. Com formação sólida e constante atualização, atua em Imperatriz-MA oferecendo tratamentos de excelência para doenças do aparelho digestivo.
              </p>
              <p>
                Sua abordagem é centrada no paciente, combinando tecnologia avançada com um atendimento humanizado e individualizado. Cada caso é tratado com atenção única, buscando sempre os melhores resultados para a saúde e qualidade de vida.
              </p>
              <p>
                Especializado em <strong>Cirurgia Bariátrica</strong>, o Dr. Willian auxilia pacientes na jornada de transformação de vida através de procedimentos como o Bypass Gástrico e a Gastrectomia Vertical (Sleeve).
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-10">
              {stats?.map((stat, index) => (
                <motion.div
                  key={stat?.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
                  className="bg-white p-4 rounded-xl shadow-md text-center hover:shadow-lg transition-shadow"
                >
                  {stat?.icon && (
                    <stat.icon className="w-6 h-6 text-cyan-600 mx-auto mb-2" />
                  )}
                  <p className="text-xl font-bold text-slate-800">
                    {stat?.value}
                  </p>
                  <p className="text-xs text-slate-500">{stat?.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
