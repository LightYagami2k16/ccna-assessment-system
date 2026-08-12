import { useCallback, useEffect, useState } from 'react'
import InstructorQuizList from './InstructorQuizList'
import QuizEditor from './QuizEditor'
import QuizTemplateManager from './QuizTemplateManager'
import { Plus } from 'lucide-react'
import AppIcon from './AppIcon'
import LoadingState from './LoadingState'
import { SectionHeader, SurfaceCard } from './LayoutPrimitives'
import { getCourses, getModules } from '../services/questionService'
import {
  getInstructorQuizzes,
  getInstructorQuizTemplates,
  getQuizBuilderQuestions,
} from '../services/quizBuilderService'

export default function InstructorQuizBuilder() {
  const [quizzes, setQuizzes] = useState([])
  const [questions, setQuestions] = useState([])
  const [templates, setTemplates] = useState([])
  const [courses, setCourses] = useState([])
  const [modules, setModules] = useState([])
  const [editingQuiz, setEditingQuiz] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
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
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

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
    setShowEditor(true)
  }

  function startCreating() {
    setEditingQuiz(null)
    setModules([])
    setShowEditor(true)
  }

  async function handleSaved() {
    setShowEditor(false)
    setEditingQuiz(null)
    await loadData()
  }

  if (showEditor) {
    return (
      <QuizEditor
        key={editingQuiz?.id ?? 'new'}
        quiz={editingQuiz}
        courses={courses}
        modules={modules}
        questions={questions}
        onCourseChange={(courseId) => void loadModules(courseId)}
        onSaved={handleSaved}
        onCancel={() => {
          setShowEditor(false)
          setEditingQuiz(null)
        }}
      />
    )
  }

  return (
    <SurfaceCard as="section" className="instructor-quiz-builder">
      <SectionHeader
        eyebrow="ASSESSMENT CONTENT"
        title="Quiz builder"
        description="Create, configure, publish, and maintain CCNA assessments."
        actions={(
          <button className="primary create-quiz-button" type="button" onClick={startCreating}>
            <AppIcon icon={Plus} aria-hidden="true" />
            <span>Create quiz</span>
          </button>
        )}
      />

      {message && <p className="form-message form-message--error">{message}</p>}
      {loading ? (
        <LoadingState label="Loading quizzes..." />
      ) : (
        <>
          <QuizTemplateManager templates={templates} onChanged={loadData} />
          <InstructorQuizList
            quizzes={quizzes}
            onEdit={(quiz) => void startEditing(quiz)}
            onChanged={loadData}
          />
        </>
      )}
    </SurfaceCard>
  )
}
