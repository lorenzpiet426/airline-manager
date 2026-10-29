// Managers (Phase 8.3): heads of department the airline can hire. Candidates are made-up people (names typical of the
// hub country) with a skill level, years of experience, a specialty and a salary that rises steeply with skill.
// Salaries are modelled on published pay for airline department heads (vice-president level at a mid-size European
// airline ≈ €150–400k a year; the very best are paid much more and are poached by others).

export type Department = 'hr' | 'revenue' | 'network' | 'fleet' | 'maintenance';
export const DEPARTMENTS: readonly Department[] = ['network', 'revenue', 'fleet', 'maintenance', 'hr'];
export type Delegation = 'advise' | 'approve' | 'auto';

/** What a manager is especially good at (decisions matching it are judged better). */
export const SPECIALTIES: Readonly<Record<Department, readonly string[]>> = {
  network: ['shortHaul', 'longHaul'],
  revenue: ['shortHaul', 'longHaul', 'premium'],
  fleet: ['leasing', 'narrowbody', 'widebody'],
  maintenance: ['narrowbody', 'widebody'],
  hr: ['negotiation', 'recruiting'],
};

/** Yearly salary (2025 USD, Austrian wage level) by skill 1–5. */
export const SALARY_USD = [120_000, 165_000, 230_000, 320_000, 450_000] as const;
/** How likely candidates of each skill are (good ones are rare). */
export const SKILL_ODDS = [0.2, 0.35, 0.28, 0.13, 0.04] as const;
/** How far off a manager's estimates are (share of the effect), by skill 1–5; a matching specialty narrows it. */
export const JUDGEMENT_NOISE = [0.45, 0.3, 0.2, 0.12, 0.06] as const;
export const SPECIALTY_NOISE = 0.65;
/** Candidates per department each month. */
export const CANDIDATES = 3;
/** Severance when a manager is let go (months of salary). */
export const MANAGER_SEVERANCE_MONTHS = 6;
/** Managers leaving each month: everyone a little, the best are poached more often. */
export const MANAGER_QUIT = 0.006;
export const POACHED = 0.01;
/** Proposals wait this long for an answer; decisions are judged this long afterwards. */
export const PROPOSAL_DAYS = 14;
export const REVEAL_DAYS = 28;

/** Names typical of a region (made-up combinations of common first and last names). */
const NAMES: Readonly<Record<string, { first: readonly string[]; last: readonly string[] }>> = {
  de: {
    first: ['Anna', 'Lukas', 'Katharina', 'Michael', 'Julia', 'Stefan', 'Sabine', 'Thomas', 'Lena', 'Andreas', 'Eva', 'Markus', 'Sophie', 'Florian', 'Birgit', 'Matthias'],
    last: ['Gruber', 'Huber', 'Wagner', 'Bauer', 'Müller', 'Pichler', 'Steiner', 'Moser', 'Hofer', 'Leitner', 'Berger', 'Fuchs', 'Schmid', 'Weber', 'Mayer', 'Winkler'],
  },
  en: {
    first: ['James', 'Emma', 'Oliver', 'Charlotte', 'Daniel', 'Sarah', 'Thomas', 'Laura', 'Michael', 'Hannah', 'David', 'Rachel', 'Andrew', 'Grace', 'Robert', 'Megan'],
    last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Evans', 'Walker', 'Wright', 'Robinson', 'Thompson', 'Hughes', 'Clarke', 'Hall', 'Green', 'Baker', 'Turner'],
  },
  fr: {
    first: ['Camille', 'Julien', 'Claire', 'Nicolas', 'Sophie', 'Antoine', 'Élodie', 'Mathieu', 'Céline', 'Pierre', 'Manon', 'Laurent'],
    last: ['Martin', 'Bernard', 'Dubois', 'Durand', 'Lefèvre', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Garnier', 'Rousseau', 'Fontaine'],
  },
  it: {
    first: ['Giulia', 'Marco', 'Chiara', 'Luca', 'Francesca', 'Andrea', 'Elena', 'Matteo', 'Sara', 'Paolo', 'Valentina', 'Davide'],
    last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo'],
  },
  es: {
    first: ['Lucía', 'Javier', 'María', 'Carlos', 'Elena', 'Pablo', 'Carmen', 'Diego', 'Laura', 'Alejandro', 'Ana', 'Sergio'],
    last: ['García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno'],
  },
  nl: {
    first: ['Sanne', 'Daan', 'Lotte', 'Bram', 'Femke', 'Thijs', 'Anouk', 'Ruben', 'Eline', 'Jeroen'],
    last: ['de Jong', 'Jansen', 'de Vries', 'van den Berg', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'Bos'],
  },
  nordic: {
    first: ['Emma', 'Lars', 'Ingrid', 'Erik', 'Sofia', 'Magnus', 'Linnea', 'Anders', 'Maja', 'Henrik'],
    last: ['Andersson', 'Johansson', 'Nielsen', 'Hansen', 'Larsen', 'Karlsson', 'Lindqvist', 'Berg', 'Olsen', 'Virtanen'],
  },
  pl: {
    first: ['Anna', 'Piotr', 'Katarzyna', 'Tomasz', 'Magdalena', 'Paweł', 'Agnieszka', 'Marcin', 'Joanna', 'Jakub'],
    last: ['Nowak', 'Kowalski', 'Wiśniewska', 'Wójcik', 'Kamińska', 'Lewandowski', 'Zielińska', 'Szymański', 'Dąbrowska', 'Kozłowski'],
  },
  intl: {
    first: ['Ana', 'Ali', 'Mei', 'Ravi', 'Yuki', 'Omar', 'Lina', 'Kenji', 'Priya', 'Mateo', 'Sara', 'Arjun', 'Leila', 'Chen', 'Nadia', 'Hugo'],
    last: ['Silva', 'Khan', 'Wang', 'Sharma', 'Tanaka', 'Haddad', 'Kim', 'Nakamura', 'Patel', 'Costa', 'Ahmed', 'Singh', 'Rahman', 'Li', 'Okafor', 'Reyes'],
  },
};
const REGION: Readonly<Record<string, string>> = {
  AT: 'de', DE: 'de', CH: 'de', LI: 'de', DW: 'de', DD: 'de',
  GB: 'en', IE: 'en', US: 'en', CA: 'en', AU: 'en', NZ: 'en',
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr',
  IT: 'it', SM: 'it', MT: 'it',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', PT: 'es', BR: 'es',
  NL: 'nl',
  SE: 'nordic', NO: 'nordic', DK: 'nordic', FI: 'nordic', IS: 'nordic',
  PL: 'pl', CZ: 'pl', SK: 'pl',
};

/** A made-up name typical of the country (two numbers in [0, 1) pick it). */
export function managerName(country: string, a: number, b: number): string {
  const n = NAMES[REGION[country] ?? 'intl']!;
  return `${n.first[Math.floor(a * n.first.length)]} ${n.last[Math.floor(b * n.last.length)]}`;
}
