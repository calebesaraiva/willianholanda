import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { WhatsAppFloat } from "@/components/whatsapp-float";

const inter = Inter({ subsets: ["latin"] });
const siteUrl = String(
  process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_BASE_URL || ""
).trim();

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: "Dr. Willian Holanda | Cirurgião Bariátrico e Gastroenterologista em Imperatriz-MA",
  description:
    "Dr. Willian Holanda - Especialista em Cirurgia Bariátrica, Endoscopia Digestiva e Cirurgia Geral em Imperatriz-MA. Agende sua consulta.",
  keywords:
    "cirurgia bariátrica, gastroenterologista, endoscopia digestiva, cirurgião bariátrico, Imperatriz, Maranhão, Dr. Willian Holanda, bypass gástrico, sleeve",
  openGraph: {
    title: "Dr. Willian Holanda | Cirurgião Bariátrico e Gastroenterologista",
    description:
      "Especialista em Cirurgia Bariátrica, Endoscopia Digestiva e Cirurgia Geral em Imperatriz-MA.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="scroll-smooth">
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js"></script>
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <Header />
        <main>{children}</main>
        <Footer />
        <WhatsAppFloat />
      </body>
    </html>
  );
}
