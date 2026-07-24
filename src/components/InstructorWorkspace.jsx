import { useState } from 'react'
import InstructorQuestionBank from './InstructorQuestionBank'
import InstructorResultsDashboard from './InstructorResultsDashboard'

export default function InstructorWorkspace({ user }) {
  const [activeSection, setActiveSection] = useState('questions')

  return (
    <div className="instructor-workspace">
      <nav className="workspace-tabs" aria-label="Instructor tools">
        <button
          className={activeSection === 'questions' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
          type="button"
          onClick={() => setActiveSection('questions')}
        >
          Question bank
        </button>
        <button
          className={activeSection === 'results' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
          type="button"
          onClick={() => setActiveSection('results')}
        >
          Student results
        </button>
      </nav>

      {activeSection === 'questions' ? (
        <InstructorQuestionBank user={user} />
      ) : (
        <InstructorResultsDashboard />
      )}
    </div>
  )
}
