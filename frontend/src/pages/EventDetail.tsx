import { useParams } from 'react-router-dom'
import { useEvent } from '../api/data'
import PersonalEvent from '../components/PersonalEvent'
import ProGig from '../components/ProGig'
import { NotFound } from '../components/Shell'

// The layout follows the event's own mode, not the app-wide one.
export default function EventDetail() {
  const { eventId } = useParams()
  const event = useEvent(Number(eventId))

  if (!event) return <NotFound />
  return event.mode === 'pro' ? <ProGig key={event.id} event={event} /> : <PersonalEvent key={event.id} event={event} />
}
