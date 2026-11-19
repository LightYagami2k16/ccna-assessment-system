import { lazy, Suspense } from 'react'
import WorkspaceLoading from './WorkspaceLoading'

const CliCompetitions = lazy(() => import('./CliCompetitions'))
const InstructorQuestionBank = lazy(() => import('./InstructorQuestionBank'))
const InstructorQuizBuilder = lazy(() => import('./InstructorQuizBuilder'))
const InstructorResultsArea = lazy(() => import('./InstructorResultsArea'))
const InstructorClassAssignments = lazy(
  () => import('./InstructorClassAssignments'),
)
const ExamControlsDashboard = lazy(() => import('./ExamControlsDashboard'))
const InstructorCliLabBuilder = lazy(
  () => import('./InstructorCliLabBuilder'),
)
const InstructorContentBackup = lazy(
  () => import('./InstructorContentBackup'),
)

export default function AssessmentWorkspaceContent({ section, label, user, administratorMode = false, onOpenPracticals }) {
  return <Suspense fallback={<WorkspaceLoading label={`Loading ${label.toLowerCase()}...`} />}>
    {section === 'competitions' && <CliCompetitions />}
    {section === 'questions' && <InstructorQuestionBank user={user} administratorMode={administratorMode} />}
    {section === 'quizzes' && <InstructorQuizBuilder administratorMode={administratorMode} />}
    {section === 'cli-practicals' && <InstructorCliLabBuilder administratorMode={administratorMode} />}
    {section === 'assignments' && <InstructorClassAssignments administratorMode={administratorMode} onOpenPracticals={onOpenPracticals} />}
    {section === 'exam-controls' && <ExamControlsDashboard administratorMode={administratorMode} />}
    {section === 'results' && <InstructorResultsArea administratorMode={administratorMode} />}
    {section === 'content-backup' && <InstructorContentBackup />}
  </Suspense>
}
