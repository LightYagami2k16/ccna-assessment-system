import { ClipboardCheck } from 'lucide-react'
import { useId } from 'react'
import AppIcon from './AppIcon'

export default function TailwindEmptyState({
  title,
  description,
  icon = ClipboardCheck,
  className = '',
}) {
  const titleId = useId()

  return (
    <section
      className={`tw:flex tw:min-h-48 tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:rounded-2xl tw:border tw:border-dashed tw:border-slate-300 tw:bg-white/60 tw:px-6 tw:py-10 tw:text-center ${className}`}
      aria-labelledby={titleId}
    >
      <span
        className="tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-xl tw:bg-sky-100 tw:text-sky-700"
        aria-hidden="true"
      >
        <AppIcon icon={icon} size={24} strokeWidth={2} />
      </span>
      <div className="tw:grid tw:max-w-xl tw:gap-1">
        <h3
          id={titleId}
          className="tw:m-0 tw:text-lg tw:font-extrabold tw:text-slate-900"
        >
          {title}
        </h3>
        <p className="tw:m-0 tw:text-sm tw:leading-6 tw:text-slate-600">
          {description}
        </p>
      </div>
    </section>
  )
}
