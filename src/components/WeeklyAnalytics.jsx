
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function getDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWeekDates() {
  const today = new Date()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - today.getDay())
  sunday.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday)
    date.setDate(sunday.getDate() + index)
    return date
  })
}

function WeeklyAnalytics({ onBack }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const weekDates = getWeekDates()
  const startDate = getDateKey(weekDates[0])
  const endDate = getDateKey(weekDates[6])

  useEffect(() => {
    async function loadAnalytics() {
      setLoading(true)
      setError('')

      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData.user) {
        setError('Please sign in again.')
        setLoading(false)
        return
      }

      const { data, error: sessionError } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('user_id', userData.user.id)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)

      if (sessionError) {
        setError(sessionError.message)
      } else {
        setSessions(data || [])
      }

      setLoading(false)
    }

    loadAnalytics()
  }, [startDate, endDate])

  const now = new Date()
  const todayKey = getDateKey(now)
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`

  const completedSessions = sessions.filter(
    session => session.is_completed
  )

  const missedSessions = sessions.filter(session => {
    if (session.is_completed) return false

    return (
      session.scheduled_date < todayKey ||
      (
        session.scheduled_date === todayKey &&
        session.end_time <= currentTime
      )
    )
  })

  const pendingSessions = sessions.filter(session =>
    !session.is_completed &&
    !missedSessions.some(missed => missed.id === session.id)
  )

  const completedMinutes = completedSessions.reduce(
    (sum, session) => sum + Number(session.duration || 0),
    0
  )

  const plannedMinutes = sessions.reduce(
    (sum, session) => sum + Number(session.duration || 0),
    0
  )

  const completionRate = sessions.length
    ? Math.round((completedSessions.length / sessions.length) * 100)
    : 0

  const dailyStats = weekDates.map(date => {
    const dateKey = getDateKey(date)

    const daySessions = sessions.filter(
      session => session.scheduled_date === dateKey
    )

    const minutes = daySessions
      .filter(session => session.is_completed)
      .reduce(
        (sum, session) => sum + Number(session.duration || 0),
        0
      )

    return {
      label: date.toLocaleDateString('en-IN', { weekday: 'short' }),
      minutes
    }
  })

  const maxMinutes = Math.max(
    ...dailyStats.map(day => day.minutes),
    60
  )

  return (
    <main className="main">
      <header className="weekly-header">
        <div>
          <p className="muted">STUDYFLOW WORKSPACE</p>
          <h1>Weekly Analytics ✦</h1>
          <p className="muted">
            Understand your study performance this week.
          </p>
        </div>

        <button className="cancel-button" onClick={onBack}>
          ← Dashboard
        </button>
      </header>

      {loading ? (
        <section className="card">
          <p className="muted">Loading your analytics...</p>
        </section>
      ) : error ? (
        <section className="card">
          <p>{error}</p>
        </section>
      ) : (
        <>
          <section className="stats">
            <div className="card">
              <span>📚 Completed Study Time</span>
              <h2>{(completedMinutes / 60).toFixed(1)} hrs</h2>
              <small>Actual completed sessions</small>
            </div>

            <div className="card">
              <span>✓ Completion Rate</span>
              <h2>{completionRate}%</h2>
              <small>Completed sessions this week</small>
            </div>

            <div className="card">
              <span>⏳ Pending Sessions</span>
              <h2>{pendingSessions.length}</h2>
              <small>Upcoming study sessions</small>
            </div>

            <div className="card">
              <span>⚠ Missed Sessions</span>
              <h2>{missedSessions.length}</h2>
              <small>Sessions not completed on time</small>
            </div>
          </section>

          <section className="card" style={{ marginTop: '24px' }}>
            <h2>Daily Study Activity</h2>
            <p className="muted">
              Completed study minutes for each day.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: '12px',
                alignItems: 'end',
                minHeight: '220px',
                marginTop: '24px'
              }}
            >
              {dailyStats.map((day, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'end',
                    height: '200px',
                    gap: '8px'
                  }}
                >
                  <small>{day.minutes}m</small>

                  <div
                    style={{
                      width: '100%',
                      maxWidth: '48px',
                      height: `${Math.max(
                        6,
                        (day.minutes / maxMinutes) * 140
                      )}px`,
                      background: 'linear-gradient(180deg, #8b6cf6, #4b8de8)',
                      borderRadius: '8px 8px 3px 3px',
                      transition: 'height 0.3s ease'
                    }}
                  />

                  <small>{day.label}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="card" style={{ marginTop: '24px' }}>
            <h2>Weekly Session Summary</h2>

            <div style={{ marginTop: '18px' }}>
              <p>Completed: <strong>{completedSessions.length}</strong></p>
              <p>Pending: <strong>{pendingSessions.length}</strong></p>
              <p>Missed: <strong>{missedSessions.length}</strong></p>
              <p>
                Total planned study time:{' '}
                <strong>{(plannedMinutes / 60).toFixed(1)} hours</strong>
              </p>
            </div>

            <div
              style={{
                height: '10px',
                background: 'rgba(128, 128, 128, 0.2)',
                borderRadius: '20px',
                overflow: 'hidden',
                marginTop: '18px'
              }}
            >
              <div
                style={{
                  width: `${completionRate}%`,
                  height: '100%',
                  background: '#258b70',
                  borderRadius: '20px'
                }}
              />
            </div>

            <small className="muted">
              {completionRate}% of this week's sessions completed.
            </small>
          </section>
        </>
      )}
    </main>
  )
}

export default WeeklyAnalytics
