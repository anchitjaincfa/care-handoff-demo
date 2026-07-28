import type { Metadata, Viewport } from "next"; import "./globals.css"; import { PRODUCT } from "@/product.config"; import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
export const metadata:Metadata={ title:`${PRODUCT.codename} — ${PRODUCT.tagline}`, description:PRODUCT.positioning, manifest:"/manifest.webmanifest" };
export const viewport:Viewport={ themeColor:"#fffbf6", colorScheme:"light dark" };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){ return <html lang="en"><body><ServiceWorkerRegistration/>{children}<footer>{PRODUCT.codenameDisclaimer}</footer></body></html>; }
