
// StudyFlow AI - Priority-Based Rule-Based Study Planner

const MIN_SESSION = 30
const MAX_SESSION = 60
const MAX_TASK_MINUTES_PER_DAY = 60

const priorityRank = {
  high: 1,
  medium: 2,
  low: 3
}

function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function toTime(minutes) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getFreeSlots(dayStart, dayEnd, commitments) {
  const busy = commitments
    .map(block => ({
      start: toMinutes(block.start_time),
      end: toMinutes(block.end_time)
    }))
    .filter(block => block.end > dayStart && block.start < dayEnd)
    .sort((a, b) => a.start - b.start)

  const slots = []
  let cursor = dayStart

  for (const block of busy) {
    const start = Math.max(block.start, dayStart)
    const end = Math.min(block.end, dayEnd)

    if (start > cursor) {
      slots.push({ start: cursor, end: start })
    }

    cursor = Math.max(cursor, end)
  }

  if (cursor < dayEnd) {
    slots.push({ start: cursor, end: dayEnd })
  }

  return slots
}

export function generateStudyPlan({
  tasks = [],
  commitments = [],
  preferences = {},
  startDate = new Date()
}) {
  const dailyTarget = Number(preferences.daily_study_minutes) || 120
  const studyStart = preferences.preferred_start || '16:00'
  const studyEnd = preferences.preferred_end || '22:00'

  const windowStart = toMinutes(studyStart)
  const windowEnd = toMinutes(studyEnd)

  if (windowEnd <= windowStart) {
    throw new Error('Your preferred study end time must be after the start time.')
  }

  const today = new Date(startDate)
  today.setHours(0, 0, 0, 0)

  const validTasks = tasks
    .filter(task => {
      return (
        task.title &&
        task.study_date &&
        Number(task.duration) > 0 &&
        task.study_date >= formatDate(today)
      )
    })
    .map(task => ({
      ...task,
      remaining: Number(task.duration),
      priority: priorityRank[task.priority] || priorityRank.medium
    }))
    .sort((a, b) => {
      // High priority first, then earliest deadline.
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }

      return a.study_date.localeCompare(b.study_date)
    })

  const generatedSessions = []
  const fallbackMode = validTasks.length === 0

  const lastDeadline = validTasks.length
    ? new Date(`${validTasks[validTasks.length - 1].study_date}T00:00:00`)
    : new Date(today)

  const totalDays = fallbackMode
    ? 7
    : Math.min(
        30,
        Math.floor((lastDeadline - today) / 86400000) + 1
      )

  for (let day = 0; day < totalDays; day++) {
    const currentDate = new Date(today)
    currentDate.setDate(today.getDate() + day)

    const dateString = formatDate(currentDate)
    const dayOfWeek = currentDate.getDay()

    const dailyCommitments = commitments.filter(block => {
      return block.is_active !== false &&
        Number(block.day_of_week) === dayOfWeek
    })

    const slots = getFreeSlots(
      windowStart,
      windowEnd,
      dailyCommitments
    )

    let minutesScheduled = 0
    const taskMinutesToday = new Map()

    for (const slot of slots) {
      let cursor = slot.start

      while (
        cursor + MIN_SESSION <= slot.end &&
        minutesScheduled < dailyTarget
      ) {
        const available = Math.min(
          slot.end - cursor,
          dailyTarget - minutesScheduled,
          MAX_SESSION
        )

        if (available < MIN_SESSION) break

        // Select the highest-priority eligible task.
        const selectedTask = validTasks.find(task => {
          const scheduledToday = taskMinutesToday.get(task.id) || 0

          return (
            task.remaining >= MIN_SESSION &&
            task.study_date >= dateString &&
            scheduledToday < MAX_TASK_MINUTES_PER_DAY
          )
        })

        let title = 'General Revision'
        let subject = 'Other'
        let taskId = null

        if (selectedTask) {
          title = selectedTask.title
          subject = selectedTask.subject || 'Other'
          taskId = selectedTask.id
        } else if (!fallbackMode) {
          break
        }

        const scheduledToday = selectedTask
          ? taskMinutesToday.get(selectedTask.id) || 0
          : 0

        const taskDailyRemaining = selectedTask
          ? MAX_TASK_MINUTES_PER_DAY - scheduledToday
          : MAX_SESSION

        const duration = Math.min(
          available,
          selectedTask ? selectedTask.remaining : MAX_SESSION,
          taskDailyRemaining
        )

        if (duration < MIN_SESSION) break

        generatedSessions.push({
          task_id: taskId,
          title,
          subject,
          scheduled_date: dateString,
          start_time: toTime(cursor),
          end_time: toTime(cursor + duration),
          duration,
          is_completed: false,
          is_generated: true
        })

        if (selectedTask) {
          selectedTask.remaining -= duration

          taskMinutesToday.set(
            selectedTask.id,
            scheduledToday + duration
          )
        }

        cursor += duration
        minutesScheduled += duration
      }

      if (minutesScheduled >= dailyTarget) break
    }
  }

  return generatedSessions
}
