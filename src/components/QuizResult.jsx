export default function QuizResult({ result, onReturn }) {
  if (!result) return null

  const passed = Boolean(result.passed)

  return (
    <section className="quiz-result">
      <span
        className={
          passed
            ? 'quiz-result__status quiz-result__status--passed'
            : 'quiz-result__status quiz-result__status--failed'
        }
      >
        {passed ? 'Passed' : 'Not passed'}
      </span>
      <h1>Quiz result</h1>
      <div className="quiz-result__score">
        <strong>{Number(result.percentage).toFixed(2)}%</strong>
        <span>
          {Number(result.scorePoints)} of {Number(result.maximumPoints)} points
        </span>
      </div>
      <dl className="quiz-result__details">
        <div>
          <dt>Passing score</dt>
          <dd>{Number(result.passingScore)}%</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{passed ? 'Passed' : 'Failed'}</dd>
        </div>
      </dl>
      <button className="primary quiz-result__button" type="button" onClick={onReturn}>
        Return to quizzes
      </button>
    </section>
  )
}
