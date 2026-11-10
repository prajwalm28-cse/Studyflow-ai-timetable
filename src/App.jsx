import { useState, useEffect } from 'react'
import TimetableSetup from './components/TimetableSetup'
import WeeklyTimetable from './components/WeeklyTimetable'
import WeeklyAnalytics from './components/WeeklyAnalytics'
import AIRecommendations from './components/AIRecommendations'
import { supabase } from './lib/supabase'
import { generateStudyPlan } from './utils/studyPlanner'
import './App.css'

const today = () => {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .split('T')[0]
}

const emptyForm = {
  name: '',
  time: '',
  study_date: today(),
  duration: '60',
  subject: 'Other',
  priority: 'medium'
}

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [savingTask, setSavingTask] = useState(false)
  const [generatingTimetable, setGeneratingTimetable] = useState(false)

  const completedTasks = tasks.filter(task => task.completed).length

  const progress = tasks.length === 0
    ? 0
    : Math.round((completedTasks / tasks.length) * 100)

  // Check login session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load tasks from Supabase
  useEffect(() => {
    async function loadTasks() {
      if (!session) {
        setTasks([])
        return
      }

      setTasksLoading(true)

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })

      if (error) {
        alert('Could not load tasks: ' + error.message)
      } else {
        setTasks(data.map(task => ({
          id: task.id,
          name: task.title,
          time: task.time || '',
          completed: task.completed,
          study_date: task.study_date,
          duration: task.duration,
          subject: task.subject,
          priority: task.priority || 'medium'
        })))
      }

      setTasksLoading(false)
    }

    loadTasks()
  }, [session])

  // Generate a timetable using tasks, commitments, and study preferences
  async function generateTimetable() {
    if (!session) {
      alert('Please sign in first.')
      return
    }

    setGeneratingTimetable(true)

    try {
      const userId = session.user.id

      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('completed', false)

      if (taskError) throw taskError

      const { data: commitmentData, error: commitmentError } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)

      if (commitmentError) throw commitmentError

      const { data: preferenceData, error: preferenceError } = await supabase
        .from('study_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (preferenceError) throw preferenceError

      const sessions = generateStudyPlan({
        tasks: taskData || [],
        commitments: commitmentData || [],
        preferences: preferenceData || {}
      })

      if (sessions.length === 0) {
        alert(
          'No study sessions could be generated. Check your pending tasks, deadlines, commitments, and preferred study hours.'
        )
        return
      }

      // Remove previous generated sessions from today onwards.
      const { error: deleteError } = await supabase
        .from('study_sessions')
        .delete()
        .eq('user_id', userId)
        .eq('is_generated', true)
        .gte('scheduled_date', today())

      if (deleteError) throw deleteError

      const sessionsToSave = sessions.map(item => ({
        ...item,
        user_id: userId
      }))

      const { error: insertError } = await supabase
        .from('study_sessions')
        .insert(sessionsToSave)

      if (insertError) throw insertError

      alert(`Success! ${sessions.length} study sessions generated. Open Weekly View to see them.`)
    } catch (error) {
      console.error('Timetable generation error:', error)
      alert('Could not generate timetable: ' + error.message)
    } finally {
      setGeneratingTimetable(false)
    }
  }

  // Google sign-in
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })

    if (error) alert(error.message)
  }

  // Sign out
  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) alert(error.message)
  }

  // Open new task form
  function openAddModal() {
    setEditingTask(null)
    setForm({ ...emptyForm, study_date: today() })
    setShowModal(true)
  }

  // Open edit form
  function openEditModal(task) {
    setEditingTask(task)
    setForm({
      name: task.name,
      time: task.time || '',
      study_date: task.study_date || today(),
      duration: String(task.duration || 60),
      subject: task.subject || 'Other',
      priority: task.priority || 'medium'
    })
    setShowModal(true)
  }

  // Update form fields
  function updateForm(event) {
    const { name, value } = event.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  // Add or edit task
  async function saveTask(event) {
    event.preventDefault()

    if (!form.name.trim() || !form.study_date) {
      alert('Please enter a task title and deadline.')
      return
    }

    setSavingTask(true)

    const taskData = {
      title: form.name.trim(),
      time: form.time || '',
      study_date: form.study_date,
      duration: Number(form.duration),
      subject: form.subject,
      priority: form.priority
    }

    let error

    if (editingTask) {
      const result = await supabase
        .from('tasks')
        .update(taskData)
        .eq('id', editingTask.id)
        .eq('user_id', session.user.id)

      error = result.error

      if (!error) {
        setTasks(prev => prev.map(task =>
          task.id === editingTask.id
            ? {
                ...task,
                name: taskData.title,
                time: taskData.time,
                study_date: taskData.study_date,
                duration: taskData.duration,
                subject: taskData.subject,
                priority: taskData.priority
              }
            : task
        ))
      }
    } else {
      const result = await supabase
        .from('tasks')
        .insert({
          ...taskData,
          user_id: session.user.id,
          completed: false
        })
        .select()
        .single()

      error = result.error

      if (!error) {
        setTasks(prev => [...prev, {
          id: result.data.id,
          name: result.data.title,
          time: result.data.time || '',
          study_date: result.data.study_date,
          duration: result.data.duration,
          subject: result.data.subject,
          priority: result.data.priority || 'medium',
          completed: result.data.completed
        }])
      }
    }

    setSavingTask(false)

    if (error) {
      alert('Could not save task: ' + error.message)
      return
    }

    setShowModal(false)
    setEditingTask(null)
    setForm(emptyForm)
  }

  // Toggle task completion
  async function toggleTask(task) {
    const newCompleted = !task.completed

    setTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, completed: newCompleted }
        : t
    ))

    const { error } = await supabase
      .from('tasks')
      .update({ completed: newCompleted })
      .eq('id', task.id)
      .eq('user_id', session.user.id)

    if (error) {
      alert('Could not update task: ' + error.message)

      setTasks(prev => prev.map(t =>
        t.id === task.id
          ? { ...t, completed: task.completed }
          : t
      ))
    }
  }

  // Delete task
  async function deleteTask(task) {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${task.name}"?`
    )

    if (!confirmDelete) return

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', task.id)
      .eq('user_id', session.user.id)

    if (error) {
      alert('Could not delete task: ' + error.message)
      return
    }

    setTasks(prev => prev.filter(t => t.id !== task.id))
  }

  // Loading screen
  if (loading) {
    return (
      <div className="app">
        <main className="main">
          <h2>Loading StudyFlow...</h2>
        </main>
      </div>
    )
  }

  // Login screen
  if (!session) {
    return (
      <div className="app">
        <main className="main">
          <div className="card">
            <h1>✦ StudyFlow AI</h1>
            <h2>Welcome to StudyFlow</h2>
            <p className="muted">
              Sign in to manage your study timetable and track your progress.
            </p>
            <button className="primary" onClick={signInWithGoogle}>
              Continue with Google
            </button>
          </div>
        </main>
      </div>
    )
  }

  // Timetable setup page
  if (currentPage === 'timetable') {
    return (
      <TimetableSetup
        onBack={() => setCurrentPage('dashboard')}
      />
    )
  }

  // Weekly timetable page
  if (currentPage === 'weekly') {
    return (
      <WeeklyTimetable
        onBack={() => setCurrentPage('dashboard')}
      />
    )
  }

  if (currentPage === 'analytics') {
    return (
      <WeeklyAnalytics
        onBack={() => setCurrentPage('dashboard')}
      />
    )
  }

  // AI study recommendations page
  if (currentPage === 'recommendations') {
  return (
    <AIRecommendations
      onBack={() => setCurrentPage('dashboard')}
      onNavigate={(page) => setCurrentPage(page)}
    />
  )
}

  // Dashboard
  return (
    <div className="app">
      <aside className="sidebar">
        <h2>✦ StudyFlow</h2>

        <p className="menu-title">WORKSPACE</p>

        <nav>
          <a
            className={currentPage === 'dashboard' ? 'active' : ''}
            onClick={() => setCurrentPage('dashboard')}
            style={{ cursor: 'pointer' }}
          >
            ▦ Dashboard
          </a>

          <a
            className={currentPage === 'timetable' ? 'active' : ''}
            onClick={() => setCurrentPage('timetable')}
            style={{ cursor: 'pointer' }}
          >
            ◷ My Timetable
          </a>

          <a
            className={currentPage === 'weekly' ? 'active' : ''}
            onClick={() => setCurrentPage('weekly')}
            style={{ cursor: 'pointer' }}
          >
            ▦ Weekly View
          </a>

          <a>✓ My Tasks</a>
          <a
            className={currentPage === 'analytics' ? 'active' : ''}
            onClick={() => setCurrentPage('analytics')}
            style={{ cursor: 'pointer' }}
          >
            ◉ Analytics
          </a>
        </nav>

        <p className="menu-title">TOOLS</p>

        <nav>
          <a>◴ Pomodoro Timer</a>
          <a
            className={currentPage === 'recommendations' ? 'active' : ''}
            onClick={() => setCurrentPage('recommendations')}
            style={{ cursor: 'pointer' }}
          >
            ✧ AI Recommendations
          </a>
          <a>⚙ Settings</a>
        </nav>

        <div className="profile">
          <div className="avatar">P</div>
          <div>
            <strong>
              {session.user.user_metadata?.full_name || 'Student'}
            </strong>
            <small>My workspace</small>
          </div>
        </div>

        <button onClick={signOut}>Sign Out</button>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="muted">MONDAY, YOUR NEW BEGINNING</p>
            <h1>Good morning! 👋</h1>
            <p className="muted">Let's make today productive.</p>
          </div>

          <div className="header-actions">
            <button
              className="primary"
              onClick={generateTimetable}
              disabled={generatingTimetable}
            >
              {generatingTimetable ? 'Generating...' : '✦ Generate Timetable'}
            </button>
            <button className="primary" onClick={openAddModal}>
              + Add Task
            </button>
          </div>
        </header>

        <section className="stats">
          <div className="card">
            <span>📚 Total Study Hours</span>
            <h2>
              {(tasks.reduce((sum, task) => sum + Number(task.duration || 0), 0) / 60).toFixed(1)} hrs
            </h2>
            <small>Planned study time</small>
          </div>

          <div className="card">
            <span>✓ Tasks Completed</span>
            <h2>{completedTasks} / {tasks.length}</h2>
            <small>{progress}% completion</small>
          </div>

          <div className="card">
            <span>🔥 Current Streak</span>
            <h2>7 Days</h2>
            <small>Keep it going!</small>
          </div>

          <div className="card">
            <span>⏱ Focus Time</span>
            <h2>3.5 hrs</h2>
            <small>Today's progress</small>
          </div>
        </section>

        <section className="content-grid">
          <div className="card timetable">
            <div className="section-heading">
              <div>
                <h2>Study Schedule</h2>
                <p className="muted">Your planned study sessions</p>
              </div>
            </div>

            {tasksLoading ? (
              <p className="muted">Loading your tasks...</p>
            ) : tasks.length === 0 ? (
              <p className="muted">
                No tasks yet. Click + Add Task to get started!
              </p>
            ) : (
              tasks.map(task => (
                <div className="session" key={task.id}>
                  <span>{task.time || 'Not scheduled'}</span>

                  <div className="task-details">
                    <strong className={task.completed ? 'task-completed' : ''}>
                      {task.name}
                    </strong>
                    <small>
                      {task.subject || 'Other'} · {task.duration || 60} min
                    </small>
                    <small>
                      Deadline: {task.study_date || 'Not set'}
                    </small>
                    <small>
                      Priority: {task.priority || 'medium'}
                    </small>
                  </div>

                  <label>
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(task)}
                    />
                    Done
                  </label>

                  <button
                    type="button"
                    onClick={() => openEditModal(task)}
                    title="Edit task"
                  >
                    ✏️
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteTask(task)}
                    title="Delete task"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="card progress">
            <h2>Weekly Progress</h2>
            <p className="muted">Your study consistency</p>

            <div className="progress-number">{progress}%</div>

            <div className="progress-bar">
              <div style={{ width: `${progress}%` }} />
            </div>

            <p className="muted">
              {completedTasks} of {tasks.length} planned tasks completed.
            </p>

            <hr />

            <h3>AI Study Insight ✨</h3>
            <p className="insight">
              You're building a great habit! Try focusing on Data
              Structures for 30 minutes daily to improve consistency.
            </p>
          </div>
        </section>
      </main>

      {/* Add / Edit Task Modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowModal(false)}
        >
          <div
            className="task-modal"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="modal-icon">✦</span>
                <h2>{editingTask ? 'Edit Study Task' : 'Create a Study Task'}</h2>
                <p className="muted">
                  Add a task and let StudyFlow find a suitable study time.
                </p>
              </div>

              <button
                className="modal-close"
                type="button"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={saveTask}>
              <label htmlFor="taskName">Task title</label>
              <input
                id="taskName"
                name="name"
                type="text"
                placeholder="e.g. Study Data Structures"
                value={form.name}
                onChange={updateForm}
                required
              />

              <label htmlFor="taskSubject">Subject</label>
              <select
                id="taskSubject"
                name="subject"
                value={form.subject}
                onChange={updateForm}
              >
                <option>DBMS</option>
                <option>Artificial Intelligence</option>
                <option>Computer Networks</option>
                <option>Data Structures</option>
                <option>Mathematics</option>
                <option>Cyber Law</option>
                <option>Programming</option>
                <option>Other</option>
              </select>

              <label htmlFor="taskPriority">Task priority</label>
              <select
                id="taskPriority"
                name="priority"
                value={form.priority}
                onChange={updateForm}
              >
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>

              <label htmlFor="taskDate">Deadline</label>
              <input
                id="taskDate"
                name="study_date"
                type="date"
                min={today()}
                value={form.study_date}
                onChange={updateForm}
                required
              />

              <label htmlFor="taskTime">
                Preferred study time (optional)
              </label>
              <input
                id="taskTime"
                name="time"
                type="time"
                value={form.time}
                onChange={updateForm}
              />

              <small className="muted">
                Leave this empty to let StudyFlow choose an available time.
              </small>

              <label htmlFor="taskDuration">Estimated study duration</label>
              <select
                id="taskDuration"
                name="duration"
                value={form.duration}
                onChange={updateForm}
              >
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1 hour 30 minutes</option>
                <option value="120">2 hours</option>
                <option value="150">2 hours 30 minutes</option>
                <option value="180">3 hours</option>
              </select>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary save-button"
                  disabled={savingTask}
                >
                  {savingTask
                    ? 'Saving...'
                    : editingTask
                      ? 'Save Changes'
                      : '+ Save Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App