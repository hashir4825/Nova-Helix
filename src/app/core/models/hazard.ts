/** NASA's 5 Hazards of Human Spaceflight. Canonical order; do not reorder. */
export type HazardKey = 'radiation' | 'isolation' | 'distance' | 'gravity' | 'environment';

export interface HazardDef {
  key: HazardKey;
  label: string;
  short: string;
  description: string;
  /** Signals that feed this hazard's score. */
  countermeasures: string[];
}

export const HAZARD_KEYS: readonly HazardKey[] = ['radiation', 'isolation', 'distance', 'gravity', 'environment'];

export const HAZARDS: Record<HazardKey, HazardDef> = {
  radiation: {
    key: 'radiation',
    label: 'Radiation',
    short: 'RAD',
    description:
      'Galactic cosmic rays and solar particle events outside the magnetosphere. Raises long-term cancer, CNS and cardiovascular risk.',
    countermeasures: [
      'Storm shelter (water-wall crew quarters) during solar particle events',
      'Duty-cycle scheduling to limit time in low-shielding modules',
      'Personal dosimeter compliance check',
    ],
  },
  isolation: {
    key: 'isolation',
    label: 'Isolation & confinement',
    short: 'ISO',
    description:
      'Months in a small crewed volume with limited contact. Affects mood, sleep, cohesion and cognitive performance.',
    countermeasures: [
      'Private psychological conference (delayed-link video)',
      'Protected off-duty time and crew-choice activities',
      'Lighting and sleep-schedule adjustment',
    ],
  },
  distance: {
    key: 'distance',
    label: 'Distance from Earth',
    short: 'DST',
    description:
      'Communication delay and no evacuation option. Crew must manage medical events and workload autonomously.',
    countermeasures: [
      'Onboard medical decision support and CMO protocols',
      'Workload re-planning to protect margin',
      'Pre-queued consults with Earth flight surgeon',
    ],
  },
  gravity: {
    key: 'gravity',
    label: 'Gravity fields',
    short: 'GRV',
    description:
      'Microgravity drives bone and muscle loss, fluid shifts toward the head (SANS) and cardiovascular deconditioning.',
    countermeasures: [
      'Resistive and aerobic exercise prescription',
      'Lower-body negative pressure sessions',
      'Ocular imaging and vision checks',
    ],
  },
  environment: {
    key: 'environment',
    label: 'Hostile/closed environment',
    short: 'ENV',
    description:
      'Closed-loop life support: CO₂, noise, temperature, air quality and microbial load all act on crew health.',
    countermeasures: [
      'CO₂ scrubber maintenance and module ventilation',
      'Noise and light hygiene in crew quarters',
      'Environmental sampling',
    ],
  },
};
