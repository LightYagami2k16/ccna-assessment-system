import { useCallback, useEffect, useRef, useState } from 'react'
import { getOverviewPracticals, getOverviewQuizzes, getOverviewUpcoming } from '../services/studentOverviewService'

const resources = [
  ['quizzes', getOverviewQuizzes, 'Available quizzes could not be loaded.'],
  ['practicals', getOverviewPracticals, 'Available CLI practicals could not be loaded.'],
  ['upcoming', getOverviewUpcoming, 'Upcoming assessment schedules are currently unavailable.'],
]

export default function useStudentOverviewData() {
  const [data, setData] = useState({ quizzes: null, practicals: null, upcoming: null })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const requestVersion = useRef(0)
  const load = useCallback(async ({ silent = false } = {}) => {
    const version = ++requestVersion.current
    if (!silent) setLoading(true)
    const results = await Promise.allSettled(resources.map(([, fetch]) => fetch()))
    if (version !== requestVersion.current) return
    setData((current) => Object.fromEntries(resources.map(([key], index) => [key,
      results[index].status === 'fulfilled' ? results[index].value : current[key]])))
    setErrors(Object.fromEntries(resources.map(([key, , message], index) => [key,
      results[index].status === 'rejected' ? message : null])))
    setLoading(false)
  }, [])
  useEffect(() => {
    void load()
    return () => { requestVersion.current += 1 }
  }, [load])
  return { data, errors, loading, load }
}
