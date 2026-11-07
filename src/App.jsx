
import './App.css'

function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <h2>✦ StudyFlow</h2>
        <p className="menu-title">WORKSPACE</p>
        <nav>
          <a className="active">▦ Dashboard</a>
          <a>◷ My Timetable</a>
          <a>✓ My Tasks</a>
          <a>◉ Analytics</a>
        </nav>

        <p className="menu-title">TOOLS</p>
        <nav>
          <a>◴ Pomodoro Timer</a>
          <a>✧ AI Recommendations</a>
          <a>⚙ Settings</a>
        </nav>

        <div className="profile">
          <div className="avatar">P</div>
          <div>
            <strong>Student</strong>
            <small>My workspace</small>
          </div>
        </div>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="muted">MONDAY, YOUR NEW BEGINNING</p>
            <h1>Good morning! 👋</h1>
            <p className="muted">Let's make today productive.</p>
          </div>
          <button className="primary">+ Add Task</button>
        </header>

        <section className="stats">
          <div className="card">
            <span>📚 Total Study Hours</span>
            <h2>24.5 hrs</h2>
            <small>↑ 12% this week</small>
          </div>
          <div className="card">
            <span>✓ Tasks Completed</span>
            <h2>18 / 25</h2>
            <small>72% completion</small>
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
                <h2>Today's Schedule</h2>
                <p className="muted">Your planned study sessions</p>
              </div>
              <span className="tag">View all →</span>
            </div>

            <div className="session">
              <span>09:00 AM</span>
              <div><strong>Data Structures</strong><small>Study session · 1 hour</small></div>
              <span className="tag">In progress</span>
            </div>
            <div className="session">
              <span>10:30 AM</span>
              <div><strong>Database Management</strong><small>Revision · 1 hour</small></div>
              <span className="tag">Upcoming</span>
            </div>
            <div className="session">
              <span>02:00 PM</span>
              <div><strong>Computer Networks</strong><small>Practice · 90 minutes</small></div>
              <span className="tag">Upcoming</span>
            </div>
            <div className="session">
              <span>04:00 PM</span>
              <div><strong>Python Programming</strong><small>Coding practice · 1 hour</small></div>
              <span className="tag">Upcoming</span>
            </div>
          </div>

          <div className="card progress">
            <h2>Weekly Progress</h2>
            <p className="muted">Your study consistency</p>
            <div className="progress-number">72%</div>
            <div className="progress-bar"><div /></div>
            <p className="muted">18 of 25 planned tasks completed.</p>
            <hr />
            <h3>AI Study Insight ✨</h3>
            <p className="insight">You're building a great habit! Try focusing on Data Structures for 30 minutes daily to improve consistency.</p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
