'use client';

import { useRef, useState } from 'react';

interface Props<T> {
  label: string;
  placeholder: string;
  /** Texte affiché : le parent le possède, ce qui permet de le remplir depuis la carte. */
  text: string;
  onText: (text: string) => void;
  search: (q: string) => Promise<T[]>;
  display: (item: T) => string;
  onSelect: (item: T | null) => void;
  /** Message affiché quand la recherche ne trouve rien. */
  emptyMessage?: string;
}

/** Champ de recherche avec suggestions (délai de 300 ms pour ménager les services). */
export function Autocomplete<T>({
  label,
  placeholder,
  text,
  onText,
  search,
  display,
  onSelect,
  emptyMessage,
}: Props<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(0);

  function onInput(value: string) {
    onText(value);
    onSelect(null);
    clearTimeout(timer.current);
    const ticket = ++latest.current;
    setSearched(false);
    if (value.trim().length < 3) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(() => {
      search(value.trim())
        .then((found) => {
          // Ignore les réponses arrivées après une saisie plus récente.
          if (ticket === latest.current) {
            setItems(found);
            setSearched(true);
            setOpen(true);
          }
        })
        .catch(() => {});
    }, 300);
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && items.length > 0 && (
        <ul className="suggestions">
          {items.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={() => {
                  latest.current++;
                  setSearched(false);
                  onText(display(item));
                  setItems([]);
                  setOpen(false);
                  onSelect(item);
                }}
              >
                {display(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && items.length === 0 && emptyMessage && (
        <small className="hint">{emptyMessage}</small>
      )}
    </label>
  );
}
