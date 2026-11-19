import { PackageIcon } from '@phosphor-icons/react';
import type { InstalledProgram } from '../../types/commands';
import { formatOctets } from '../../lib/format';
import CaseACocher from '../ui/CaseACocher';
import { detailProgramme } from './programmes';

interface LigneProgrammeProps {
  programme: InstalledProgram;
  coche: boolean;
  onCocher: (coche: boolean) => void;
}

/** Un programme installé (Figma : « Ligne de programme »). La taille n'apparaît que si elle est connue. */
export default function LigneProgramme({ programme: p, coche, onCocher }: LigneProgrammeProps) {
  const detail = detailProgramme(p);
  return (
    <li className="flex min-h-20 items-center gap-4 rounded-lg border bg-surface px-4 py-3">
      <CaseACocher etat={coche} onChange={onCocher} libelle={`Désinstaller ${p.name}`} />
      <div className="grid size-12 shrink-0 place-items-center rounded-md bg-subtle">
        <PackageIcon weight="duotone" className="size-6 text-secondary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-corps-gras text-primary">{p.name}</p>
        {detail && <p className="truncate text-corps-petit text-secondary">{detail}</p>}
      </div>
      {p.sizeBytes !== null ? (
        <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(p.sizeBytes)}</span>
      ) : (
        p.measuring && <span className="whitespace-nowrap text-corps-petit text-muted">Mesure…</span>
      )}
    </li>
  );
}
