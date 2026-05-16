import { HeroSection } from "@/components/hero-section";
import { AboutSection } from "@/components/about-section";
import { SpecialtiesSection } from "@/components/specialties-section";
import { ProceduresSection } from "@/components/procedures-section";
import { CtaSection } from "@/components/cta-section";
import { ContactSection } from "@/components/contact-section";

export default function Home() {
  return (
    <>
      <HeroSection />
      <AboutSection />
      <SpecialtiesSection />
      <ProceduresSection />
      <CtaSection />
      <ContactSection />
    </>
  );
}
