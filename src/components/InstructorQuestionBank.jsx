import useDataLoadState from '../hooks/useDataLoadState'
import { useCallback, useEffect, useState } from 'react'
import QuestionEditor from './QuestionEditor'
import QuestionList from './QuestionList'
import InstructorModuleManager from './InstructorModuleManager'
import QuestionBankPortability from './QuestionBankPortability'
import { getInstructorQuestions } from '../services/questionService'
import useInstructorSubsection from '../hooks/useInstructorSubsection'
import WorkspaceSubsectionNav from './WorkspaceSubsectionNav'

export default function InstructorQuestionBank({
  user,
  administratorMode = false,
}) {
  const [activeSection, setActiveSection] = useInstructorSubsection(
    'questions', administratorMode,
  )
  const [questions, setQuestions] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading, hasLoaded, markLoaded] = useDataLoadState()
  const [loadFailed, setLoadFailed] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [moduleVersion, setModuleVersion] = useState(0)
  const [moduleFilter, setModuleFilter] = useState('all')
  const [editorRevision, setEditorRevision] = useState(0)

  const loadQuestions = useCallback(async () => {
    setLoadFailed(false)
    try {
      setLoading(true)
      setMessage('')
      setQuestions(await getInstructorQuestions())
      markLoaded()
    } catch (error) {
      setLoadFailed(true)
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [markLoaded, setLoading])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  return (
    <div className="instructor-question-bank">
      <WorkspaceSubsectionNav
        page="questions"
        activeSection={activeSection}
        onChange={setActiveSection}
      />
      <div
        id="questions-subsection-modules"
        className="workspace-subsection-panel"
        hidden={activeSection !== 'modules'}
      >
        <InstructorModuleManager
          onChanged={() =>
            setModuleVersion((current) => current + 1)
          }
        />
      </div>
      <div
        id="questions-subsection-editor"
        className="workspace-subsection-panel"
        hidden={activeSection !== 'editor'}
      >
        <QuestionEditor
          key={`${editingQuestion?.id ?? 'new'}-${moduleVersion}-${editorRevision}`}
          user={user}
          question={editingQuestion}
          autoExpand={activeSection === 'editor'}
          onSaved={async () => {
            await loadQuestions()
            setEditingQuestion(null)
            setEditorRevision((current) => current + 1)
            setActiveSection('library')
          }}
          onCancel={() => {
            setEditingQuestion(null)
            setActiveSection('library')
          }}
        />
      </div>
      <div
        id="questions-subsection-portability"
        className="workspace-subsection-panel"
        hidden={activeSection !== 'portability'}
      >
        <QuestionBankPortability
          questions={questions}
          moduleVersion={moduleVersion}
          onImported={loadQuestions}
        />
      </div>
      <div
        id="questions-subsection-library"
        className="workspace-subsection-panel"
        hidden={activeSection !== 'library'}
      >
          <QuestionList
            loading={loading}
            ready={hasLoaded}
            loadFailed={loadFailed}
            questions={questions}
            moduleFilter={moduleFilter}
            onModuleFilterChange={setModuleFilter}
            onEdit={(question) => {
              setEditingQuestion(question)
              setActiveSection('editor')
            }}
            onChanged={loadQuestions}
          />
      </div>
      {message && <p className="form-message form-message--error">{message}</p>}
    </div>
  )
}
