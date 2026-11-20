import { ThermometerIcon } from '@phosphor-icons/react';
import type { GpuTemperature } from '../../types/commands';
import CarteSante from './CarteSante';
import { GPU_CHAUD, type Evaluation } from './evaluation';

/** Demi-cercle : 0 à 100 °C. */
const R = 90;
const LONGUEUR = Math.PI * R;

function Jauge({ gpu, plusieurs }: { gpu: GpuTemperature; plusieurs: boolean }) {
  const part = Math.max(0, Math.min(100, gpu.celsius)) / 100;
  const chaud = gpu.celsius >= GPU_CHAUD;
  return (
    <div className="flex w-[220px] flex-col items-center">
      <svg viewBox="0 0 220 120" className="w-full" aria-hidden>
        <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none" strokeWidth="18" className="stroke-piste" />
        <path
          d="M 20 110 A 90 90 0 0 1 200 110"
          fill="none"
          strokeWidth="18"
          strokeDasharray={LONGUEUR}
          strokeDashoffset={LONGUEUR * (1 - part)}
          className={chaud ? 'stroke-status-warning-fg' : 'stroke-status-ok-fg'}
        />
      </svg>
      <p className="-mt-14 font-titre text-chiffre text-primary">{gpu.celsius} °C</p>
      <p className="text-legende text-secondary" title={gpu.name}>{plusieurs ? gpu.name : 'Carte graphique'}</p>
    </div>
  );
}

/**
 * Température des cartes graphiques, relue en direct tant que la page est ouverte
 * (Figma : « Carte – Température »). Celle du processeur n'est pas lisible (issue #67).
 */
export default function CarteTemperature({ gpus, evaluation }: { gpus: GpuTemperature[]; evaluation: Evaluation }) {
  return (
    <CarteSante icone={ThermometerIcon} titre="Température" statut={evaluation.statut} etat={evaluation.etat} conseil={evaluation.conseil}>
      <div className="flex flex-wrap justify-center gap-6">
        {gpus.map((g) => (
          <Jauge key={g.name} gpu={g} plusieurs={gpus.length > 1} />
        ))}
      </div>
      <p className="text-legende text-secondary">Mesurée en direct, pendant que la page est ouverte</p>
    </CarteSante>
  );
}
