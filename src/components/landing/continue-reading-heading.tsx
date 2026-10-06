import { Link } from "react-router-dom"

/** Desktop heading: the editorial italic label, a hairline, and the way to the whole shelf. */
export function ContinueReadingHeading() {
  return (
    <div className="cr-heading">
      <p className="cr-heading__label">Continue reading</p>
      <span className="cr-heading__rule" aria-hidden />
      <Link to="/library" className="cr-heading__link">
        My Library <span aria-hidden>→</span>
      </Link>
    </div>
  )
}
