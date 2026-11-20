import { CheckCircleIcon, CircleIcon, CircleNotchIcon, MinusCircleIcon } from '@phosphor-icons/react';
import { ETAPES, type Etape, type SuiviEtape } from './etapes';

/** Les quatre étapes de l'entretien et où elles en sont (Figma : « Étapes de l'entretien »). */
export default function FriseEtapes({ suivi }: { suivi: Record<Etape, SuiviEtape> }) {
  return (
    <ol className="flex items-start gap-3">
      {ETAPES.map((e, i) => {
        const s = suivi[e.id];
        const [Icone, couleur] =
          s.etat === 'faite'
            ? [CheckCircleIcon, 'bg-status-ok-bg text-status-ok-fg']
            : s.etat === 'encours'
              ? [CircleNotchIcon, 'bg-brand-shield-fill text-action-primary-bg']
              : s.etat === 'ignoree'
                ? [MinusCircleIcon, 'bg-subtle text-muted']
                : [CircleIcon, 'bg-surface text-muted border'];
        return (
          <li key={e.id} className={`flex min-w-0 items-center gap-3 ${i < ETAPES.length - 1 ? 'flex-1' : ''}`}>
            <div className={`grid size-8 shrink-0 place-items-center rounded-full ${couleur}`}>
              <Icone className={`size-5 ${s.etat === 'encours' ? 'animate-spin' : ''}`} />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className={`truncate text-corps-gras ${s.etat === 'ignoree' ? 'text-muted' : 'text-primary'}`}>{e.nom}</span>
              <span className="truncate text-legende text-secondary">{s.detail}</span>
            </div>
            {i < ETAPES.length - 1 && <div className="h-0.5 min-w-6 flex-1 rounded-full bg-piste" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
