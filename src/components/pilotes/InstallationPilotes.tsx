import { CheckCircleIcon, CircleIcon, CircleNotchIcon, CpuIcon, WarningIcon } from '@phosphor-icons/react';
import type { Driver } from '../../types/commands';
import Bouton from '../ui/Bouton';
import ProgressionCirculaire from '../ui/ProgressionCirculaire';

/** État d'une étape : la sauvegarde de sécurité, puis chaque pilote. */
export type EtatEtape = 'attente' | 'en_cours' | 'ok' | 'echec' | 'arrete';

interface InstallationPilotesProps {
  pilotes: Driver[];
  sauvegarde: EtatEtape;
  etats: Map<string, EtatEtape>;
  /** Rien n'a encore commencé : Windows attend l'autorisation de l'utilisateur. */
  enAttenteAutorisation: boolean;
  arretDemande: boolean;
  onArreter: () => void;
}

const apparence: Record<EtatEtape, { Icone: typeof CheckCircleIcon; couleur: string; texte: string }> = {
  ok: { Icone: CheckCircleIcon, couleur: 'text-status-ok-fg', texte: 'Terminé' },
  echec: { Icone: WarningIcon, couleur: 'text-status-warning-fg', texte: 'À reprendre' },
  arrete: { Icone: CircleIcon, couleur: 'text-muted', texte: 'Arrêté' },
  en_cours: { Icone: CircleNotchIcon, couleur: 'animate-spin text-action-primary-bg', texte: 'En cours…' },
  attente: { Icone: CircleIcon, couleur: 'text-muted', texte: 'En attente' },
};

/** Installation des pilotes un par un (Figma : « Pilotes – En cours »). */
export default function InstallationPilotes({ pilotes, sauvegarde, etats, enAttenteAutorisation, arretDemande, onArreter }: InstallationPilotesProps) {
  const etapes = [{ id: 'sauvegarde', nom: 'Sauvegarde de sécurité', etat: sauvegarde }, ...pilotes.map((p) => ({ id: p.id, nom: p.name, etat: etats.get(p.id) ?? 'attente' }))];
  const faites = etapes.filter((e) => e.etat !== 'attente' && e.etat !== 'en_cours').length;
  const indexCourant = etapes.findIndex((e) => e.etat === 'en_cours');
  const courante = indexCourant >= 0 ? etapes[indexCourant] : undefined;

  const titre = enAttenteAutorisation
    ? "Windows vous demande l'autorisation"
    : courante?.id === 'sauvegarde'
      ? 'Création de la sauvegarde de sécurité…'
      : courante
        ? `Mise à jour : ${courante.nom}…`
        : arretDemande ? 'Arrêt en cours…' : 'Préparation…';

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-8 py-4" aria-live="polite">
      <ProgressionCirculaire valeur={(faites / etapes.length) * 100} libelle="Installation des pilotes">
        <CpuIcon weight="duotone" className="size-12 text-action-primary-bg" />
      </ProgressionCirculaire>

      <div className="flex w-full max-w-[400px] flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-titre text-titre-3 text-primary">{titre}</p>
          <p className="text-corps text-secondary">
            {enAttenteAutorisation
              ? 'Cliquez sur « Oui » pour créer la sauvegarde de sécurité et installer les pilotes.'
              : `${courante ? `Étape ${indexCourant + 1} sur ${etapes.length}. ` : ''}Un seul pilote à la fois, avec une sauvegarde de sécurité avant. L'écran peut clignoter un instant.`}
          </p>
        </div>

        <ul className="divide-y rounded-lg border bg-surface">
          {etapes.map((e) => {
            const { Icone, couleur, texte } = apparence[e.etat];
            return (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <Icone className={`size-5 shrink-0 ${couleur}`} />
                <span className={`min-w-0 flex-1 truncate ${e.etat === 'attente' || e.etat === 'arrete' ? 'text-corps text-secondary' : 'text-corps-gras text-primary'}`}>
                  {e.nom}
                </span>
                <span className={`text-legende ${e.etat === 'ok' ? 'text-status-ok-fg' : 'text-secondary'}`}>{texte}</span>
              </li>
            );
          })}
        </ul>

        <div>
          <Bouton variante="secondaire" taille="compact" onClick={onArreter} disabled={arretDemande || enAttenteAutorisation}>
            {arretDemande ? 'Arrêt après celui-ci…' : 'Arrêter'}
          </Bouton>
        </div>
      </div>
    </div>
  );
}
