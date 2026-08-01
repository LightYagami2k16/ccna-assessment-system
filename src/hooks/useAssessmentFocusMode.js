import { useEffect } from 'react'

export default function useAssessmentFocusMode(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined

    document.body.classList.add('assessment-focus-active')

    return () => {
      document.body.classList.remove('assessment-focus-active')
    }
  }, [enabled])
}
