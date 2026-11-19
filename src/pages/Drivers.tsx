import { useState } from 'react';
import { CheckCircleIcon, CpuIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import type { DriverUpdate, InstallResult, UpdatesListResult } from '../types/commands';
import { formatOctets, pluriel } from '../lib/format';
import Bandeau from '../components/ui/Bandeau';
import Bouton from '../components/ui/Bouton';
import BoutonScan from '../components/ui/BoutonScan';
import Carte from '../components/ui/Carte';
import EnTetePage from '../components/ui/EnTetePage';
import ProgressionCirculaire from '../components/ui/ProgressionCirculaire';

type Phase = 'accueil' | 'recherche' | 'liste' | 'installation' | 'termine';

const MO = 1024 * 1024;

/**
 * Pilotes : version provisoire, qui reprend la fonction de l'ancienne page Mises à jour
 * avec les composants de la charte. La page des maquettes arrive avec #51.
 */
export default function Drivers() {
  const [phase, setPhase] = useState<Phase>('accueil');
  const [pilotes, setPilotes] = useState<DriverUpdate[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<InstallResult | null>(null);

  const rechercher = async () => {
    setPhase('recherche');
    setErreur(null);
    setResultat(null);
    try {
      const res = await invoke<UpdatesListResult<DriverUpdate>>('updates_get_drivers');
      setPilotes(res.data);
      setErreur(res.ok ? null : (res.error ?? 'La recherche a échoué. Réessayez dans un instant.'));
    } catch (e) {
      console.warn('pilotes', e);
      setErreur('La recherche a échoué. Réessayez dans un instant.');
    }
    setPhase('liste');
  };

  const installer = async () => {
    setPhase('installation');
    try {
      setResultat(await invoke<InstallResult>('updates_install_drivers'));
    } catch (e) {
      console.warn('pilotes', e);
      setResultat({ ok: false, installed: 0, errors: pilotes.length });
    }
    setPhase('termine');
  };

  const total = pilotes.reduce((s, p) => s + p.sizeMB, 0);

  return (
    <section className="flex flex-col gap-8">
      <EnTetePage titre="Pilotes" sousTitre="Gardez les composants de votre PC à jour pour un PC plus stable." />

      {phase === 'accueil' && (
        <div className="flex flex-col items-center gap-6 py-4 text-center">
          <BoutonScan libelle="Lancer la recherche" onClick={rechercher} />
          <p className="text-corps text-secondary">Kernshine demande à Windows les nouveaux pilotes. Rien n'est installé sans votre accord.</p>
        </div>
      )}

      {(phase === 'recherche' || phase === 'installation') && (
        <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
          <ProgressionCirculaire libelle={phase === 'recherche' ? 'Recherche des pilotes' : 'Installation des pilotes'}>
            {phase === 'recherche'
              ? <MagnifyingGlassIcon className="size-12 text-action-primary-bg" />
              : <CpuIcon weight="duotone" className="size-12 text-action-primary-bg" />}
          </ProgressionCirculaire>
          <p className="font-titre text-titre-3 text-primary">
            {phase === 'recherche' ? 'Recherche des pilotes…' : 'Installation des pilotes…'}
          </p>
          <p className="text-corps text-secondary">
            {phase === 'recherche'
              ? 'Cela peut prendre quelques secondes.'
              : "Windows peut vous demander l'autorisation : cliquez sur « Oui ». Ne fermez pas Kernshine."}
          </p>
        </div>
      )}

      {phase === 'liste' && erreur && (
        <Bandeau type="corriger" action={{ libelle: 'Réessayer', onClick: rechercher }}>{erreur}</Bandeau>
      )}

      {phase === 'liste' && !erreur && pilotes.length === 0 && (
        <Carte className="flex items-center gap-6 px-8">
          <div className="grid size-[72px] shrink-0 place-items-center rounded-full bg-status-ok-bg">
            <CheckCircleIcon className="size-10 text-status-ok-fg" />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <h2 className="text-titre-1 text-primary">Tout est à jour</h2>
            <p className="text-corps text-secondary">Windows ne propose aucun nouveau pilote pour le moment.</p>
          </div>
          <Bouton variante="secondaire" taille="compact" onClick={rechercher}>Vérifier à nouveau</Bouton>
        </Carte>
      )}

      {phase === 'liste' && !erreur && pilotes.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {pilotes.map((p, i) => (
              <li key={i} className="flex items-center gap-4 rounded-lg border bg-surface py-3 pl-3 pr-6">
                <div className="grid size-12 shrink-0 place-items-center rounded-md bg-subtle">
                  <CpuIcon weight="duotone" className="size-6 text-secondary" />
                </div>
                <p className="min-w-0 flex-1 text-corps-gras text-primary">{p.title}</p>
                <span className="whitespace-nowrap text-corps text-secondary">{formatOctets(p.sizeMB * MO)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-4">
            <p className="text-corps-petit text-secondary">
              {pilotes.length} {pluriel(pilotes.length, 'pilote')} · {formatOctets(total * MO)} au total
            </p>
            <Bouton onClick={installer}>Installer les pilotes</Bouton>
          </div>
        </>
      )}

      {phase === 'termine' && resultat && (
        <>
          <Bandeau type={resultat.ok ? 'ok' : 'surveiller'}>
            {resultat.ok
              ? 'Pilotes mis à jour. Redémarrez votre PC si Windows vous le demande.'
              : "Une partie des pilotes n'a pas pu être installée. Réessayez plus tard."}
          </Bandeau>
          <div className="flex justify-end">
            <Bouton variante="secondaire" onClick={rechercher}>Vérifier à nouveau</Bouton>
          </div>
        </>
      )}
    </section>
  );
}
