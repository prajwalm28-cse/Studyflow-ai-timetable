import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildStudyRecommendations } from '../utils/studyRecommendations'

export default function AIRecommendations({ onBack, onNavigate }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [expandedTips, setExpandedTips] = useState({})

  useEffect(() => {
    let isMounted = true

    async function loadRecommendations() {
      try {
        setLoading(true)
        setError('')

        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser()

        if (userError) throw userError
        if (!user) throw new Error('Please sign in to view recommendations.')

        const today = new Date()
        const todayKey = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, '0'),
          String(today.getDate()).padStart(2, '0')
        ].join('-')

        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - 6)

        const weekStartKey = [
          weekStart.getFullYear(),
          String(weekStart.getMonth() + 1).padStart(2, '0'),
          String(weekStart.getDate()).padStart(2, '0')
        ].join('-')

        const [
          tasksResult,
          sessionsResult,
          preferencesResult
        ] = await Promise.all([
          supabase
            .from('tasks')
            .select('*')
            .eq('user_id', user.id),

          supabase
            .from('study_sessions')
            .select('*')
            .eq('user_id', user.id)
            .gte('scheduled_date', weekStartKey)
            .lte('scheduled_date', todayKey),

          supabase
            .from('study_preferences')
            .select('daily_study_minutes')
            .eq('user_id', user.id)
            .maybeSingle()
        ])

        if (tasksResult.error) throw tasksResult.error
        if (sessionsResult.error) throw sessionsResult.error
        if (preferencesResult.error) throw preferencesResult.error

        const result = buildStudyRecommendations({
          tasks: tasksResult.data || [],
          sessions: sessionsResult.data || [],
          dailyTargetMinutes:
            preferencesResult.data?.daily_study_minutes || 120
        })

        if (isMounted) {
          setAnalysis(result)
          setExpandedTips({})
        }
      } catch (err) {
        console.error('Recommendation error:', err)

        if (isMounted) {
          setError(err.message || 'Unable to load recommendations.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadRecommendations()

    return () => {
      isMounted = false
    }
  }, [refreshKey])

  const styles = {
    page: {
      minHeight: '100vh',
      padding: '35px',
      color: '#f5f3ff',
      background: '#0b0a12'
    },
    card: {
      background: '#171522',
      border: '1px solid #302b43',
      borderRadius: '16px',
      padding: '22px',
      marginBottom: '16px'
    },
    button: {
      background: '#8b5cf6',
      color: 'white',
      border: 'none',
      borderRadius: '9px',
      padding: '11px 18px',
      cursor: 'pointer',
      fontWeight: '600'
    },
    secondaryButton: {
      background: '#252137',
      color: '#c4b5fd',
      border: '1px solid #51446f',
      borderRadius: '9px',
      padding: '9px 14px',
      cursor: 'pointer',
      fontWeight: '600'
    }
  }

  const levelColors = {
    high: '#fb7185',
    medium: '#fbbf24',
    low: '#34d399'
  }

  const studyTips = {
    priority: 'Start with the task that has the closest deadline. Break it into 25–30 minute focused sessions and complete the most important part first.',
    consistency: 'Choose a fixed study time and begin with just 30 minutes. A small daily session is easier to maintain than occasional long sessions.',
    duration: 'Add one extra 25-minute focused session to your daily routine. Take a short break between sessions.',
    recovery: 'Open your weekly timetable, identify missed sessions, and move them to free time slots without overlapping your commitments.',
    workload: 'Choose one pending task, divide it into smaller steps, and schedule each step separately.'
  }

  function handleRecommendationAction(item) {
    if (item.type === 'priority' || item.type === 'workload') {
      onNavigate?.('dashboard')
      return
    }

    if (item.type === 'recovery') {
      onNavigate?.('weekly')
      return
    }

    setExpandedTips(prev => ({
      ...prev,
      [item.type]: !prev[item.type]
    }))
  }

  return (
    <div style={styles.page}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <button style={styles.button} onClick={onBack}>
          ← Back to Dashboard
        </button>

        <button
          style={styles.secondaryButton}
          onClick={() => setRefreshKey(prev => prev + 1)}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : '↻ Refresh Insights'}
        </button>
      </div>

      <div style={{ marginTop: '30px', marginBottom: '28px' }}>
        <p style={{ color: '#a78bfa', letterSpacing: '2px' }}>
          YOUR PERSONAL STUDY ASSISTANT
        </p>

        <h1 style={{ fontSize: '32px', margin: '10px 0' }}>
          AI Study Recommendations ✨
        </h1>

        <p style={{ color: '#aaa5bd' }}>
          Insights based on your study activity and pending tasks.
        </p>
      </div>

      {loading && (
        <div style={styles.card}>
          Analysing your study activity...
        </div>
      )}

      {error && (
        <div style={{ ...styles.card, color: '#fb7185' }}>
          {error}
        </div>
      )}

      {!loading && !error && analysis && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              marginBottom: '25px'
            }}
          >
            <div style={styles.card}>
              <p style={{ color: '#aaa5bd' }}>Completed Study Time</p>
              <h2>{(analysis.completedMinutes / 60).toFixed(1)} hrs</h2>
            </div>

            <div style={styles.card}>
              <p style={{ color: '#aaa5bd' }}>Active Study Days</p>
              <h2>{analysis.activeDays} / 7</h2>
            </div>

            <div style={styles.card}>
              <p style={{ color: '#aaa5bd' }}>Daily Average</p>
              <h2>{analysis.averageMinutes} min</h2>
            </div>

            <div style={styles.card}>
              <p style={{ color: '#aaa5bd' }}>Pending Tasks</p>
              <h2>{analysis.pendingTaskCount}</h2>
            </div>
          </div>

          <h2 style={{ marginBottom: '18px' }}>
            Your Recommendations
          </h2>

          {analysis.recommendations.map((item, index) => (
            <div
              key={`${item.type}-${index}`}
              style={styles.card}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <h3 style={{ margin: 0 }}>
                  {item.title}
                </h3>

                <span
                  style={{
                    color: levelColors[item.level],
                    border: `1px solid ${levelColors[item.level]}`,
                    borderRadius: '20px',
                    padding: '5px 12px',
                    fontSize: '12px',
                    textTransform: 'uppercase'
                  }}
                >
                  {item.level} priority
                </span>
              </div>

              <p style={{ color: '#c4bfd3', lineHeight: 1.7 }}>
                {item.message}
              </p>

              <button
                style={styles.secondaryButton}
                onClick={() => handleRecommendationAction(item)}
              >
                {item.type === 'priority' || item.type === 'workload'
                  ? 'View Pending Tasks →'
                  : item.type === 'recovery'
                    ? 'Review Missed Sessions →'
                    : expandedTips[item.type]
                      ? 'Hide Study Tip'
                      : 'Show Practical Study Tip →'}
              </button>

              {expandedTips[item.type] && (
                <div
                  style={{
                    marginTop: '15px',
                    padding: '15px',
                    borderRadius: '10px',
                    background: '#211c32',
                    border: '1px solid #51446f'
                  }}
                >
                  <strong style={{ color: '#c4b5fd' }}>
                    ✦ Your next step
                  </strong>

                  <p style={{ color: '#c4bfd3', lineHeight: 1.7, marginBottom: 0 }}>
                    {studyTips[item.type] || 'Keep following your study routine and review your progress regularly.'}
                  </p>
                </div>
              )}
            </div>
          ))}

          <p style={{ color: '#817b94', fontSize: '13px' }}>
            Recommendations are generated using your study data and
            rule-based analysis. Refresh insights to load the latest data.
          </p>
        </>
      )}
    </div>
  )
}