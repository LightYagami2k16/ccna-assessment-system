import { useState } from 'react'
import InstructorQuestionBank from './InstructorQuestionBank'
import InstructorQuizBuilder from './InstructorQuizBuilder'
import InstructorResultsDashboard from './InstructorResultsDashboard'
import InstructorClassAssignments from './InstructorClassAssignments'
import ExamControlsDashboard from './ExamControlsDashboard'
import InstructorCliLabBuilder from './InstructorCliLabBuilder'
import InstructorCliResults from './InstructorCliResults'

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
          className={activeSection === 'quizzes' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
          type="button"
          onClick={() => setActiveSection('quizzes')}
        >
          Quizzes
        </button>
        <button
          className={activeSection === 'cli-practicals' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
          type="button"
          onClick={() => setActiveSection('cli-practicals')}
        >
          CLI practicals
        </button>
        <button
          className={activeSection === 'assignments' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
          type="button"
          onClick={() => setActiveSection('assignments')}
        >
          Classes & assignments
        </button>
        <button
          className={activeSection === 'exam-controls' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
          type="button"
          onClick={() => setActiveSection('exam-controls')}
        >
          Exam controls
        </button>
        <button
          className={activeSection === 'results' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
          type="button"
          onClick={() => setActiveSection('results')}
        >
          Student results
        </button>
      </nav>

      {activeSection === 'questions' && <InstructorQuestionBank user={user} />}
      {activeSection === 'quizzes' && <InstructorQuizBuilder />}
      {activeSection === 'cli-practicals' && <InstructorCliLabBuilder />}
      {activeSection === 'assignments' && <InstructorClassAssignments />}
      {activeSection === 'exam-controls' && <ExamControlsDashboard />}
      {activeSection === 'results' && (
        <div className="combined-results-workspace">
          <InstructorResultsDashboard />
          <InstructorCliResults />
        </div>
      )}
    </div>
  )
}
