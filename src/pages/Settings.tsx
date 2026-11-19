import { useEffect, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, FilesIcon, GithubLogoIcon, LightningIcon, ScalesIcon, WarningIcon } from '@phosphor-icons/react';
import type { Ack, SettingsInfo } from '../types/commands';
import { usePrefs } from '../hooks/usePrefs';
import Bandeau from '../components/ui/Bandeau';
import EnTetePage from '../components/ui/EnTetePage';
import Interrupteur from '../components/ui/Interrupteur';
import CarteTheme from '../components/parametres/CarteTheme';
import LigneReglage from '../components/parametres/LigneReglage';
import LigneVersion from '../components/parametres/LigneVersion';

function Section({ titre, description, children }: { titre: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-titre-3 text-primary">{titre}</h2>
        {description && <p className="text-corps-petit text-secondary">{description}</p>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * Paramètres (Figma : « Paramètres »). Entretien et Langue arriveront avec leurs fonctions
 * (#58) ; le thème sombre avec l'Accueil refait (#54).
 */
export default function Settings() {
  const { prefs, pret, changer, erreur } = usePrefs();
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [lancementEnCours, setLancementEnCours] = useState(false);
  const [erreurLancement, setErreurLancement] = useState<string | null>(null);
  const [erreurLien, setErreurLien] = useState<string | null>(null);

  useEffect(() => {
    invoke<SettingsInfo>('settings_get_info').then(setInfo).catch(() => {});
  }, []);

  const lancerAvecWindows = async (actif: boolean) => {
    if (!info) return;
    setLancementEnCours(true);
    setInfo({ ...info, openAtLogin: actif });
    try {
      await invoke<Ack>('settings_set_login_item', { openAtLogin: actif });
      setErreurLancement(null);
    } catch {
      setInfo({ ...info, openAtLogin: !actif });
      setErreurLancement("Le réglage n'a pas pu être changé. Réessayez.");
    }
    setLancementEnCours(false);
  };

  const ouvrir = (nom: 'source' | 'probleme' | 'licence') =>
    invoke('settings_open_link', { name: nom })
      .then(() => setErreurLien(null))
      .catch((e) => setErreurLien(typeof e === 'string' ? e : "Le lien n'a pas pu s'ouvrir. Réessayez."));

  return (
    <section className="flex flex-col gap-8">
      <EnTetePage titre="Paramètres" sousTitre="Réglez Kernshine à votre façon." />

      {(erreur || erreurLancement) && <Bandeau type="corriger">{erreur ?? erreurLancement}</Bandeau>}

      <Section titre="Apparence" description="Choisissez l'aspect de Kernshine. Le thème sombre arrive bientôt.">
        <div role="radiogroup" aria-label="Thème" className="flex flex-wrap gap-6">
          <CarteTheme theme="clair" choisi onChoisir={() => {}} />
          <CarteTheme theme="sombre" choisi={false} bientot onChoisir={() => {}} />
          <CarteTheme theme="automatique" choisi={false} bientot onChoisir={() => {}} />
        </div>
      </Section>

      <Section titre="Démarrage" description="Kernshine peut s'ouvrir tout seul quand vous allumez votre PC.">
        <LigneReglage
          icone={LightningIcon}
          titre="Lancer Kernshine avec Windows"
          description="Kernshine s'ouvre quand vous ouvrez votre session, prêt à surveiller votre PC."
        >
          <Interrupteur
            active={info?.openAtLogin ?? false}
            onChange={lancerAvecWindows}
            libelle="Lancer Kernshine avec Windows"
            disabled={!info || lancementEnCours}
          />
        </LigneReglage>
      </Section>

      <Section titre="Sécurité" description="Un filet de sécurité avant les changements importants.">
        <LigneReglage
          icone={ArrowCounterClockwiseIcon}
          titre="Point de restauration avant les pilotes"
          description="Si une mise à jour de pilote pose problème, vous pourrez revenir en arrière. Nous vous conseillons de le laisser activé."
        >
          <Interrupteur
            active={prefs.restoreBeforeDrivers}
            onChange={(a) => changer({ restoreBeforeDrivers: a })}
            libelle="Point de restauration avant les pilotes"
            disabled={!pret}
          />
        </LigneReglage>
      </Section>

      <Section titre="Gros fichiers">
        <LigneReglage icone={FilesIcon} titre="Taille minimale" description="Kernshine ne cherche que les fichiers plus lourds que cette taille.">
          <div role="radiogroup" aria-label="Taille minimale" className="flex flex-wrap gap-2">
            {[100, 500, 1024, 5120].map((mo) => (
              <button
                key={mo}
                type="button"
                role="radio"
                aria-checked={prefs.largeFileMinMb === mo}
                disabled={!pret}
                onClick={() => changer({ largeFileMinMb: mo })}
                className={`rounded-full px-4 py-2 text-libelle transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-bg ${
                  prefs.largeFileMinMb === mo ? 'bg-action-primary-bg text-action-primary-fg' : 'border bg-surface text-primary hover:bg-subtle'
                }`}
              >
                {mo >= 1024 ? `${mo / 1024} Go` : `${mo} Mo`}
              </button>
            ))}
          </div>
        </LigneReglage>
      </Section>

      <Section titre="Mises à jour">
        <LigneReglage
          icone={ArrowsClockwiseIcon}
          titre="Mises à jour automatiques"
          description="Kernshine installe lui-même ses nouvelles versions au démarrage, puis redémarre."
        >
          <Interrupteur
            active={prefs.autoUpdate}
            onChange={(a) => changer({ autoUpdate: a })}
            libelle="Mises à jour automatiques"
            disabled={!pret}
          />
        </LigneReglage>
        {info && <LigneVersion version={info.version} />}
      </Section>

      <Section titre="À propos" description="Kernshine est un logiciel libre et gratuit, fait pour entretenir simplement votre ordinateur.">
        <LigneReglage icone={GithubLogoIcon} titre="Code source sur GitHub" description="Consultez le projet, proposez des idées ou une amélioration." onClick={() => ouvrir('source')} />
        <LigneReglage icone={WarningIcon} titre="Signaler un problème" description="Dites-nous ce qui ne fonctionne pas, nous le corrigerons." onClick={() => ouvrir('probleme')} />
        <LigneReglage icone={ScalesIcon} titre="Licence et crédits" description="Les conditions d'utilisation et les projets sur lesquels Kernshine s'appuie." onClick={() => ouvrir('licence')} />
        {erreurLien && <Bandeau type="corriger">{erreurLien}</Bandeau>}
      </Section>
    </section>
  );
}
