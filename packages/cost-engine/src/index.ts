import type { VehicleClass } from '@cout-trajet/shared';

/**
 * Point d'entrée du moteur de coût.
 * Le contenu réel (carburant, péages, durée) arrive à l'étape P1 ; ce fichier ne sert
 * pour l'instant qu'à vérifier que le monorepo, les types partagés et les tests fonctionnent.
 */
export const COST_ENGINE_VERSION = '0.0.0';

/** Classe de véhicule utilisée par défaut pour les calculs (voiture particulière). */
export const DEFAULT_VEHICLE_CLASS: VehicleClass = 1;
