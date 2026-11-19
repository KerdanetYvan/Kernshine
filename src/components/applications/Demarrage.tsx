import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppWindowIcon, LockSimpleIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import type { Ack, StartupItem, StartupScanResult } from '../../types/commands';
import Bandeau from '../ui/Bandeau';
import Bouton from '../ui/Bouton';
import Carte from '../ui/Carte';
import Interrupteur from '../ui/Interrupteur';
import MessageTemporaire from '../ui/MessageTemporaire';
import Pastille from '../ui/Pastille';

const cle = (i: StartupItem) => `${i.source}:${i.name}`;
const portee = (i: StartupItem) => (i.source === 'user' ? 'Se lance pour votre compte' : 'Se lance pour tous les comptes du PC');

function Ligne({ icone, nom, description, children }: { icone: 'app' | 'necessaire'; nom: string; description: string; children: ReactNode }) {
  const Icone = icone === 'app' ? AppWindowIcon : ShieldCheckIcon;
  return (
    <li className="flex items-center gap-4 rounded-lg border bg-surface py-3 pl-3 pr-6">
      <div className="grid size-12 shrink-0 place-items-center rounded-md bg-subtle">
        <Icone weight="duotone" className="size-6 text-secondary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-corps-gras text-primary">{nom}</p>
        <p className="text-corps-petit text-secondary">{description}</p>
      </div>
      {children}
    </li>
  );
}

/** Onglet « Démarrage » : ce qui se lance avec Windows (Figma : « Applications – Démarrage »). */
export default function Demarrage() {
  const [items, setItems] = useState<StartupItem[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ texte: string; annuler: () => void } | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const res = await invoke<StartupScanResult>('repair_get_startup_items');
      if (!res.ok) throw new Error(res.error);
      setItems([...res.data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.warn('démarrage', e);
      setErreur("La liste des programmes au démarrage n'a pas pu être lue.");
    }
  }, []);

  useEffect(() => {
    // Lecture seule et rapide : la liste se charge dès l'ouverture de l'onglet.
    charger();
  }, [charger]);

  const basculer = async (item: StartupItem, active: boolean, avecAnnulation = true) => {
    const k = cle(item);
    setEnCours((prev) => new Set(prev).add(k));
    setItems((prev) => prev?.map((i) => (cle(i) === k ? { ...i, enabled: active } : i)) ?? prev);
    let ok = false;
    try {
      ok = (await invoke<Ack>('repair_set_startup_items', { changes: [{ name: item.name, source: item.source, enabled: active }] })).ok;
    } catch (e) {
      console.warn('démarrage', e);
    }
    setEnCours((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
    if (!ok) {
      setItems((prev) => prev?.map((i) => (cle(i) === k ? { ...i, enabled: !active } : i)) ?? prev);
      setErreur(
        item.source === 'system'
          ? "Le changement n'a pas été fait : Windows doit vous demander l'autorisation pour ce programme. Réessayez et cliquez sur « Oui »."
          : "Le changement n'a pas pu être enregistré. Réessayez.",
      );
      return;
    }
    setErreur(null);
    if (avecAnnulation) {
      setMessage({
        texte: active ? `${item.name} se lancera avec Windows.` : `${item.name} ne se lancera plus au démarrage.`,
        annuler: () => {
          setMessage(null);
          basculer({ ...item, enabled: active }, !active, false);
        },
      });
    }
  };

  if (items === null) {
    return erreur ? (
      <Bandeau type="corriger" action={{ libelle: 'Réessayer', onClick: charger }}>{erreur}</Bandeau>
    ) : (
      <p className="text-corps text-secondary" aria-live="polite">Lecture des programmes au démarrage…</p>
    );
  }

  const libres = items.filter((i) => !i.essential);
  const necessaires = items.filter((i) => i.essential);
  const actifs = libres.filter((i) => i.enabled).length;

  return (
    <>
      <Carte className="flex items-center gap-6 px-8">
        <p className="font-titre text-chiffre-grand text-primary">{actifs}</p>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-corps-gras text-primary">
            {actifs > 1 ? 'programmes se lancent avec Windows' : 'programme se lance avec Windows'}
          </p>
          <p className="text-corps-petit text-secondary">
            En désactiver certains accélère en général le démarrage. Vous pourrez les réactiver à tout moment.
          </p>
        </div>
      </Carte>

      {erreur && <Bandeau type="corriger">{erreur}</Bandeau>}

      {libres.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-titre-3 text-primary">Se lancent avec Windows</h2>
          <ul className="flex flex-col gap-3">
            {libres.map((i) => (
              <Ligne key={cle(i)} icone="app" nom={i.name} description={portee(i)}>
                <Interrupteur
                  active={i.enabled}
                  onChange={(a) => basculer(i, a)}
                  libelle={`Lancer ${i.name} avec Windows`}
                  disabled={enCours.has(cle(i))}
                />
              </Ligne>
            ))}
          </ul>
          {libres.some((i) => i.source === 'system') && (
            <p className="text-corps-petit text-secondary">
              Pour un programme lancé pour tous les comptes, Windows vous demandera l'autorisation.
            </p>
          )}
        </section>
      )}

      {libres.length === 0 && (
        <p className="text-corps text-secondary">Aucun programme ne se lance avec Windows, en dehors de ceux qui sont nécessaires.</p>
      )}

      {necessaires.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-titre-3 text-primary">Nécessaires au bon fonctionnement</h2>
          <ul className="flex flex-col gap-3">
            {necessaires.map((i) => (
              <Ligne key={cle(i)} icone="necessaire" nom={i.essential!.label} description={i.essential!.description}>
                {i.enabled ? (
                  <>
                    <Pastille statut="neutre">Nécessaire</Pastille>
                    <LockSimpleIcon className="size-6 shrink-0 text-secondary" aria-label="Ne peut pas être désactivé" />
                  </>
                ) : (
                  // Désactivé avant Kernshine : on peut seulement le réactiver.
                  <Bouton variante="secondaire" taille="compact" onClick={() => basculer(i, true)} disabled={enCours.has(cle(i))}>
                    Réactiver
                  </Bouton>
                )}
              </Ligne>
            ))}
          </ul>
        </section>
      )}

      {message && (
        <MessageTemporaire
          message={message.texte}
          action={{ libelle: 'Annuler', onClick: message.annuler }}
          onFermer={() => setMessage(null)}
        />
      )}
    </>
  );
}
