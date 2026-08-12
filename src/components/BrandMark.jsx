export default function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" focusable="false">
        <path
          className="brand-mark__links"
          d="M11 11 20 20m9-9-9 9m-9 9 9-9"
        />
        <circle className="brand-mark__node" cx="11" cy="11" r="3" />
        <circle className="brand-mark__node" cx="29" cy="11" r="3" />
        <circle className="brand-mark__node" cx="11" cy="29" r="3" />
        <rect
          className="brand-mark__assessment"
          x="16"
          y="16"
          width="17"
          height="17"
          rx="5"
        />
        <path className="brand-mark__check" d="m20.5 24.5 3 3 5.5-7" />
      </svg>
    </span>
  )
}
