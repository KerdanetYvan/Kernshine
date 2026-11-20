import { HardDriveIcon } from '@phosphor-icons/react';
import type { DiskHealth, DiskWear } from '../../types/commands';
import { etatDisque, formatOctets } from '../../lib/format';
import AnneauSante from './AnneauSante';
import BarreUsure from './BarreUsure';
import CarteSante from './CarteSante';
import LigneDonnee from './LigneDonnee';
import type { Evaluation } from './evaluation';

interface CarteDisqueProps {
  disque: DiskHealth;
  evaluation: Evaluation;
  /** Usure de ce disque, si elle a été lue. */
  usure?: DiskWear;
  /** L'usure a-t-elle déjà été lue (avec l'autorisation de l'utilisateur) ? */
  usureLue: boolean;
  lectureEnCours: boolean;
  onLireUsure: () => void;
}

const TYPES = { ssd: 'SSD', hdd: 'Disque dur' } as const;

/** Un disque : place, type, état donné par Windows et usure sur demande (Figma : « Carte – Disque »). */
export default function CarteDisque({ disque: d, evaluation, usure, usureLue, lectureEnCours, onLireUsure }: CarteDisqueProps) {
  const utilise = d.totalBytes - d.freeBytes;
  const part = d.totalBytes > 0 ? (utilise / d.totalBytes) * 100 : 0;
  const wear = usure?.wear ?? null;

  return (
    <CarteSante
      icone={HardDriveIcon}
      titre={`Disque ${d.letter}`}
      statut={evaluation.statut}
      etat={evaluation.etat}
      conseil={evaluation.conseil ?? (usureLue ? undefined : "Windows vous demandera l'autorisation.")}
    >
      <div className="flex items-center gap-6">
        <AnneauSante valeur={part} libelle="utilisé" statut={etatDisque(d.freeBytes, d.totalBytes)} />
        <dl className="flex min-w-0 flex-1 flex-col gap-2">
          <LigneDonnee libelle="Utilisé">{formatOctets(utilise)}</LigneDonnee>
          <LigneDonnee libelle="Libre">{formatOctets(d.freeBytes)}</LigneDonnee>
          {d.kind && <LigneDonnee libelle="Type">{TYPES[d.kind]}</LigneDonnee>}
          {usure?.celsius != null && <LigneDonnee libelle="Température">{usure.celsius} °C</LigneDonnee>}
        </dl>
      </div>
      <BarreUsure libelle="Usure du disque" valeur={wear ?? undefined} statut={evaluation.statut}>
        {wear !== null ? (
          `${wear} %`
        ) : usureLue ? (
          <span className="text-corps-petit text-secondary">Non communiquée par ce disque</span>
        ) : (
          <button
            type="button"
            onClick={onLireUsure}
            disabled={lectureEnCours}
            className="rounded-sm underline underline-offset-2 transition-colors hover:text-secondary disabled:no-underline disabled:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-action-primary-bg"
          >
            {lectureEnCours ? 'Lecture…' : "Voir l'usure"}
          </button>
        )}
      </BarreUsure>
    </CarteSante>
  );
}
