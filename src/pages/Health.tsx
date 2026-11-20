import { useRef, useState } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import type { GpuTemperature, HealthReport } from '../types/commands';
import { depuis } from '../lib/format';
import Bandeau from '../components/ui/Bandeau';
import Bouton from '../components/ui/Bouton';
import BoutonScan from '../components/ui/BoutonScan';
import EnTetePage from '../components/ui/EnTetePage';
import ProgressionCirculaire from '../components/ui/ProgressionCirculaire';
import ResultatsSante from '../components/sante/ResultatsSante';
import { memoireSante } from '../components/sante/memoire';

type Phase = 'accueil' | 'verification' | 'resultats';

/** Page Santé : rien n'est lu avant le clic, puis les résultats restent en mémoire. */
export default function Health() {
  const [phase, setPhase] = useState<Phase>(memoireSante.rapport ? 'resultats' : 'accueil');
  const [erreur, setErreur] = useState<string | null>(null);
  const verification = useRef(0);

  const verifier = async () => {
    const numero = ++verification.current;
    setErreur(null);
    setPhase('verification');
    try {
      const [rapport, gpus] = await Promise.all([
        invoke<HealthReport>('health_check'),
        invoke<GpuTemperature[]>('health_gpu_temperature').catch(() => [] as GpuTemperature[]),
      ]);
      if (verification.current !== numero) return;
      memoireSante.rapport = rapport;
      memoireSante.gpus = gpus;
      memoireSante.quand = Date.now();
      setPhase('resultats');
    } catch (e) {
      if (verification.current !== numero) return;
      setErreur(typeof e === 'string' ? e : 'La vérification n\'a pas pu aboutir. Réessayez dans un instant.');
      setPhase(memoireSante.rapport ? 'resultats' : 'accueil');
    }
  };

  const annuler = () => {
    verification.current++;
    setPhase(memoireSante.rapport ? 'resultats' : 'accueil');
  };

  return (
    <section className="flex flex-col gap-8">
      <EnTetePage
        titre="Santé"
        sousTitre="L'état de votre matériel : disques, batterie, température et mémoire."
        actions={
          phase === 'resultats' && (
            <>
              <p className="whitespace-nowrap text-corps-petit text-secondary">Dernière vérification {depuis(memoireSante.quand)}</p>
              <Bouton variante="secondaire" taille="compact" onClick={verifier}>Vérifier maintenant</Bouton>
            </>
          )
        }
      />

      {erreur && <Bandeau type="corriger" onFermer={() => setErreur(null)}>{erreur}</Bandeau>}

      {phase === 'accueil' && (
        <div className="flex flex-col items-center gap-6 py-4 text-center">
          <BoutonScan libelle="Lancer la vérification" onClick={verifier} />
          <p className="text-corps text-secondary">Cela prend quelques secondes. Rien n'est modifié sur votre PC.</p>
        </div>
      )}

      {phase === 'verification' && (
        <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
          <ProgressionCirculaire libelle="Vérification en cours">
            <MagnifyingGlassIcon className="size-12 text-action-primary-bg" />
          </ProgressionCirculaire>
          <div className="flex flex-col gap-1">
            <p className="font-titre text-titre-3 text-primary">Vérification de votre matériel…</p>
            <p className="text-corps text-secondary">Nous regardons l'état des disques, de la batterie, de la température et de la mémoire.</p>
          </div>
          <Bouton variante="secondaire" taille="compact" onClick={annuler}>Annuler</Bouton>
        </div>
      )}

      {phase === 'resultats' && memoireSante.rapport && <ResultatsSante />}
    </section>
  );
}
