import { useState } from 'react';
import { CheckCircleIcon, CpuIcon, FilesIcon, SquaresFourIcon, TrashIcon, WarningIcon } from '@phosphor-icons/react';
import { formatListe, formatOctets, pluriel } from '../../lib/format';
import Carte from '../ui/Carte';
import Pastille from '../ui/Pastille';
import GroupeRecap from './GroupeRecap';
import LigneRecap from './LigneRecap';
import { basculer, cle, zonesUtiles, type Choix, type StatutElement, type Trouve } from './donnees';

interface BilanEntretienProps {
  trouve: Trouve;
  choix: Choix;
  statuts: Map<string, StatutElement>;
  /** Octets libérés (nettoyage et gros fichiers). */
  libere: number;
  redemarrage: boolean;
  /** Les pilotes n'ont pas été installés : la sauvegarde de sécurité a échoué. */
  sansSauvegarde: boolean;
}

/** Ce qui a été fait (Figma : « Entretien – Terminé »). */
export default function BilanEntretien({ trouve: t, choix, statuts, libere, redemarrage, sansSauvegarde }: BilanEntretienProps) {
  const [deplies, setDeplies] = useState<Set<string>>(new Set());
  const deplier = (id: string) => setDeplies((d) => basculer(d, [id], !d.has(id)));
  const st = (k: string) => statuts.get(k) ?? 'saute';

  const zones = zonesUtiles(t.zones ?? []).filter((z) => choix.zones.has(z.id));
  const fichiers = (t.fichiers ?? []).filter((f) => choix.fichiers.has(f.id));
  const applis = (t.applis ?? []).filter((a) => choix.applis.has(a.id));
  const pilotes = (t.pilotes ?? []).filter((p) => choix.pilotes.has(p.id));
  const ouvertes = (t.applis ?? []).filter((a) => a.open && !choix.applis.has(a.id));

  const applisFaites = applis.filter((a) => st(cle('a', a.id)) === 'ok');
  const pilotesFaits = pilotes.filter((p) => st(cle('p', p.id)) === 'ok');
  const fichiersFaits = fichiers.filter((f) => st(cle('f', f.id)) === 'ok');
  const aReprendre = [
    ...applis.filter((a) => st(cle('a', a.id)) === 'echec').map((a) => a.name),
    ...pilotes.filter((p) => st(cle('p', p.id)) === 'echec').map((p) => p.name),
  ];
  const toutBon = aReprendre.length === 0 && !sansSauvegarde;

  const phrases = [
    (applisFaites.length > 0 || pilotesFaits.length > 0) &&
      [applisFaites.length > 0 && `${applisFaites.length} ${pluriel(applisFaites.length, 'application')}`, pilotesFaits.length > 0 && `${pilotesFaits.length} ${pluriel(pilotesFaits.length, 'pilote')}`]
        .filter(Boolean)
        .join(' et ') + ' mis à jour.',
    ouvertes.length > 0 &&
      `${formatListe(ouvertes.map((a) => a.name))} ${ouvertes.length > 1 ? 'étaient ouvertes : leurs mises à jour' : 'était ouverte : sa mise à jour'} n'${ouvertes.length > 1 ? 'ont' : 'a'} pas été faite${ouvertes.length > 1 ? 's' : ''}.`,
    aReprendre.length > 0 && `À reprendre depuis leur page : ${formatListe(aReprendre)}.`,
    sansSauvegarde && "Les pilotes n'ont pas été installés : la sauvegarde de sécurité n'a pas pu être créée. Vous pouvez les installer depuis la page Pilotes.",
  ].filter(Boolean);

  const ligne = (k: string, titre: string, detail: string | undefined, taille?: number) => {
    const s = st(k);
    return (
      <LigneRecap
        key={k}
        titre={titre}
        detail={detail}
        icone={
          <div className={`grid size-10 shrink-0 place-items-center rounded-md ${s === 'ok' ? 'bg-brand-shield-fill' : 'bg-subtle'}`}>
            {s === 'ok' ? <CheckCircleIcon className="size-5 text-brand-shield-stroke" /> : <WarningIcon className="size-5 text-status-warning-fg" />}
          </div>
        }
        fin={
          s === 'ok' ? (
            taille !== undefined && <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(taille)}</span>
          ) : (
            <span className="text-legende text-secondary">{s === 'saute' ? 'Pas fait' : 'À reprendre'}</span>
          )
        }
      />
    );
  };
  const badge = (ok: boolean) => <Pastille statut={ok ? 'ok' : 'surveiller'}>{ok ? 'Terminé' : 'En partie'}</Pastille>;
  const toutOk = (cles: string[]) => cles.every((k) => st(k) === 'ok');

  return (
    <div className="flex flex-col gap-4">
      <Carte className="flex items-center gap-6 px-8">
        <div className={`grid size-[72px] shrink-0 place-items-center rounded-full ${toutBon ? 'bg-status-ok-bg' : 'bg-status-warning-bg'}`}>
          {toutBon ? <CheckCircleIcon className="size-10 text-status-ok-fg" /> : <WarningIcon className="size-10 text-status-warning-fg" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-titre-1 text-primary">{libere > 0 ? `${formatOctets(libere)} libérés` : 'Entretien terminé'}</h2>
          {phrases.length > 0 && <p className="text-corps text-secondary">{phrases.join(' ')}</p>}
        </div>
        {redemarrage && (
          <div className="flex shrink-0 flex-col items-start gap-1.5">
            <p className="text-legende text-secondary">Redémarrage</p>
            <Pastille statut="surveiller">À faire</Pastille>
          </div>
        )}
      </Carte>

      {zones.length > 0 && (
        <GroupeRecap
          icone={TrashIcon}
          titre="Nettoyage"
          description="Windows, navigateurs et logiciels"
          badge={badge(toutOk(zones.map((z) => cle('z', z.id))))}
          deplie={deplies.has('nettoyage')}
          onDeplier={() => deplier('nettoyage')}
        >
          {zones.map((z) => ligne(cle('z', z.id), z.libelle, z.description, z.sizeBytes))}
        </GroupeRecap>
      )}
      {fichiers.length > 0 && (
        <GroupeRecap
          icone={FilesIcon}
          titre="Gros fichiers"
          description={`${fichiersFaits.length} ${pluriel(fichiersFaits.length, 'fichier supprimé', 'fichiers supprimés')} définitivement`}
          badge={badge(toutOk(fichiers.map((f) => cle('f', f.id))))}
          deplie={deplies.has('grosfichiers')}
          onDeplier={() => deplier('grosfichiers')}
        >
          {fichiers.map((f) => ligne(cle('f', f.id), f.name, f.location.join(' › '), f.sizeBytes))}
        </GroupeRecap>
      )}
      {applis.length > 0 && (
        <GroupeRecap
          icone={SquaresFourIcon}
          titre="Applications"
          description={`${applisFaites.length} ${pluriel(applisFaites.length, 'application')} à jour`}
          badge={badge(toutOk(applis.map((a) => cle('a', a.id))))}
          deplie={deplies.has('applications')}
          onDeplier={() => deplier('applications')}
        >
          {applis.map((a) => ligne(cle('a', a.id), a.name, `${a.currentVersion} → ${a.availableVersion}`))}
        </GroupeRecap>
      )}
      {pilotes.length > 0 && (
        <GroupeRecap
          icone={CpuIcon}
          titre="Pilotes"
          description={`${pilotesFaits.length} ${pluriel(pilotesFaits.length, 'pilote')} à jour`}
          badge={badge(toutOk(pilotes.map((p) => cle('p', p.id))))}
          deplie={deplies.has('pilotes')}
          onDeplier={() => deplier('pilotes')}
        >
          {pilotes.map((p) => ligne(cle('p', p.id), p.name, p.newVersion ?? undefined))}
        </GroupeRecap>
      )}
    </div>
  );
}
