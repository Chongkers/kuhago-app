# Kuha — Domain Glossary

- **Event**: one occasion whose media is organized together (a birthday, a debut). Called "Gig" in Pro mode.
- **Template**: a starter list of moments for an event type (`backend/templates/<event_type>.json`). Applying one *replaces* the event's shot items.
- **Moment**: a named part of an event a person expects photos of ("Blowing the Candles"). Media is classified into one moment or `Unsorted`.
- **Shot item**: a moment attached to a specific event, with its CLIP prompts and `required` flag. "Moments checklist" (Personal) / "Shot list" (Pro).
- **Prompt**: a sentence describing what is *visible* in a moment, used for CLIP text matching. Never a cultural name CLIP can't know ("18 Roses" → "a man handing a rose to a young woman in a gown").
- **Missed moment**: a shot item with no media assigned and no media scoring above `TAU_COV`. "Coverage" in Pro mode.
