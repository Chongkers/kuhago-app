// Template names and their moments (AGENTS.md §7). The backend owns the CLIP prompts;
// the UI only needs the labels.

export type Template = { eventType: string; label: string; moments: string[] }

export const TEMPLATES: Template[] = [
  {
    eventType: 'birthday',
    label: 'Birthday',
    moments: ['Arrival / Guests', 'Blowing the Candles', 'Cake', 'Food / Handaan', 'Games', 'Gift Opening', 'Group Photo', 'Decorations'],
  },
  {
    eventType: 'christmas',
    label: 'Noche Buena / Christmas',
    moments: ['Food on the Table', 'Family Group Photo', 'Gift Exchange', 'Christmas Tree / Parol', 'Kids Opening Gifts', 'Mass / Church'],
  },
  {
    eventType: 'graduation',
    label: 'Graduation',
    moments: ['Marching', 'Receiving Diploma', 'Toga Portrait', 'Family with Graduate', 'Celebration Meal'],
  },
  {
    eventType: 'trip',
    label: 'Trip / Outing',
    moments: ['Travel / Transport', 'Scenery', 'Beach / Pool', 'Food', 'Group Photo', 'Selfies'],
  },
  {
    eventType: 'reunion',
    label: 'Family Reunion',
    moments: ['Group Photo', 'Elders / Lolo & Lola', 'Kids Playing', 'Food', 'Games'],
  },
  {
    eventType: 'debut',
    label: 'Debut',
    moments: ['Grand Entrance', '18 Roses', '18 Candles', '18 Treasures', 'Cotillion', 'Cake', 'Speech / Toast', 'Family Formals', 'Details / Decor'],
  },
  {
    eventType: 'wedding',
    label: 'Wedding',
    moments: ['Bride Prep', 'Groom Prep', 'Processional', 'Vows', 'Veil & Cord', 'Ring Exchange', 'Kiss', 'Family Formals', 'Reception Entrance', 'Cake', 'Details'],
  },
  {
    eventType: 'binyag',
    label: 'Binyag',
    moments: ['Arrival', 'Baptism Rite', 'Godparents', 'Candle', 'Family Formals', 'Reception', 'Details'],
  },
]

export function templateLabel(eventType: string): string {
  return TEMPLATES.find((t) => t.eventType === eventType)?.label ?? eventType
}
