export default function AssessmentTypeIcon({ type = 'quiz' }) {
  const isCli = type === 'cli'

  return (
    <span
      className={`assessment-type-icon assessment-type-icon--${isCli ? 'cli' : 'quiz'}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" focusable="false">
        {isCli ? (
          <>
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="m7 9 3 3-3 3" />
            <path d="M12.5 15H17" />
          </>
        ) : (
          <>
            <path d="M7 3.5h8l3 3V20H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
            <path d="M15 3.5V7h3" />
            <path d="m8.5 12 1.4 1.4 2.7-3" />
            <path d="M13.5 12H16" />
            <path d="M8.5 16H16" />
          </>
        )}
      </svg>
    </span>
  )
}
