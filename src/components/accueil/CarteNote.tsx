import { useState } from 'react';
import type { MaintenanceScore } from '../../types/commands';
import { depuis } from '../../lib/format';
import Bouton from '../ui/Bouton';
import Carte from '../ui/Carte';
import Pastille from '../ui/Pastille';
import { PARTS_NOTE } from '../entretien/note';

interface CarteNoteProps {
  /** Dernière note, ou `null` si l'entretien n'a jamais été lancé. */
  note: MaintenanceScore | null;
  onLancer: () => void;
}

const ETATS = {
  ok: { libelle: 'Bon état', trait: 'stroke-status-ok-fg' },
  surveiller: { libelle: 'À surveiller', trait: 'stroke-status-warning-fg' },
  corriger: { libelle: 'Critique', trait: 'stroke-status-danger-fg' },
};

const R = 70;
const CIRCONFERENCE = 2 * Math.PI * R;

/** Grande carte de l'Accueil : note sur 100 et entretien complet (Figma : « Accueil – Critique » / « Jamais analysé »). */
export default function CarteNote({ note, onLancer }: CarteNoteProps) {
  const [detail, setDetail] = useState(false);

  if (!note) {
    return (
      <Carte className="flex flex-col items-start gap-4 p-8">
        <Pastille statut="info" />
        <h2 className="text-titre-2 text-primary">Faisons le point sur votre PC</h2>
        <p className="text-corps text-secondary">
          Kernshine regarde l'état de votre ordinateur, puis vous propose ce qu'il y a à nettoyer et à mettre à jour. Cela prend quelques minutes, et rien
          n'est supprimé sans votre accord.
        </p>
        <Bouton onClick={onLancer} className="self-end">Analyser mon PC</Bouton>
      </Carte>
    );
  }

  const e = ETATS[note.state];
  return (
    <Carte className="flex flex-wrap items-center gap-10 p-8">
      <div className="relative grid size-[180px] shrink-0 place-items-center">
        <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="80" cy="80" r={R} fill="none" strokeWidth="14" className="stroke-piste" />
          <circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            strokeWidth="14"
            strokeDasharray={CIRCONFERENCE}
            strokeDashoffset={CIRCONFERENCE * (1 - note.value / 100)}
            className={e.trait}
          />
        </svg>
        <div className="flex flex-col items-center">
          <span className="font-titre text-titre-2 text-primary">{e.libelle}</span>
          <span className="text-corps text-secondary">{note.value}/100</span>
        </div>
      </div>

      <div className="flex min-w-[280px] flex-1 flex-col gap-3">
        <h2 className="text-titre-2 text-primary">Entretien complet de votre PC</h2>
        <p className="text-corps text-secondary">
          Kernshine analyse votre PC, puis nettoie les fichiers inutiles, met à jour vos pilotes et vos programmes. Vous validez avant toute suppression.
        </p>
        <p className="text-corps-petit text-secondary">
          Note de la dernière analyse, {depuis(note.date * 1000)}.{' '}
          <button
            type="button"
            onClick={() => setDetail(!detail)}
            aria-expanded={detail}
            className="rounded-sm underline underline-offset-2 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-action-primary-bg"
          >
            {detail ? 'Masquer le détail' : 'Comment est-elle calculée ?'}
          </button>
        </p>
        {detail && (
          <dl className="flex flex-col gap-2 rounded-lg bg-subtle px-4 py-3">
            {note.parts.map((p) => (
              <div key={p.id} className="flex flex-col">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-corps-gras text-primary">{PARTS_NOTE[p.id].nom}</dt>
                  <dd className="text-corps-gras text-primary">
                    {p.points}/{p.max}
                  </dd>
                </div>
                <p className="text-corps-petit text-secondary">{PARTS_NOTE[p.id].explication}</p>
              </div>
            ))}
          </dl>
        )}
        <Bouton onClick={onLancer} className="self-end">Lancer l'entretien</Bouton>
      </div>
    </Carte>
  );
}
