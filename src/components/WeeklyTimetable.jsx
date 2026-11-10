
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './WeeklyTimetable.css'

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]

const colors = {
  college: '#6551c8',
  work: '#3978c6',
  travel: '#b77935',
  gym: '#258b70',
  sleep: '#665c83',
  study: '#3b9bce',
  other: '#77717f'
}

function getWeekDates(offset) {
  const today = new Date()
  const sunday = new Date(today)

  sunday.setDate(today.getDate() - today.getDay() + offset * 7)
  sunday.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday)
    date.setDate(sunday.getDate() + index)
    return date
  })
}

function getDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function toMinutes(time) {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}

function toTime(minutes) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`
}

function isMissedSession(session) {
  if (session.is_completed) return false

  const now = new Date()
  const todayKey = getDateKey(now)
  const currentTime = toTime(now.getHours() * 60 + now.getMinutes())

  if (session.scheduled_date < todayKey) return true
  if (session.scheduled_date > todayKey) return false

  return session.end_time <= currentTime
}

function formatDisplayTime(time) {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12

  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function formatDisplayDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  })
}

function WeeklyTimetable({ onBack }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [blocks, setBlocks] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  const [proposal, setProposal] = useState(null)
  const [findingSlot, setFindingSlot] = useState(false)
  const [savingReschedule, setSavingReschedule] = useState(false)

  const weekDates = getWeekDates(weekOffset)

  useEffect(() => {
    async function loadTimetable() {
      setLoading(true)

      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData.user) {
        alert('Please sign in again.')
        setLoading(false)
        return
      }

      const userId = userData.user.id

      const startDate = getDateKey(weekDates[0])
      const endDate = getDateKey(weekDates[6])

      const { data: blockData, error: blockError } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)

      if (blockError) {
        alert('Could not load commitments: ' + blockError.message)
        setLoading(false)
        return
      }

      const { data: sessionData, error: sessionError } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .order('start_time', { ascending: true })

      if (sessionError) {
        alert('Could not load study sessions: ' + sessionError.message)
        setLoading(false)
        return
      }

      setBlocks(blockData || [])
      setSessions(sessionData || [])
      setLoading(false)
    }

    loadTimetable()
  }, [weekOffset])

  function formatTime(time) {
    return formatDisplayTime(time)
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short'
    })
  }

  async function toggleSession(session) {
    const newCompleted = !session.is_completed

    setSessions(prev =>
      prev.map(item =>
        item.id === session.id
          ? { ...item, is_completed: newCompleted }
          : item
      )
    )

    const { error } = await supabase
      .from('study_sessions')
      .update({ is_completed: newCompleted })
      .eq('id', session.id)

    if (error) {
      alert('Could not update study session: ' + error.message)

      setSessions(prev =>
        prev.map(item =>
          item.id === session.id
            ? { ...item, is_completed: session.is_completed }
            : item
        )
      )
    }
  }

  async function findRescheduleSlot(session) {
    setFindingSlot(true)

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData.user) {
        throw new Error('Please sign in again.')
      }

      const userId = userData.user.id

      const { data: preferenceData, error: preferenceError } =
        await supabase
          .from('study_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()

      if (preferenceError) throw preferenceError

      const { data: futureSessions, error: sessionsError } =
        await supabase
          .from('study_sessions')
          .select('*')
          .eq('user_id', userId)
          .gte('scheduled_date', getDateKey(new Date()))
          .order('scheduled_date', { ascending: true })

      if (sessionsError) throw sessionsError

      const studyStart = toMinutes(
        preferenceData?.preferred_start || '16:00'
      )
      const studyEnd = toMinutes(
        preferenceData?.preferred_end || '22:00'
      )

      if (studyEnd <= studyStart) {
        throw new Error('Your preferred study hours are invalid.')
      }

      const duration = Number(session.duration)

      if (!duration || duration <= 0) {
        throw new Error('This session has an invalid duration.')
      }

      const now = new Date()
      now.setSeconds(0, 0)

      for (let day = 0; day < 30; day++) {
        const date = new Date()
        date.setHours(0, 0, 0, 0)
        date.setDate(date.getDate() + day)

        const dateKey = getDateKey(date)
        const dayOfWeek = date.getDay()

        const dailyCommitments = blocks.filter(block =>
          block.is_active !== false &&
          Number(block.day_of_week) === dayOfWeek
        )

        const dailySessions = (futureSessions || []).filter(item =>
          item.scheduled_date === dateKey &&
          item.id !== session.id
        )

        const busyPeriods = [
          ...dailyCommitments.map(item => ({
            start: toMinutes(item.start_time),
            end: toMinutes(item.end_time)
          })),
          ...dailySessions.map(item => ({
            start: toMinutes(item.start_time),
            end: toMinutes(item.end_time)
          }))
        ]

        let earliestStart = studyStart

        if (day === 0) {
          const currentMinutes = now.getHours() * 60 + now.getMinutes()
          earliestStart = Math.max(
            studyStart,
            Math.ceil(currentMinutes / 30) * 30
          )
        }

        for (
          let start = earliestStart;
          start + duration <= studyEnd;
          start += 30
        ) {
          const end = start + duration

          const overlaps = busyPeriods.some(period =>
            start < period.end && end > period.start
          )

          if (!overlaps) {
            setProposal({
              session,
              scheduled_date: dateKey,
              start_time: toTime(start),
              end_time: toTime(end),
              duration
            })

            return
          }
        }
      }

      alert('No available study slot found in the next 30 days.')
    } catch (error) {
      alert('Could not find a new slot: ' + error.message)
    } finally {
      setFindingSlot(false)
    }
  }

  async function confirmReschedule() {
    if (!proposal) return

    setSavingReschedule(true)

    const { error } = await supabase
      .from('study_sessions')
      .update({
        scheduled_date: proposal.scheduled_date,
        start_time: proposal.start_time,
        end_time: proposal.end_time
      })
      .eq('id', proposal.session.id)

    if (error) {
      alert('Could not reschedule session: ' + error.message)
      setSavingReschedule(false)
      return
    }

    setSessions(prev =>
      prev.map(item =>
        item.id === proposal.session.id
          ? {
              ...item,
              scheduled_date: proposal.scheduled_date,
              start_time: proposal.start_time,
              end_time: proposal.end_time
            }
          : item
      )
    )

    setProposal(null)
    setSavingReschedule(false)
    alert('Study session rescheduled successfully!')
  }

  return (
    <main className="main weekly-timetable">
      <header className="weekly-header">
        <div>
          <p className="muted">STUDYFLOW WORKSPACE</p>
          <h1>Weekly Timetable ✦</h1>
          <p className="muted">
            Your commitments and generated study sessions.
          </p>
        </div>

        <button className="cancel-button" onClick={onBack}>
          ← Dashboard
        </button>
      </header>

      <section className="card weekly-card">
        <div className="week-navigation">
          <button onClick={() => setWeekOffset(prev => prev - 1)}>
            ← Previous
          </button>

          <h2>
            {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
          </h2>

          <button onClick={() => setWeekOffset(prev => prev + 1)}>
            Next →
          </button>
        </div>

        <button
          className="today-button"
          onClick={() => setWeekOffset(0)}
        >
          Today
        </button>
      </section>

      <section className="card weekly-card">
        <div className="week-legend">
          <span>🟣 Commitments</span>
          <span>🔵 Study sessions</span>
          <span>🔴 Missed sessions</span>
        </div>
      </section>

      {loading ? (
        <section className="card weekly-card">
          <p className="muted">Loading your weekly timetable...</p>
        </section>
      ) : (
        <section className="weekly-grid">
          {weekDates.map(date => {
            const day = date.getDay()
            const dateKey = getDateKey(date)

            const dayBlocks = blocks.filter(
              block => Number(block.day_of_week) === day
            )

            const daySessions = sessions.filter(
              item => item.scheduled_date === dateKey
            )

            const events = [
              ...dayBlocks.map(block => ({
                ...block,
                eventType: 'commitment',
                sortTime: block.start_time
              })),
              ...daySessions.map(item => ({
                ...item,
                eventType: 'study',
                sortTime: item.start_time
              }))
            ].sort((a, b) =>
              a.sortTime.localeCompare(b.sortTime)
            )

            return (
              <div className="card week-day" key={dateKey}>
                <div className="week-day-heading">
                  <strong>{dayNames[day]}</strong>
                  <span>{formatDate(date)}</span>
                </div>

                {events.length === 0 ? (
                  <p className="empty-day">No activities scheduled</p>
                ) : (
                  events.map(event => {
                    const isStudy = event.eventType === 'study'
                    const missed = isStudy && isMissedSession(event)

                    return (
                      <div
                        className="week-event"
                        key={`${event.eventType}-${event.id}`}
                        style={{
                          borderLeftColor: missed
                            ? '#e05252'
                            : isStudy
                              ? colors.study
                              : colors[event.block_type] || colors.other
                        }}
                      >
                        <strong>{event.title}</strong>

                        <span>
                          {formatTime(event.start_time)} –{' '}
                          {formatTime(event.end_time)}
                        </span>

                        {isStudy ? (
                          <>
                            <small>
                              📚 {event.subject || 'Other'} · {event.duration} min
                            </small>

                            {missed && (
                              <>
                                <small
                                  style={{
                                    display: 'block',
                                    color: '#ff7070',
                                    fontWeight: 'bold',
                                    marginTop: '6px'
                                  }}
                                >
                                  ⚠ Missed Session
                                </small>

                                <button
                                  className="today-button"
                                  style={{ marginTop: '10px' }}
                                  disabled={findingSlot}
                                  onClick={() => findRescheduleSlot(event)}
                                >
                                  {findingSlot
                                    ? 'Finding a slot...'
                                    : '↻ Reschedule'}
                                </button>
                              </>
                            )}

                            <label className="session-completion">
                              <input
                                type="checkbox"
                                checked={Boolean(event.is_completed)}
                                onChange={() => toggleSession(event)}
                              />
                              {event.is_completed
                                ? 'Completed'
                                : 'Mark completed'}
                            </label>
                          </>
                        ) : (
                          <small>{event.block_type}</small>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )
          })}
        </section>
      )}

      {proposal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '430px',
              padding: '24px'
            }}
          >
            <h2>Confirm Rescheduling</h2>

            <p className="muted">
              StudyFlow found a new available slot for:
            </p>

            <h3>{proposal.session.title}</h3>

            <p>
              <strong>Date:</strong>{' '}
              {formatDisplayDate(proposal.scheduled_date)}
            </p>

            <p>
              <strong>Time:</strong>{' '}
              {formatTime(proposal.start_time)} –{' '}
              {formatTime(proposal.end_time)}
            </p>

            <p>
              <strong>Duration:</strong> {proposal.duration} minutes
            </p>

            <p className="muted">
              Your session will only move if you confirm.
            </p>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginTop: '20px',
                flexWrap: 'wrap'
              }}
            >
              <button
                className="today-button"
                onClick={confirmReschedule}
                disabled={savingReschedule}
              >
                {savingReschedule ? 'Saving...' : 'Confirm'}
              </button>

              <button
                className="cancel-button"
                onClick={() => setProposal(null)}
                disabled={savingReschedule}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default WeeklyTimetable
