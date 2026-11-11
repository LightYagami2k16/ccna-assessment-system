export default function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img
        src={`${import.meta.env.BASE_URL}favicon.png`}
        alt=""
        width="34"
        height="34"
      />
    </span>
  )
}
