export default function WorkspaceLoading({
  label = 'Loading workspace...',
}) {
  return (
    <div
      className="workspace-loading"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  )
}
