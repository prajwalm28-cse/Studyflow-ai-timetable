
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './TimetableSetup.css'

const templates = [
  {
    id: 'college',
    name: 'College Student',
    description: 'College, travel, gym and evening study',
    blocks: [
      { title: 'College', block_type: 'college', start_time: '08:00', end_time: '16:00' },
      { title: 'Travel', block_type: 'travel', start_time: '06:15', end_time: '08:00' },
      { title: 'Gym', block_type: 'gym', start_time: '18:30', end_time: '20:30' }
    ]
  },
  {
    id: 'professional',
    name: 'Working Professional',
    description: 'Work hours with evening learning',
    blocks: [
      { title: 'Work', block_type: 'work', start_time: '09:00', end_time: '17:00' }
    ]
  },
  {
    id: 'flexible',
    name: 'Flexible Routine',
    description: 'Build your own daily routine',
    blocks: []
  }
]

const days = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 }
]

const emptyBlock = {
  title: '',
  block_type: 'other',
  start_time: '',
  end_time: '',
  days: [1, 2, 3, 4, 5]
}

function TimetableSetup({ onBack }) {
  const [mode, setMode] = useState('template')
  const [selectedTemplate, setSelectedTemplate] = useState('college')
  const [blocks, setBlocks] = useState([])
  const [newBlock, setNewBlock] = useState(emptyBlock)

  const [dailyMinutes, setDailyMinutes] = useState(120)
  const [preferredStart, setPreferredStart] = useState('16:00')
  const [preferredEnd, setPreferredEnd] = useState('22:00')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Load saved timetable and preferences
  useEffect(() => {
    async function loadSchedule() {
      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData.user) {
        alert('Please sign in again.')
        setLoading(false)
        return
      }

      const userId = userData.user.id

      const [scheduleResult, preferenceResult] = await Promise.all([
        supabase
          .from('schedule_blocks')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('day_of_week'),

        supabase
          .from('study_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()
      ])

      if (scheduleResult.error) {
        alert('Could not load timetable: ' + scheduleResult.error.message)
      } else {
        // Group matching activities across different weekdays
        const grouped = {}

        scheduleResult.data.forEach(row => {
          const key = [
            row.title,
            row.block_type,
            row.start_time.slice(0, 5),
            row.end_time.slice(0, 5)
          ].join('|')

          if (!grouped[key]) {
            grouped[key] = {
              title: row.title,
              block_type: row.block_type,
              start_time: row.start_time.slice(0, 5),
              end_time: row.end_time.slice(0, 5),
              days: []
            }
          }

          grouped[key].days.push(row.day_of_week)
        })

        setBlocks(Object.values(grouped))
      }

      if (preferenceResult.error) {
        alert('Could not load preferences: ' + preferenceResult.error.message)
      } else if (preferenceResult.data) {
        const preferences = preferenceResult.data

        setMode(
          preferences.scheduling_mode === 'template'
            ? 'template'
            : 'manual'
        )

        setDailyMinutes(preferences.daily_study_minutes)
        setPreferredStart(preferences.preferred_start.slice(0, 5))
        setPreferredEnd(preferences.preferred_end.slice(0, 5))
      }

      setLoading(false)
    }

    loadSchedule()
  }, [])

  // Select a template
  function chooseTemplate(template) {
    setSelectedTemplate(template.id)

    setBlocks(template.blocks.map(block => ({
      ...block,
      days: [1, 2, 3, 4, 5]
    })))
  }

  // Update new activity fields
  function updateNewBlock(event) {
    const { name, value } = event.target
    setNewBlock(prev => ({ ...prev, [name]: value }))
  }

  // Select weekdays
  function toggleDay(day) {
    setNewBlock(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(item => item !== day)
        : [...prev.days, day]
    }))
  }

  // Add commitment
  function addBlock(event) {
    event.preventDefault()

    if (
      !newBlock.title.trim() ||
      !newBlock.start_time ||
      !newBlock.end_time ||
      newBlock.days.length === 0
    ) {
      alert('Please complete all schedule details.')
      return
    }

    if (newBlock.end_time <= newBlock.start_time) {
      alert('End time must be later than start time.')
      return
    }

    setBlocks(prev => [
      ...prev,
      {
        title: newBlock.title.trim(),
        block_type: newBlock.block_type,
        start_time: newBlock.start_time,
        end_time: newBlock.end_time,
        days: [...newBlock.days]
      }
    ])

    setNewBlock(emptyBlock)
  }

  // Remove commitment
  function removeBlock(index) {
    setBlocks(prev => prev.filter((_, i) => i !== index))
  }

  // Save timetable
  async function saveSchedule() {
    const { data: userData, error: userError } =
      await supabase.auth.getUser()

    if (userError || !userData.user) {
      alert('Please sign in again.')
      return
    }

    if (preferredEnd <= preferredStart) {
      alert('Preferred study end time must be later than start time.')
      return
    }

    setSaving(true)

    const userId = userData.user.id

    const rows = blocks.flatMap(block =>
      block.days.map(day => ({
        user_id: userId,
        title: block.title,
        block_type: block.block_type,
        day_of_week: day,
        start_time: block.start_time,
        end_time: block.end_time,
        is_active: true
      }))
    )

    // Remove old schedule records
    const { error: deleteError } = await supabase
      .from('schedule_blocks')
      .delete()
      .eq('user_id', userId)

    if (deleteError) {
      setSaving(false)
      alert('Could not update timetable: ' + deleteError.message)
      return
    }

    // Insert updated schedule records
    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('schedule_blocks')
        .insert(rows)

      if (insertError) {
        setSaving(false)
        alert('Could not save commitments: ' + insertError.message)
        return
      }
    }

    // Save study preferences
    const { error: preferenceError } = await supabase
      .from('study_preferences')
      .upsert({
        user_id: userId,
        scheduling_mode: mode === 'template' ? 'template' : 'manual',
        daily_study_minutes: Number(dailyMinutes),
        preferred_start: preferredStart,
        preferred_end: preferredEnd,
        updated_at: new Date().toISOString()
      })

    setSaving(false)

    if (preferenceError) {
      alert('Commitments saved, but preferences failed: ' + preferenceError.message)
      return
    }

    alert('Your timetable has been saved successfully!')
  }

  if (loading) {
    return (
      <main className="main timetable-setup">
        <h2>Loading your timetable...</h2>
      </main>
    )
  }

  return (
    <main className="main timetable-setup">

      <header className="setup-header">
        <div>
          <p className="muted">STUDYFLOW WORKSPACE</p>
          <h1>Timetable Setup ✦</h1>
          <p className="muted">
            Build a routine that works around your life.
          </p>
        </div>

        <button className="cancel-button" onClick={onBack}>
          ← Dashboard
        </button>
      </header>

      <section className="card setup-card">
        <h2>Choose your setup method</h2>

        <div className="setup-modes">
          <button
            className={mode === 'template' ? 'mode-card selected' : 'mode-card'}
            onClick={() => setMode('template')}
          >
            <span>✦</span>
            <strong>Preset Templates</strong>
            <small>Start with a ready-made routine.</small>
          </button>

          <button
            className={mode === 'manual' ? 'mode-card selected' : 'mode-card'}
            onClick={() => setMode('manual')}
          >
            <span>⚙</span>
            <strong>Manual Setup</strong>
            <small>Create your own routine.</small>
          </button>
        </div>
      </section>

      {mode === 'template' && (
        <section className="card setup-card">
          <h2>Choose a template</h2>

          <div className="template-grid">
            {templates.map(template => (
              <button
                key={template.id}
                className={
                  selectedTemplate === template.id
                    ? 'template-card selected'
                    : 'template-card'
                }
                onClick={() => chooseTemplate(template)}
              >
                <strong>{template.name}</strong>
                <small>{template.description}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card setup-card">
        <h2>Fixed commitments</h2>
        <p className="muted">
          Add activities when you are unavailable for studying.
        </p>

        <form className="block-form" onSubmit={addBlock}>
          <label>Activity name</label>

          <input
            name="title"
            value={newBlock.title}
            onChange={updateNewBlock}
            placeholder="e.g. College, Gym, Travel"
            required
          />

          <label>Activity type</label>

          <select
            name="block_type"
            value={newBlock.block_type}
            onChange={updateNewBlock}
          >
            <option value="college">College</option>
            <option value="work">Work</option>
            <option value="travel">Travel</option>
            <option value="gym">Gym</option>
            <option value="sleep">Sleep</option>
            <option value="other">Other</option>
          </select>

          <div className="time-fields">
            <div>
              <label>Start time</label>
              <input
                type="time"
                name="start_time"
                value={newBlock.start_time}
                onChange={updateNewBlock}
                required
              />
            </div>

            <div>
              <label>End time</label>
              <input
                type="time"
                name="end_time"
                value={newBlock.end_time}
                onChange={updateNewBlock}
                required
              />
            </div>
          </div>

          <label>Repeat on</label>

          <div className="day-picker">
            {days.map(day => (
              <button
                key={day.value}
                type="button"
                className={
                  newBlock.days.includes(day.value) ? 'day selected' : 'day'
                }
                onClick={() => toggleDay(day.value)}
              >
                {day.label.slice(0, 3)}
              </button>
            ))}
          </div>

          <button className="primary" type="submit">
            + Add Commitment
          </button>
        </form>

        <div className="saved-blocks">
          {blocks.length === 0 ? (
            <p className="muted">No commitments added yet.</p>
          ) : (
            blocks.map((block, index) => (
              <div className="saved-block" key={index}>
                <div>
                  <strong>{block.title}</strong>
                  <small>
                    {block.start_time} – {block.end_time}
                  </small>
                  <small>
                    {block.days
                      .map(day =>
                        days.find(item => item.value === day)?.label.slice(0, 3)
                      )
                      .join(', ')}
                  </small>
                </div>

                <button
                  type="button"
                  onClick={() => removeBlock(index)}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card setup-card">
        <h2>Study preferences</h2>

        <label>Daily study target</label>

        <select
          value={dailyMinutes}
          onChange={event => setDailyMinutes(event.target.value)}
        >
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="180">3 hours</option>
          <option value="240">4 hours</option>
          <option value="300">5 hours</option>
          <option value="360">6 hours</option>
        </select>

        <div className="time-fields">
          <div>
            <label>Preferred study start</label>
            <input
              type="time"
              value={preferredStart}
              onChange={event => setPreferredStart(event.target.value)}
            />
          </div>

          <div>
            <label>Preferred study end</label>
            <input
              type="time"
              value={preferredEnd}
              onChange={event => setPreferredEnd(event.target.value)}
            />
          </div>
        </div>
      </section>

      <button
        className="primary save-schedule"
        onClick={saveSchedule}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save My Schedule'}
      </button>

    </main>
  )
}

export default TimetableSetup
