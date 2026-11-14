export const workspaceSubsections = {
  quizzes: {
    label: 'Quiz sections',
    sections: [
      { id: 'library', label: 'Quiz library', suffix: '' },
      { id: 'editor', label: 'Create / edit quiz', suffix: '/editor' },
      { id: 'templates', label: 'Templates', suffix: '/templates' },
    ],
  },
  'cli-practicals': {
    label: 'CLI practical sections',
    sections: [
      { id: 'library', label: 'Practical library', suffix: '' },
      { id: 'editor', label: 'Create / edit practical', suffix: '/editor' },
      { id: 'templates', label: 'Templates', suffix: '/templates' },
    ],
  },
  questions: {
    label: 'Question bank sections',
    sections: [
      { id: 'library', label: 'Question library', suffix: '' },
      { id: 'editor', label: 'Create / edit question', suffix: '/editor' },
      { id: 'modules', label: 'Course modules', suffix: '/modules' },
      { id: 'portability', label: 'Import / export', suffix: '/import-export' },
    ],
  },
  assignments: {
    label: 'Classes sections',
    sections: [
      { id: 'classes', label: 'Your classes', suffix: '' },
      { id: 'enrollment', label: 'Enrollment approvals', suffix: '/enrollment' },
      { id: 'access', label: 'Quiz and practical access', suffix: '/access' },
    ],
  },
  'exam-controls': {
    label: 'Exam controls sections',
    sections: [
      { id: 'schedules', label: 'Assignment schedules', suffix: '' },
      { id: 'integrity', label: 'Integrity enforcement', suffix: '/integrity' },
      { id: 'accommodations', label: 'Student accommodations', suffix: '/accommodations' },
      { id: 'monitoring', label: 'Live monitoring', suffix: '/monitoring' },
    ],
  },
  results: {
    label: 'Results sections',
    sections: [
      { id: 'overall', label: 'Overall results', suffix: '' },
      { id: 'quizzes', label: 'Quiz results', suffix: '/quizzes' },
      { id: 'practicals', label: 'CLI practical results', suffix: '/practicals' },
      { id: 'analytics', label: 'Question analytics', suffix: '/question-analytics' },
      { id: 'trends', label: 'Performance trends', suffix: '/performance-trends' },
    ],
  },
}
