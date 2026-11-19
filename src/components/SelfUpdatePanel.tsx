import { useCallback, useEffect, useState } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import { ArrowsClockwiseIcon, CheckCircleIcon, DownloadSimpleIcon, InfoIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import type { SelfUpdateCheck, SelfUpdateEvent, SelfUpdateResult } from '../types/commands';

type State =
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; check: SelfUpdateCheck }
  | { kind: 'downloading'; percent: number | null; check: SelfUpdateCheck }
  | { kind: 'installing'; check: SelfUpdateCheck }
  | { kind: 'error'; message: string; check?: SelfUpdateCheck };

/** Les notes viennent du CHANGELOG (Markdown) : on les affiche en texte simple. */
function plainNotes(notes: string): string {
  return notes
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^-\s+/, '• '))
    .join('\n')
    .trim();
}

const bouton =
  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-libelle transition-opacity disabled:cursor-not-allowed disabled:opacity-50';

/** Mise à jour de Kernshine, dans la page Paramètres. */
export default function SelfUpdatePanel() {
  const [state, setState] = useState<State>({ kind: 'checking' });

  const check = useCallback(async () => {
    setState({ kind: 'checking' });
    const res = await invoke<SelfUpdateCheck>('selfupdate_check');
    if (!res.ok) setState({ kind: 'error', message: res.error ?? 'Une erreur est survenue, réessayez.' });
    else if (res.available) setState({ kind: 'available', check: res });
    else setState({ kind: 'upToDate' });
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const install = async (current: SelfUpdateCheck) => {
    setState({ kind: 'downloading', percent: null, check: current });
    const onEvent = new Channel<SelfUpdateEvent>();
    onEvent.onmessage = (e) => {
      if (e.step === 'downloading') {
        const percent = e.total ? Math.min(100, Math.round((e.downloaded / e.total) * 100)) : null;
        setState({ kind: 'downloading', percent, check: current });
      } else {
        setState({ kind: 'installing', check: current });
      }
    };
    // Si tout va bien, l'installeur démarre et Kernshine se ferme avant la réponse.
    const res = await invoke<SelfUpdateResult>('selfupdate_install', { onEvent });
    if (!res.ok) {
      setState({ kind: 'error', message: res.error ?? 'Une erreur est survenue, réessayez.', check: current });
    }
  };

  return (
    <div className="space-y-3">
      {state.kind === 'checking' && (
        <p className="flex items-center gap-2 text-corps-petit text-secondary">
          <ArrowsClockwiseIcon className="h-4 w-4 animate-spin" />
          Recherche d'une nouvelle version…
        </p>
      )}

      {state.kind === 'upToDate' && (
        <div className="flex items-center justify-between gap-6">
          <p className="flex items-center gap-2 text-corps-petit text-status-ok-fg">
            <CheckCircleIcon className="h-4 w-4" />
            Vous avez la dernière version de Kernshine.
          </p>
          <button onClick={check} className={`${bouton} border border-strong text-primary`}>
            Vérifier à nouveau
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex items-center justify-between gap-6">
          <p className="flex items-start gap-2 text-corps-petit text-secondary">
            <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {state.message}
          </p>
          <button onClick={check} className={`${bouton} border border-strong text-primary`}>
            Réessayer
          </button>
        </div>
      )}

      {(state.kind === 'available' || state.kind === 'downloading' || state.kind === 'installing') && (
        <div className="space-y-3 rounded-lg border bg-status-info-bg p-4">
          <p className="text-corps-gras text-status-info-fg">
            La version {state.check.version} de Kernshine est disponible.
          </p>
          {state.check.notes && (
            <p className="max-h-40 overflow-auto whitespace-pre-line text-corps-petit text-secondary">
              {plainNotes(state.check.notes)}
            </p>
          )}
          {state.check.needsPermission && (
            <p className="flex items-start gap-2 text-corps-petit text-secondary">
              <ShieldCheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              Kernshine est installé pour tous les utilisateurs : Windows va vous demander l'autorisation.
            </p>
          )}

          {state.kind === 'available' && (
            <button
              onClick={() => install(state.check)}
              className={`${bouton} bg-action-primary-bg text-action-primary-fg`}
            >
              <DownloadSimpleIcon className="h-4 w-4" />
              Installer la mise à jour
            </button>
          )}

          {state.kind === 'downloading' && (
            <div className="space-y-1">
              <p className="text-corps-petit text-secondary">
                Téléchargement{state.percent !== null ? ` : ${state.percent} %` : '…'}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-action-primary-bg transition-all"
                  style={{ width: `${state.percent ?? 10}%` }}
                />
              </div>
            </div>
          )}

          {state.kind === 'installing' && (
            <p className="text-corps-petit text-secondary">
              Installation… Kernshine va se fermer puis redémarrer tout seul.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
