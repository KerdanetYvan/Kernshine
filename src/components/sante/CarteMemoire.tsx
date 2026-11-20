import { MemoryIcon } from '@phosphor-icons/react';
import type { MemoryTest, SystemInfo } from '../../types/commands';
import AnneauSante from './AnneauSante';
import CarteSante from './CarteSante';
import LigneDonnee from './LigneDonnee';
import type { Evaluation } from './evaluation';

const go = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;

/** Courbe de la mémoire utilisée sur la dernière minute (échantillons de `system_get_info`). */
function Courbe({ info }: { info: SystemInfo }) {
  const points = info.statsHistory.map((p) => 1 - p.freeMemoryGB / info.memoryGB);
  if (points.length < 2) return null;
  const x = (i: number) => (i / (points.length - 1)) * 1000;
  const y = (v: number) => 64 - Math.max(0, Math.min(1, v)) * 60;
  const ligne = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox="0 0 1000 64" preserveAspectRatio="none" className="h-16 w-full" aria-hidden>
        <path d={`${ligne} L 1000 64 L 0 64 Z`} className="fill-brand-shield-fill" />
        <path d={ligne} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className="stroke-action-primary-bg" />
      </svg>
      <p className="text-legende text-secondary">Dernière minute</p>
    </div>
  );
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

interface CarteMemoireProps {
  info: SystemInfo;
  test: MemoryTest | null;
  evaluation: Evaluation;
}

/** Mémoire : utilisation, dernier test de Windows s'il existe, dernière minute (Figma : « Carte – Mémoire »). */
export default function CarteMemoire({ info, test, evaluation }: CarteMemoireProps) {
  const utilisee = info.memoryGB - info.freeMemoryGB;
  const part = info.memoryGB > 0 ? (utilisee / info.memoryGB) * 100 : 0;
  const date = test ? new Date(test.date * 1000) : null;
  return (
    <CarteSante icone={MemoryIcon} titre="Mémoire" statut={evaluation.statut} etat={evaluation.etat} conseil={evaluation.conseil} className="lg:col-span-2">
      <div className="flex items-center gap-6">
        <AnneauSante valeur={part} libelle="utilisée" statut={part >= 90 ? 'surveiller' : 'ok'} />
        <dl className="flex min-w-0 flex-1 flex-col gap-2">
          <LigneDonnee libelle="Utilisée">{go(utilisee)}</LigneDonnee>
          <LigneDonnee libelle="Libre">{go(info.freeMemoryGB)}</LigneDonnee>
          {test && date && (
            <LigneDonnee libelle={`Dernier test de la mémoire (${MOIS[date.getMonth()]} ${date.getFullYear()})`}>
              {test.errors ? 'Erreurs trouvées' : 'Aucune erreur'}
            </LigneDonnee>
          )}
        </dl>
      </div>
      <Courbe info={info} />
    </CarteSante>
  );
}
