import useDataLoadState from '../hooks/useDataLoadState'
import DataLoadBoundary from './DataLoadBoundary'
import { useCallback, useEffect, useState } from 'react'
import InstructorQuizList from './InstructorQuizList'
import QuizEditor from './QuizEditor'
import QuizTemplateManager from './QuizTemplateManager'
import useInstructorSubsection from '../hooks/useInstructorSubsection'
import WorkspaceSubsectionNav from './WorkspaceSubsectionNav'
import { Plus } from 'lucide-react'
import AppIcon from './AppIcon'
import { SectionHeader, SurfaceCard } from './LayoutPrimitives'
import { getCourses, getModules } from '../services/questionService'
import {
  getInstructorQuizzes,
  getInstructorQuizTemplates,
  getQuizBuilderQuestions,
} from '../services/quizBuilderService'

export default function InstructorQuizBuilder({ administratorMode = false }) {
  const [activeSection, setActiveSection] = useInstructorSubsection('quizzes', administratorMode)
  const [quizzes, setQuizzes] = useState([])
  const [questions, setQuestions] = useState([])
  const [templates, setTemplates] = useState([])
  const [courses, setCourses] = useState([])
  const [modules, setModules] = useState([])
  const [editingQuiz, setEditingQuiz] = useState(null)
  const [editorRevision, setEditorRevision] = useState(0)
  const [loading, setLoading, hasLoaded, markLoaded] = useDataLoadState()
  const [loadFailed, setLoadFailed] = useState(false)
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    setLoadFailed(false)
    try {
      setLoading(true)
      setMessage('')
      const [quizData, questionData, courseData, templateData] = await Promise.all([
        getInstructorQuizzes(),
        getQuizBuilderQuestions(),
        getCourses(),
        getInstructorQuizTemplates(),
      ])
      setQuizzes(quizData)
      setQuestions(questionData)
      setCourses(courseData)
      setTemplates(templateData)
      markLoaded()
    } catch (error) {
      setLoadFailed(true)
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [markLoaded, setLoading])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function loadModules(courseId) {
    try {
      setModules(courseId ? await getModules(courseId) : [])
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function startEditing(quiz) {
    setEditingQuiz(quiz)
    await loadModules(String(quiz.course_id))
    setActiveSection('editor')
  }

  function startCreating() {
    setEditingQuiz(null)
    setModules([])
    setEditorRevision((current) => current + 1)
    setActiveSection('editor')
  }

  async function handleSaved() {
    await loadData()
    cancelEditing()
  }

  function cancelEditing() {
    setEditingQuiz(null)
    setModules([])
    setEditorRevision((current) => current + 1)
    setActiveSection('library')
  }

  return (
    <div className="instructor-quiz-sections">
      <WorkspaceSubsectionNav page="quizzes" activeSection={activeSection} onChange={setActiveSection} />
      {message && <p className="form-message form-message--error">{message}</p>}
      <div id="quizzes-subsection-editor" className="workspace-subsection-panel" hidden={activeSection !== 'editor'}>
        {!hasLoaded && <SurfaceCard><SectionHeader title="Create / edit quiz" /><DataLoadBoundary error={loadFailed} onRetry={loadData} loading={loading} ready={false} label="Loading quiz builder..." /></SurfaceCard>}
        {hasLoaded && (
        <QuizEditor
          key={`${editingQuiz?.id ?? 'new'}-${editorRevision}`}
          quiz={editingQuiz}
          courses={courses}
          modules={modules}
          questions={questions}
          onCourseChange={(courseId) => void loadModules(courseId)}
          onSaved={handleSaved}
          onCancel={cancelEditing}
        />
        )}
      </div>
      <div id="quizzes-subsection-templates" className="workspace-subsection-panel" hidden={activeSection !== 'templates'}>
        {!hasLoaded && <SurfaceCard><SectionHeader title="Quiz templates" /><DataLoadBoundary error={loadFailed} onRetry={loadData} loading={loading} ready={false} label="Loading quiz templates..." /></SurfaceCard>}
        {hasLoaded && <DataLoadBoundary loading={loading} ready error={loadFailed} onRetry={loadData}><QuizTemplateManager templates={templates} onChanged={loadData} /></DataLoadBoundary>}
      </div>
      <div id="quizzes-subsection-library" className="workspace-subsection-panel" hidden={activeSection !== 'library'}>
        <SurfaceCard as="section" className="instructor-quiz-builder">
          <SectionHeader
            eyebrow="ASSESSMENT CONTENT"
            title="Quiz library"
            description="Create, configure, publish, and maintain CCNA assessments."
            actions={(
              <div className="loading-panel-actions">
              <button disabled={!hasLoaded} className="primary create-quiz-button" type="button" onClick={startCreating}>
                <AppIcon icon={Plus} aria-hidden="true" />
                <span>Create quiz</span>
              </button>
              </div>
            )}
          />

          <DataLoadBoundary error={loadFailed} onRetry={loadData} loading={loading} ready={hasLoaded} label="Loading quizzes...">
          <InstructorQuizList
            quizzes={quizzes}
            active={activeSection === 'library'}
            onEdit={(quiz) => void startEditing(quiz)}
            onChanged={loadData}
          />
          </DataLoadBoundary>
        </SurfaceCard>
      </div>
    </div>
  )
}
