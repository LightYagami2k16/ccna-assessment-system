import { createElement } from 'react'

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

export function SurfaceCard({
  as = 'section',
  subtle = false,
  className = '',
  children,
  ...props
}) {
  return createElement(
    as,
    {
      ...props,
      className: classNames(
        'tw:min-w-0 tw:rounded-[var(--radius-card)] tw:p-[var(--space-5)]',
        subtle
          ? 'tw:border tw:border-[var(--color-border)] tw:bg-[var(--color-surface-subtle)] tw:shadow-none'
          : 'tw:bg-[var(--color-surface)] tw:shadow-[var(--shadow-card)]',
        className,
      ),
    },
    children,
  )
}

export function SectionHeader({
  as = 'div',
  eyebrow,
  title,
  description,
  actions,
  titleAs = 'h2',
  className = '',
  children,
  ...props
}) {
  const Title = titleAs

  return createElement(
    as,
    {
      ...props,
      className: classNames(
        'tw:mb-4 tw:flex tw:min-w-0 tw:flex-wrap tw:items-start tw:justify-between tw:gap-4',
        className,
      ),
    },
    <>
      <div className="tw:min-w-0 tw:flex-1">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {title && <Title className="tw:mt-1 tw:mb-0">{title}</Title>}
        {description && (
          <p className="tw:mt-1.5 tw:mb-0 tw:text-[var(--color-text-secondary)]">
            {description}
          </p>
        )}
        {children}
      </div>
      {actions && (
        <div className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:justify-end tw:gap-2">
          {actions}
        </div>
      )}
    </>,
  )
}

export function ActionBar({
  className = '',
  selection,
  actions,
  children,
  ...props
}) {
  return (
    <div
      className={classNames(
        'tw:my-4 tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:justify-between tw:gap-4 tw:rounded-xl tw:border tw:border-[#c9d9e7] tw:bg-[var(--color-surface-subtle)] tw:px-4 tw:py-3',
        className,
      )}
      {...props}
    >
      {selection}
      {actions && (
        <div className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:justify-end tw:gap-2.5">
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

export function ResponsiveGrid({
  as = 'div',
  min = '18rem',
  className = '',
  children,
  style,
  ...props
}) {
  return createElement(
    as,
    {
      ...props,
      className: classNames('tw:grid tw:min-w-0 tw:gap-4', className),
      style: {
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))`,
        ...style,
      },
    },
    children,
  )
}

export function FilterBar({
  as = 'div',
  className = '',
  children,
  ...props
}) {
  return createElement(
    as,
    {
      ...props,
      className: classNames(
        'tw:grid tw:min-w-0 tw:gap-3 tw:rounded-[var(--radius-panel)] tw:border tw:border-[var(--color-border)] tw:bg-[var(--color-surface-subtle)] tw:p-4',
        className,
      ),
    },
    children,
  )
}

export function DataTableRegion({
  className = '',
  children,
  tabIndex = 0,
  ...props
}) {
  return (
    <div
      className={classNames(
        'data-table-region tw:min-w-0 tw:overflow-x-auto tw:rounded-xl tw:border tw:border-[var(--color-border)] tw:bg-[var(--color-surface)]',
        className,
      )}
      tabIndex={tabIndex}
      {...props}
    >
      {children}
    </div>
  )
}

export function FormSection({
  as = 'section',
  title,
  description,
  actions,
  className = '',
  children,
  ...props
}) {
  return createElement(
    as,
    {
      ...props,
      className: classNames(
        'tw:grid tw:min-w-0 tw:gap-4 tw:rounded-[var(--radius-panel)] tw:border tw:border-[var(--color-border)] tw:bg-[var(--color-surface-subtle)] tw:p-4',
        className,
      ),
    },
    <>
      {(title || description || actions) && (
        <div className="form-section__header tw:flex tw:min-w-0 tw:flex-wrap tw:items-start tw:justify-between tw:gap-3">
          <div className="tw:min-w-0 tw:flex-1">
            {title && <h3 className="tw:m-0">{title}</h3>}
            {description && (
              <p className="tw:mt-1 tw:mb-0 tw:text-[var(--color-text-secondary)]">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="form-section__actions tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:justify-end tw:gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </>,
  )
}
