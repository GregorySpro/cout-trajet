import type { ReactNode } from 'react';

/** Petites icônes de trait (24 × 24), sans dépendance : elles héritent de la couleur du texte. */
function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlusIcon = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

/** Départ : un cercle avec un point central. */
export const StartIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </Svg>
);

/** Escale : une épingle. */
export const StopIcon = () => (
  <Svg>
    <path d="M12 21c-4-4.5-6-7.6-6-10.5a6 6 0 0 1 12 0c0 2.9-2 6-6 10.5Z" />
    <circle cx="12" cy="10.5" r="2" />
  </Svg>
);

/** Arrivée : un drapeau. */
export const FlagIcon = () => (
  <Svg>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);

export const UpIcon = () => (
  <Svg size={16}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);

export const DownIcon = () => (
  <Svg size={16}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg size={16}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
