import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "REEBOT LAB — Tu PC, por fin entendible";
const description = "Compañero inteligente de rendimiento, diagnóstico y experimentos guiados para Windows";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const socialImage = new URL("/og.png", origin);

  return {
    title,
    description,
    metadataBase: new URL(origin),
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1736, height: 905, alt: "REEBOT LAB y REEBI, la compañera de tu PC" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [socialImage] },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
