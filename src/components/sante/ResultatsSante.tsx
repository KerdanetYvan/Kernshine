import { useEffect, useState } from 'react';
import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import type { GpuTemperature, SystemInfo, WearResult } from '../../types/commands';
import { formatListe } from '../../lib/format';
import Bandeau from '../ui/Bandeau';
import Carte from '../ui/Carte';
import Pastille from '../ui/Pastille';
import CarteBatterie from './CarteBatterie';
import CarteDisque from './CarteDisque';
import CarteMemoire from './CarteMemoire';
import CarteTemperature from './CarteTemperature';
import { evaluerBatterie, evaluerDisque, evaluerMemoire, evaluerTemperature, pire, type Evaluation } from './evaluation';
import { memoireSante } from './memoire';

/** Résultats de la vérification (Figma : « Santé – Tout va bien » / « À surveiller »). */
export default function ResultatsSante() {
  const [usure, setUsure] = useState<WearResult | null>(memoireSante.usure);
  const [lecture, setLecture] = useState(false);
  const [refus, setRefus] = useState(false);
  const [gpus, setGpus] = useState<GpuTemperature[]>(memoireSante.gpus);
  const [info, setInfo] = useState<SystemInfo | null>(null);

  // En direct tant que la page est ouverte : température (5 s) et mémoire (3 s).
  useEffect(() => {
    const lireGpus = () =>
      invoke<GpuTemperature[]>('health_gpu_temperature')
        .then((g) => {
          memoireSante.gpus = g;
          setGpus(g);
        })
        .catch(() => {});
    const lireInfo = () => invoke<SystemInfo>('system_get_info').then(setInfo).catch(() => {});
    lireInfo();
    const t1 = setInterval(lireGpus, 5000);
    const t2 = setInterval(lireInfo, 3000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, []);

  const r = memoireSante.rapport;
  if (!r) return null;

  const lireUsure = async () => {
    setLecture(true);
    setRefus(false);
    try {
      const res = await invoke<WearResult>('health_read_wear');
      if (res.ok) {
        memoireSante.usure = res;
        setUsure(res);
      } else setRefus(true);
    } catch {
      setRefus(true);
    }
    setLecture(false);
  };

  const disques = r.disks.map((d) => {
    const u = usure?.disks.find((w) => w.diskNumber === d.diskNumber);
    return { d, u, e: evaluerDisque(d, u) };
  });
  const eBatterie = r.battery ? evaluerBatterie(r.battery) : null;
  const eTemperature = gpus.length > 0 ? evaluerTemperature(gpus) : null;
  const eMemoire = evaluerMemoire(r.memoryTest);
  const evaluations: Evaluation[] = [
    ...disques.map((x) => x.e),
    ...(eBatterie ? [eBatterie] : []),
    ...(eTemperature ? [eTemperature] : []),
    eMemoire,
  ];
  const points = evaluations.map((e) => e.point).filter((p): p is string => !!p);
  const global = pire(evaluations.map((e) => e.statut));
  const phrase = points.length > 0 ? formatListe(points, 10) : '';

  return (
    <div className="flex flex-col gap-8">
      <Carte className="flex items-center gap-6 px-8">
        <div className={`grid size-[72px] shrink-0 place-items-center rounded-full ${global === 'ok' ? 'bg-status-ok-bg' : 'bg-status-warning-bg'}`}>
          {global === 'ok' ? <CheckCircleIcon className="size-10 text-status-ok-fg" /> : <WarningIcon className="size-10 text-status-warning-fg" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-titre-1 text-primary">
            {points.length === 0 ? 'Tout va bien' : `${points.length} ${points.length > 1 ? 'points' : 'point'} à surveiller`}
          </h2>
          <p className="text-corps text-secondary">
            {points.length === 0
              ? 'Votre ordinateur est en bonne forme. Rien à faire pour le moment.'
              : `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}. Les conseils sont plus bas.`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5">
          <p className="text-legende text-secondary">Matériel</p>
          <Pastille statut={global} />
        </div>
      </Carte>

      {refus && (
        <Bandeau type="surveiller" onFermer={() => setRefus(false)}>
          L'usure n'a pas pu être lue : Windows n'a pas reçu l'autorisation. Vous pouvez réessayer quand vous voulez.
        </Bandeau>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {disques.map(({ d, u, e }) => (
          <CarteDisque
            key={d.letter}
            disque={d}
            evaluation={e}
            usure={u}
            usureLue={usure !== null}
            lectureEnCours={lecture}
            onLireUsure={lireUsure}
          />
        ))}
        {r.battery && eBatterie && <CarteBatterie batterie={r.battery} evaluation={eBatterie} />}
        {eTemperature && <CarteTemperature gpus={gpus} evaluation={eTemperature} />}
        {info && <CarteMemoire info={info} test={r.memoryTest} evaluation={eMemoire} />}
      </div>
    </div>
  );
}
