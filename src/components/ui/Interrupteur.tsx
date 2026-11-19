interface InterrupteurProps {
  active: boolean;
  onChange: (active: boolean) => void;
  /** Texte lu par les lecteurs d'écran : ce que l'interrupteur active. */
  libelle: string;
  disabled?: boolean;
}

/** Active ou désactive une option (Figma : « Interrupteur », 56 × 32 px). */
export default function Interrupteur({ active, onChange, libelle, disabled }: InterrupteurProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={libelle}
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={[
        'inline-flex h-8 w-14 shrink-0 items-center rounded-full px-1 transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'bg-action-primary-bg' : 'bg-piste-forte',
      ].join(' ')}
    >
      <span className={`size-6 rounded-full bg-surface transition-transform ${active ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  );
}
