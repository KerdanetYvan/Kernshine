import { useState } from 'react';
import { CpuIcon, FilesIcon, SquaresFourIcon, TrashIcon } from '@phosphor-icons/react';
import { formatOctets, pluriel } from '../../lib/format';
import Pastille from '../ui/Pastille';
import { ancienneteFichier, emplacement } from '../grosfichiers/fichiers';
import { CONSEIL_BLOQUEE, versions } from '../applications/versions';
import GroupeRecap from './GroupeRecap';
import LigneRecap from './LigneRecap';
import { basculer, etatGroupe, zonesUtiles, type Choix, type Trouve } from './donnees';

interface RecapitulatifProps {
  trouve: Trouve;
  choix: Choix;
  onChoix: (c: Choix) => void;
  /** Avec une sauvegarde de sécurité avant les pilotes (Paramètres). */
  sauvegarde: boolean;
  onMasquerAppli: (id: string) => void;
  onMasquerPilote: (cle: string) => void;
}

const LIEN = 'shrink-0 rounded-sm text-libelle text-secondary underline underline-offset-2 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-action-primary-bg';

/** Ce que l'analyse a trouvé, étape par étape, à cocher (Figma : « Entretien – Récapitulatif »). */
export default function Recapitulatif({ trouve: t, choix, onChoix, sauvegarde, onMasquerAppli, onMasquerPilote }: RecapitulatifProps) {
  const [replies, setReplies] = useState<Set<string>>(new Set(['grosfichiers']));
  const deplie = (id: string) => !replies.has(id);
  const replier = (id: string) => setReplies((r) => basculer(r, [id], !r.has(id)));
  const change = (champ: keyof Choix, ids: string[], coche: boolean) => onChoix({ ...choix, [champ]: basculer(choix[champ], ids, coche) });

  const zones = zonesUtiles(t.zones ?? []);
  const fichiers = t.fichiers ?? [];
  const applis = t.applis ?? [];
  const pilotes = t.pilotes ?? [];
  const taille = (ids: Set<string>, liste: { id: string; sizeBytes: number }[]) => liste.filter((x) => ids.has(x.id)).reduce((s, x) => s + x.sizeBytes, 0);

  return (
    <div className="flex flex-col gap-4">
      {t.zones && zones.length > 0 && (
        <GroupeRecap
          icone={TrashIcon}
          titre="Nettoyage"
          description="Fichiers inutiles de Windows, des navigateurs et des logiciels"
          total={formatOctets(taille(choix.zones, zones))}
          etat={etatGroupe(zones.map((z) => z.id), choix.zones)}
          onCocher={(c) => change('zones', zones.map((z) => z.id), c)}
          deplie={deplie('nettoyage')}
          onDeplier={() => replier('nettoyage')}
        >
          {zones.map((z) => (
            <LigneRecap
              key={z.id}
              titre={z.libelle}
              detail={z.description}
              coche={choix.zones.has(z.id)}
              onCocher={(c) => change('zones', [z.id], c)}
              fin={
                <>
                  <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(z.sizeBytes)}</span>
                  <Pastille statut={z.risque === 'sans_risque' ? 'ok' : 'surveiller'}>{z.risque === 'sans_risque' ? 'Sans risque' : 'À vérifier'}</Pastille>
                </>
              }
            />
          ))}
        </GroupeRecap>
      )}

      {t.fichiers && fichiers.length > 0 && (
        <GroupeRecap
          icone={FilesIcon}
          titre="Gros fichiers"
          description={`${fichiers.length} ${pluriel(fichiers.length, 'fichier')} · ${choix.fichiers.size} ${pluriel(choix.fichiers.size, 'coché')} · suppression définitive`}
          total={choix.fichiers.size > 0 ? formatOctets(taille(choix.fichiers, fichiers)) : undefined}
          etat={etatGroupe(fichiers.map((f) => f.id), choix.fichiers)}
          onCocher={(c) => change('fichiers', fichiers.map((f) => f.id), c)}
          deplie={deplie('grosfichiers')}
          onDeplier={() => replier('grosfichiers')}
        >
          {fichiers.map((f) => (
            <LigneRecap
              key={f.id}
              titre={f.name}
              detail={[emplacement(f), ancienneteFichier(f)].filter(Boolean).join(' · ')}
              coche={choix.fichiers.has(f.id)}
              onCocher={(c) => change('fichiers', [f.id], c)}
              fin={<span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(f.sizeBytes)}</span>}
            />
          ))}
        </GroupeRecap>
      )}

      {t.applis && applis.length > 0 && (
        <GroupeRecap
          icone={SquaresFourIcon}
          titre="Applications"
          description={`${applis.length} ${pluriel(applis.length, 'mise à jour', 'mises à jour')}`}
          etat={etatGroupe(applis.map((a) => a.id), choix.applis)}
          onCocher={(c) => change('applis', applis.filter((a) => !c || !a.open).map((a) => a.id), c)}
          deplie={deplie('applications')}
          onDeplier={() => replier('applications')}
        >
          {applis.map((a) => (
            <LigneRecap
              key={a.id}
              titre={a.name}
              detail={
                a.open
                  ? `${versions(a)} · ouverte : fermez-la pour la mettre à jour`
                  : a.stuck
                    ? `${versions(a)} · ${CONSEIL_BLOQUEE}`
                    : a.versionUnknown
                      ? `${versions(a)} · peut revenir même après sa mise à jour`
                      : versions(a)
              }
              coche={choix.applis.has(a.id)}
              onCocher={(c) => change('applis', [a.id], c)}
              fin={
                <>
                  {a.open && <Pastille statut="neutre">Ouverte</Pastille>}
                  <button type="button" onClick={() => onMasquerAppli(a.id)} className={LIEN}>Ne plus proposer</button>
                </>
              }
            />
          ))}
        </GroupeRecap>
      )}

      {t.pilotes && pilotes.length > 0 && (
        <GroupeRecap
          icone={CpuIcon}
          titre="Pilotes"
          description={`${pilotes.length} ${pluriel(pilotes.length, 'pilote')}${sauvegarde ? ' · sauvegarde de sécurité incluse' : ''}`}
          etat={etatGroupe(pilotes.map((p) => p.id), choix.pilotes)}
          onCocher={(c) => change('pilotes', pilotes.map((p) => p.id), c)}
          deplie={deplie('pilotes')}
          onDeplier={() => replier('pilotes')}
        >
          {pilotes.map((p) => (
            <LigneRecap
              key={p.id}
              titre={p.name}
              detail={p.currentVersion && p.newVersion ? `${p.currentVersion} → ${p.newVersion}` : p.newVersion ?? undefined}
              coche={choix.pilotes.has(p.id)}
              onCocher={(c) => change('pilotes', [p.id], c)}
              fin={
                <>
                  <button type="button" onClick={() => onMasquerPilote(p.key)} className={LIEN}>Ne plus proposer</button>
                  {p.needsRestart && <Pastille statut="neutre">Redémarrage requis</Pastille>}
                </>
              }
            />
          ))}
        </GroupeRecap>
      )}
    </div>
  );
}
