import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilesIcon, HeartbeatIcon, TrashIcon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import type { DiskSpace, MaintenanceScore, SystemInfo } from '../types/commands';
import { etatDisque, formatOctets } from '../lib/format';
import Bandeau from '../components/ui/Bandeau';
import EnTetePage from '../components/ui/EnTetePage';
import Pastille from '../components/ui/Pastille';
import CarteNote from '../components/accueil/CarteNote';
import CarteOutil from '../components/accueil/CarteOutil';
import Courbe from '../components/accueil/Courbe';
import Tuile from '../components/accueil/Tuile';
import Entretien from '../components/entretien/Entretien';
import { disqueSysteme } from '../components/entretien/note';

const go = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;

/**
 * Accueil (Figma : « Accueil – Critique » / « Jamais analysé ») : mémoire, processeur et
 * disques en direct, note sur 100 de la dernière analyse et entretien complet.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [disques, setDisques] = useState<DiskSpace[]>([]);
  const [note, setNote] = useState<MaintenanceScore | null>(null);
  const [entretien, setEntretien] = useState(false);

  useEffect(() => {
    const lireInfo = () => invoke<SystemInfo>('system_get_info').then(setInfo).catch(() => {});
    const lireDisques = () => invoke<DiskSpace[]>('system_get_disks').then(setDisques).catch(() => {});
    lireInfo();
    lireDisques();
    invoke<MaintenanceScore | null>('maintenance_last').then(setNote).catch(() => {});
    const t1 = setInterval(lireInfo, 3000);
    const t2 = setInterval(lireDisques, 30000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, []);

  const fermerEntretien = () => {
    setEntretien(false);
    invoke<DiskSpace[]>('system_get_disks').then(setDisques).catch(() => {});
  };

  const systeme = disqueSysteme(disques);
  const plein = systeme && etatDisque(systeme.freeBytes, systeme.totalBytes) === 'corriger';
  const memoire = info ? info.statsHistory.map((p) => (1 - p.freeMemoryGB / info.memoryGB) * 100) : [];
  const processeur = info ? info.statsHistory.map((p) => p.cpuPercent) : [];
  const utilisee = info ? info.memoryGB - info.freeMemoryGB : 0;

  return (
    <section className="flex flex-col gap-8">
      <EnTetePage titre="Accueil" sousTitre="L'état de votre ordinateur, en direct." />

      {plein && systeme && (
        <Bandeau type="corriger" action={{ libelle: "Libérer de l'espace", onClick: () => navigate('/cleaning') }}>
          Votre disque {systeme.letter} se remplit : il ne reste que {formatOctets(systeme.freeBytes)} de libre.
        </Bandeau>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
        <Tuile
          titre="Mémoire"
          valeur={info ? `${Math.round((utilisee / info.memoryGB) * 100)} %` : '…'}
          detail={info ? `${go(utilisee)} utilisés sur ${go(info.memoryGB)}` : 'Lecture…'}
        >
          <Courbe valeurs={memoire} couleur="or" />
        </Tuile>
        <Tuile titre="Processeur" valeur={info ? `${Math.round(info.cpuUsagePercent)} %` : '…'} detail="Charge en ce moment">
          <Courbe valeurs={processeur} couleur="vert" />
        </Tuile>
        {disques.map((d) => (
          <Tuile key={d.letter} titre={`Disque ${d.letter}`} valeur={formatOctets(d.freeBytes, true)} unite="restants" detail={`sur ${formatOctets(d.totalBytes, true)} au total`}>
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-legende text-secondary">État du disque</p>
              <Pastille statut={etatDisque(d.freeBytes, d.totalBytes)}>
                {{ ok: 'Tout va bien', surveiller: 'À surveiller', corriger: 'Critique', info: '', neutre: '' }[etatDisque(d.freeBytes, d.totalBytes)]}
              </Pastille>
            </div>
          </Tuile>
        ))}
      </div>

      <CarteNote note={note} onLancer={() => setEntretien(true)} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-titre-2 text-primary">Pour aller plus loin</h2>
          <p className="text-corps-petit text-secondary">Des outils en plus, quand vous en avez envie.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
          <CarteOutil icone={HeartbeatIcon} titre="Santé du matériel" texte="Vérifiez l'état de votre disque et de votre batterie." bouton="Vérifier" onClick={() => navigate('/health')} />
          <CarteOutil icone={FilesIcon} titre="Gros fichiers" texte="Trouvez ce qui occupe le plus de place sur votre disque." bouton="Chercher" onClick={() => navigate('/cleaning?onglet=gros-fichiers')} />
          <CarteOutil icone={TrashIcon} titre="Programmes installés" texte="Désinstallez ce que vous n'utilisez plus." bouton="Voir la liste" onClick={() => navigate('/applications?onglet=desinstallation')} />
        </div>
      </section>

      {entretien && <Entretien onFermer={fermerEntretien} onNote={setNote} />}
    </section>
  );
}
