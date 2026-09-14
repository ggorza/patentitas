import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Patentitas | Analítica de Patentamientos DNRPA',
  description: 'Explorador y estadísticas del parque automotor y patentamientos 0km en Argentina.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
