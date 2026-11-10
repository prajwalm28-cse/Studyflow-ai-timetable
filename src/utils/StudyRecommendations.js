
const getLocalDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildStudyRecommendations({
  tasks = [],
  sessions = [],
  dailyTargetMinutes = 120
}) {
  const recommendations = []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayKey = getLocalDateKey(today)

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - 6)

  const weekStartKey = getLocalDateKey(weekStart)

  const weeklySessions = sessions.filter(session =>
    session.scheduled_date >= weekStartKey &&
    session.scheduled_date <= todayKey
  )

  const completedSessions = weeklySessions.filter(
    session => session.is_completed
  )

  const completedMinutes = completedSessions.reduce(
    (total, session) => total + Number(session.duration || 0),
    0
  )

  const activeDays = new Set(
    completedSessions.map(session => session.scheduled_date)
  ).size

  const pendingTasks = tasks.filter(task => !task.completed)

  const urgentTasks = pendingTasks.filter(task => {
    if (!task.study_date) return false

    const deadline = new Date(`${task.study_date}T00:00:00`)
    const daysLeft = Math.ceil(
      (deadline - today) / (1000 * 60 * 60 * 24)
    )

    return daysLeft >= 0 && daysLeft <= 3
  })

  // Recommendation 1: Upcoming deadlines
  if (urgentTasks.length > 0) {
    recommendations.push({
      type: 'priority',
      title: 'Upcoming deadlines',
      message: `You have ${urgentTasks.length} pending task(s) due within the next 3 days. Give these tasks priority.`,
      action: 'Focus on urgent tasks',
      level: 'high'
    })
  }

  // Recommendation 2: Study consistency
  if (activeDays <= 2) {
    recommendations.push({
      type: 'consistency',
      title: 'Build a consistent routine',
      message: `You completed study sessions on ${activeDays} of the last 7 days. Try studying for at least 30 minutes on more days.`,
      action: 'Build your study habit',
      level: 'medium'
    })
  } else {
    recommendations.push({
      type: 'consistency',
      title: 'Good study consistency',
      message: `You studied on ${activeDays} of the last 7 days. Keep maintaining this routine.`,
      action: 'Keep it going',
      level: 'low'
    })
  }

  // Recommendation 3: Daily study target
  const averageMinutes = Math.round(completedMinutes / 7)

  if (averageMinutes < dailyTargetMinutes) {
    recommendations.push({
      type: 'duration',
      title: 'Increase focused study time',
      message: `Your average completed study time is ${averageMinutes} minutes per day. Your daily target is ${dailyTargetMinutes} minutes. Gradually work towards your target.`,
      action: 'Improve daily study time',
      level: 'medium'
    })
  } else {
    recommendations.push({
      type: 'duration',
      title: 'Daily study target achieved',
      message: `Your average completed study time is ${averageMinutes} minutes per day, meeting your ${dailyTargetMinutes}-minute target.`,
      action: 'Maintain your progress',
      level: 'low'
    })
  }

  // Recommendation 4: Missed or unfinished sessions
  const missedSessions = weeklySessions.filter(session => {
    if (session.is_completed) return false

    const sessionEnd = new Date(
      `${session.scheduled_date}T${session.end_time}`
    )

    return sessionEnd < new Date()
  })

  if (missedSessions.length > 0) {
    recommendations.push({
      type: 'recovery',
      title: 'Recover missed sessions',
      message: `You have ${missedSessions.length} unfinished past session(s). Reschedule them into available study slots.`,
      action: 'Review missed sessions',
      level: 'high'
    })
  }

  // Recommendation 5: Pending workload
  if (pendingTasks.length === 0) {
    recommendations.push({
      type: 'workload',
      title: 'All tasks completed!',
      message: 'You have no pending tasks. Add your next learning goals to keep progressing.',
      action: 'Set a new goal',
      level: 'low'
    })
  } else {
    recommendations.push({
      type: 'workload',
      title: 'Manage your pending workload',
      message: `You have ${pendingTasks.length} pending task(s). Break larger tasks into smaller study sessions.`,
      action: 'Review pending tasks',
      level: 'medium'
    })
  }

  return {
    completedMinutes,
    activeDays,
    averageMinutes,
    pendingTaskCount: pendingTasks.length,
    recommendations
  }
}
