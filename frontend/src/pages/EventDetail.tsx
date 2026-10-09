import { useParams } from 'react-router-dom'
import { useEvent } from '../api/data'
import PersonalEvent from '../components/PersonalEvent'
import ProGig from '../components/ProGig'
import { NotFound } from '../components/Shell'
import { useMode } from '../lib/mode'

// A gig has two pages: the Tracker shows its details, shot list and references; Events shows its photos, in
// plain language like any other event. Which one is shown follows the window the user is in.
export default function EventDetail() {
  const { eventId } = useParams()
  const event = useEvent(Number(eventId))
  const { mode } = useMode()

  if (!event) return <NotFound />
  if (event.mode === 'pro' && mode === 'pro') return <ProGig key={event.id} event={event} />
  return <PersonalEvent key={event.id} event={{ ...event, mode: 'personal' }} tracked={event.mode === 'pro'} />
}
