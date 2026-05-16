"use client";

import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { MapPin, Phone, Instagram, Clock, MessageCircle } from "lucide-react";

const contactInfo = [
  {
    icon: MapPin,
    title: "Localização",
    content: "Imperatriz - MA",
    subtitle: "Maranhão, Brasil",
  },
  {
    icon: Phone,
    title: "Telefone",
    content: "(99) 98524-6191",
    subtitle: "Ligue ou envie mensagem",
    href: "tel:+5599985246191",
  },
  {
    icon: Instagram,
    title: "Instagram",
    content: "@drwillianholanda",
    subtitle: "Siga para dicas de saúde",
    href: "https://instagram.com/drwillianholanda",
  },
  {
    icon: Clock,
    title: "Horário",
    content: "Segunda a Sexta",
    subtitle: "Mediante agendamento",
  },
];

export function ContactSection() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  return (
    <section id="contato" className="py-24 bg-slate-50">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-cyan-600 font-semibold text-sm uppercase tracking-wider">
            Entre em Contato
          </span>
          <h2 className="text-4xl font-bold text-slate-800 mt-2 mb-4">
            Agende sua <span className="text-cyan-600">Consulta</span>
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Estamos à disposição para atendê-lo. Entre em contato e agende sua avaliação.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {contactInfo?.map((info, index) => (
            <motion.div
              key={info?.title}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              {info?.href ? (
                <a
                  href={info?.href}
                  target={info?.href?.startsWith("http") ? "_blank" : undefined}
                  rel={info?.href?.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="block bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-all hover:-translate-y-1 text-center h-full"
                >
                  {info?.icon && (
                    <div className="w-14 h-14 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <info.icon className="w-7 h-7 text-cyan-600" />
                    </div>
                  )}
                  <h3 className="font-semibold text-slate-800 mb-1">
                    {info?.title}
                  </h3>
                  <p className="text-cyan-600 font-medium">{info?.content}</p>
                  <p className="text-slate-500 text-sm mt-1">{info?.subtitle}</p>
                </a>
              ) : (
                <div className="bg-white p-6 rounded-xl shadow-md text-center h-full">
                  {info?.icon && (
                    <div className="w-14 h-14 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <info.icon className="w-7 h-7 text-cyan-600" />
                    </div>
                  )}
                  <h3 className="font-semibold text-slate-800 mb-1">
                    {info?.title}
                  </h3>
                  <p className="text-cyan-600 font-medium">{info?.content}</p>
                  <p className="text-slate-500 text-sm mt-1">{info?.subtitle}</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-gradient-to-r from-cyan-600 to-teal-600 rounded-2xl p-8 md:p-12 text-center shadow-xl"
        >
          <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Pronto para transformar sua vida?
          </h3>
          <p className="text-cyan-100 mb-8 max-w-xl mx-auto">
            Agende agora sua consulta pelo WhatsApp e dê o primeiro passo rumo a uma vida mais saudável.
          </p>
          <a
            href="https://wa.me/5599985246191?text=Ol%C3%A1%2C%20tudo%20bem%3F%20Quero%20agendar%20uma%20consulta%20com%20o%20Dr.%20William%20Holanda."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-cyan-700 px-10 py-4 rounded-full font-semibold text-lg transition-all hover:scale-105 shadow-lg"
          >
            <MessageCircle size={24} />
            Agendar pelo WhatsApp
          </a>
        </motion.div>
      </div>
    </section>
  );
}
