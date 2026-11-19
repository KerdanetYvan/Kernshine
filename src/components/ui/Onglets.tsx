interface Onglet<T extends string> {
  id: T;
  libelle: string;
}

interface OngletsProps<T extends string> {
  onglets: Onglet<T>[];
  actif: T;
  onChange: (id: T) => void;
  libelle: string;
}

/** Rangée d'onglets soulignée (Figma : « Onglet »). */
export default function Onglets<T extends string>({ onglets, actif, onChange, libelle }: OngletsProps<T>) {
  return (
    <div role="tablist" aria-label={libelle} className="flex gap-2 border-b">
      {onglets.map(({ id, libelle: texte }) => {
        const estActif = id === actif;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={estActif}
            onClick={() => onChange(id)}
            className={`flex flex-col items-center gap-2.5 px-5 pt-3 text-corps-gras transition-colors ${
              estActif ? 'text-action-primary-bg' : 'text-secondary hover:text-primary'
            }`}
          >
            {texte}
            <span className={`h-[3px] w-full ${estActif ? 'bg-action-primary-bg' : ''}`} />
          </button>
        );
      })}
    </div>
  );
}
