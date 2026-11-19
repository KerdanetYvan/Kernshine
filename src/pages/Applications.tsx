import { useSearchParams } from 'react-router-dom';
import EnTetePage from '../components/ui/EnTetePage';
import Onglets from '../components/ui/Onglets';
import MisesAJour from '../components/applications/MisesAJour';
import Desinstallation from '../components/applications/Desinstallation';
import Demarrage from '../components/applications/Demarrage';

type Onglet = 'mises-a-jour' | 'desinstallation' | 'demarrage';

const ONGLETS: { id: Onglet; libelle: string; sousTitre: string }[] = [
  { id: 'mises-a-jour', libelle: 'Mises à jour', sousTitre: 'Gardez vos applications à jour : plus de sécurité, moins de bogues.' },
  { id: 'desinstallation', libelle: 'Désinstallation', sousTitre: "Désinstallez ce que vous n'utilisez plus pour libérer de la place." },
  { id: 'demarrage', libelle: 'Démarrage', sousTitre: 'Choisissez ce qui se lance en même temps que Windows.' },
];

/** Page Applications : un onglet par sujet, l'onglet choisi est dans l'adresse (?onglet=desinstallation). */
export default function Applications() {
  const [params, setParams] = useSearchParams();
  const actif = ONGLETS.find((o) => o.id === params.get('onglet')) ?? ONGLETS[0];

  return (
    <section className="flex min-h-full flex-col gap-8">
      <EnTetePage titre={actif.libelle} sousTitre={actif.sousTitre} />
      <Onglets
        libelle="Applications"
        onglets={ONGLETS}
        actif={actif.id}
        onChange={(id) => setParams(id === 'mises-a-jour' ? {} : { onglet: id }, { replace: true })}
      />
      {actif.id === 'demarrage' ? <Demarrage /> : actif.id === 'desinstallation' ? <Desinstallation /> : <MisesAJour />}
    </section>
  );
}
