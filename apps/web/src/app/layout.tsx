import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
//import Breadcrumbs from "@/components/Breadcrumbs";import Footer from "@/components/Footer";
import { ClerkProvider } from '@clerk/nextjs'; // ← ADD

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RFP Generator - AI-Powered Proposal Writing",
  description: "Generate professional proposals 10x faster with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider> {/* ← WRAP EVERYTHING */}
      <html lang="en">
        <body className={inter.className}>
          <Navigation />
          {/* <Breadcrumbs /> */}
          <main className="min-h-screen">{children}</main>
          {/* <Footer /> */}
        </body>
      </html>
    </ClerkProvider>
  );
}