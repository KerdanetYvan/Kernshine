import type { HTMLAttributes } from 'react';

/** Carte blanche bordée, sans ombre, comme toutes celles du Figma. */
export default function Carte({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border bg-surface p-6 ${className}`} {...props} />;
}
