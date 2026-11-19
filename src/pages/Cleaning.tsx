import { useSearchParams } from 'react-router-dom';
import EnTetePage from '../components/ui/EnTetePage';
import Onglets from '../components/ui/Onglets';
import Nettoyage from '../components/nettoyage/Nettoyage';
import GrosFichiers from '../components/grosfichiers/GrosFichiers';

type Onglet = 'nettoyage' | 'gros-fichiers';

const ONGLETS: { id: Onglet; libelle: string; titre: string; sousTitre: string }[] = [
  { id: 'nettoyage', libelle: 'Nettoyage', titre: 'Nettoyage', sousTitre: 'Trouvez ce qui encombre votre PC, puis choisissez ce que vous nettoyez.' },
  { id: 'gros-fichiers', libelle: 'Gros fichiers', titre: 'Gros fichiers', sousTitre: "Repérez ce qui prend le plus de place et supprimez ce dont vous n'avez plus besoin." },
];

/** Page Nettoyage : onglets Nettoyage et Gros fichiers (?onglet=gros-fichiers). */
export default function Cleaning() {
  const [params, setParams] = useSearchParams();
  const actif = ONGLETS.find((o) => o.id === params.get('onglet')) ?? ONGLETS[0];

  return (
    <section className="flex min-h-full flex-col gap-8">
      <EnTetePage titre={actif.titre} sousTitre={actif.sousTitre} />
      <Onglets
        libelle="Nettoyage"
        onglets={ONGLETS}
        actif={actif.id}
        onChange={(id) => setParams(id === 'nettoyage' ? {} : { onglet: id }, { replace: true })}
      />
      {actif.id === 'gros-fichiers' ? <GrosFichiers /> : <Nettoyage />}
    </section>
  );
}
