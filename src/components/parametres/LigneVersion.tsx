import { useCallback, useEffect, useState } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import { ArrowsClockwiseIcon, InfoIcon } from '@phosphor-icons/react';
import type { SelfUpdateCheck, SelfUpdateEvent, SelfUpdateResult } from '../../types/commands';
import Bouton from '../ui/Bouton';
import Pastille from '../ui/Pastille';
import LigneReglage from './LigneReglage';

type Etat =
  | { kind: 'verification' }
  | { kind: 'aJour' }
  | { kind: 'disponible'; check: SelfUpdateCheck }
  | { kind: 'telechargement'; pourcent: number | null; check: SelfUpdateCheck }
  | { kind: 'installation'; check: SelfUpdateCheck }
  | { kind: 'erreur'; message: string };

/** Les notes viennent du CHANGELOG (Markdown) : on les affiche en texte simple. */
const notesSimples = (notes: string) =>
  notes
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^-\s+/, '• '))
    .join('\n')
    .trim();

/**
 * Version de Kernshine et sa mise à jour (Figma : ligne « Version de Kernshine »).
 * Rien ne s'installe sans le clic sur « Installer », sauf réglage des mises à jour automatiques.
 */
export default function LigneVersion({ version }: { version: string }) {
  const [etat, setEtat] = useState<Etat>({ kind: 'verification' });

  const verifier = useCallback(async () => {
    setEtat({ kind: 'verification' });
    try {
      const res = await invoke<SelfUpdateCheck>('selfupdate_check');
      if (!res.ok) setEtat({ kind: 'erreur', message: res.error ?? 'La vérification a échoué. Réessayez.' });
      else if (res.available) setEtat({ kind: 'disponible', check: res });
      else setEtat({ kind: 'aJour' });
    } catch {
      setEtat({ kind: 'erreur', message: 'La vérification a échoué. Réessayez.' });
    }
  }, []);

  useEffect(() => {
    verifier();
  }, [verifier]);

  const installer = async (check: SelfUpdateCheck) => {
    setEtat({ kind: 'telechargement', pourcent: null, check });
    const canal = new Channel<SelfUpdateEvent>();
    canal.onmessage = (e) => {
      if (e.step === 'downloading') {
        setEtat({ kind: 'telechargement', pourcent: e.total ? Math.min(100, Math.round((e.downloaded / e.total) * 100)) : null, check });
      } else {
        setEtat({ kind: 'installation', check });
      }
    };
    // Si tout va bien, l'installeur démarre et Kernshine se ferme avant la réponse.
    const res = await invoke<SelfUpdateResult>('selfupdate_install', { onEvent: canal }).catch(() => ({ ok: false, error: undefined }) as SelfUpdateResult);
    if (!res.ok) setEtat({ kind: 'erreur', message: res.error ?? "L'installation a échoué. Réessayez." });
  };

  const check = 'check' in etat ? etat.check : null;

  return (
    <div className="flex flex-col gap-3">
      <LigneReglage icone={InfoIcon} titre="Version de Kernshine" description="Logiciel libre et gratuit.">
        <span className="whitespace-nowrap text-libelle text-primary">{version}</span>
        {etat.kind === 'aJour' && <Pastille statut="ok">À jour</Pastille>}
        {(etat.kind === 'verification' || etat.kind === 'aJour' || etat.kind === 'erreur' || etat.kind === 'disponible') && (
          <Bouton
            variante="secondaire"
            taille="compact"
            onClick={verifier}
            disabled={etat.kind === 'verification'}
            title="Rechercher une nouvelle version de Kernshine"
            className="inline-flex items-center gap-2"
          >
            <ArrowsClockwiseIcon className={`size-4 ${etat.kind === 'verification' ? 'animate-spin' : ''}`} aria-hidden />
            {etat.kind === 'verification' ? 'Vérification…' : etat.kind === 'erreur' ? 'Réessayer' : 'Vérifier'}
          </Bouton>
        )}
        {check && <Pastille statut="info">Nouvelle version {check.version}</Pastille>}
        {etat.kind === 'disponible' && <Bouton taille="compact" onClick={() => installer(etat.check)}>Installer</Bouton>}
        {etat.kind === 'telechargement' && (
          <Bouton taille="compact" disabled>{etat.pourcent !== null ? `Téléchargement ${etat.pourcent} %` : 'Téléchargement…'}</Bouton>
        )}
        {etat.kind === 'installation' && <Bouton taille="compact" disabled>Installation…</Bouton>}
      </LigneReglage>

      {etat.kind === 'erreur' && <p className="px-4 text-corps-petit text-secondary">{etat.message}</p>}
      {check && (
        <div className="flex flex-col gap-2 rounded-lg bg-status-info-bg p-4">
          <p className="text-corps-gras text-primary">Nouveautés de la version {check.version}</p>
          {check.notes && <p className="max-h-40 overflow-auto whitespace-pre-line text-corps-petit text-secondary">{notesSimples(check.notes)}</p>}
          {check.needsPermission && (
            <p className="text-corps-petit text-secondary">Kernshine est installé pour tous les comptes : Windows va vous demander l'autorisation.</p>
          )}
          {etat.kind === 'installation' && <p className="text-corps-petit text-secondary">Kernshine va se fermer puis redémarrer tout seul.</p>}
        </div>
      )}
    </div>
  );
}
