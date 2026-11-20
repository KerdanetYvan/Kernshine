import { BatteryHighIcon } from '@phosphor-icons/react';
import type { BatteryHealth } from '../../types/commands';
import AnneauSante from './AnneauSante';
import BarreUsure from './BarreUsure';
import CarteSante from './CarteSante';
import LigneDonnee from './LigneDonnee';
import { usureBatterie, type Evaluation } from './evaluation';

/** « 47 Wh » (Windows donne des mWh). */
const wh = (mwh: number) => `${Math.round(mwh / 1000).toLocaleString('fr-FR')} Wh`;

/** Batterie d'un PC portable, d'après le rapport de Windows (Figma : « Carte – Batterie »). */
export default function CarteBatterie({ batterie: b, evaluation }: { batterie: BatteryHealth; evaluation: Evaluation }) {
  const capacite = Math.min(100, (b.fullMwh / b.designMwh) * 100);
  return (
    <CarteSante icone={BatteryHighIcon} titre="Batterie" statut={evaluation.statut} etat={evaluation.etat} conseil={evaluation.conseil}>
      <div className="flex items-center gap-6">
        <AnneauSante valeur={capacite} libelle="de la capacité" statut={evaluation.statut} />
        <dl className="flex min-w-0 flex-1 flex-col gap-2">
          <LigneDonnee libelle="Capacité d'origine">{wh(b.designMwh)}</LigneDonnee>
          <LigneDonnee libelle="Capacité actuelle">{wh(b.fullMwh)}</LigneDonnee>
          {b.cycles !== null && <LigneDonnee libelle="Cycles de charge">{b.cycles.toLocaleString('fr-FR')}</LigneDonnee>}
        </dl>
      </div>
      <BarreUsure libelle="Usure de la batterie" valeur={usureBatterie(b)} statut={evaluation.statut}>
        {usureBatterie(b)} %
      </BarreUsure>
    </CarteSante>
  );
}
