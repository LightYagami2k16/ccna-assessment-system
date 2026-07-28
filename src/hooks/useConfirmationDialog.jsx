import { useCallback, useEffect, useRef, useState } from 'react'
import ConfirmationDialog from '../components/ConfirmationDialog'

export default function useConfirmationDialog() {
  const [request, setRequest] = useState(null)
  const resolverRef = useRef(null)

  const settle = useCallback((confirmed) => {
    resolverRef.current?.(confirmed)
    resolverRef.current = null
    setRequest(null)
  }, [])

  const confirm = useCallback((options) => {
    resolverRef.current?.(false)

    return new Promise((resolve) => {
      resolverRef.current = resolve
      setRequest(options)
    })
  }, [])

  useEffect(
    () => () => {
      resolverRef.current?.(false)
    },
    [],
  )

  return {
    confirm,
    confirmationDialog: (
      <ConfirmationDialog
        open={Boolean(request)}
        title={request?.title ?? 'Confirm action'}
        message={request?.message ?? ''}
        confirmLabel={request?.confirmLabel}
        tone={request?.tone}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    ),
  }
}
