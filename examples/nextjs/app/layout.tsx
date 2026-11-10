import type { ReactNode } from "react";

export const metadata = { title: "kiln + Next.js" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body css={{ margin: 0, fontFamily: "system-ui", background: "#f6f8fa", color: "#1f2328" }}>{children}</body>
    </html>
  );
}
