import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import QuizTimer from './QuizTimer';
import QuizResult from './QuizResult';
import useExamIntegrityMonitor from '../hooks/useExamIntegrityMonitor';

import {
  getQuizAttempt,
  saveQuizAnswer,
  submitQuizAttempt
} from '../services/quizAttemptService';

export default function QuizPlayer({
  attemptId,
  onExit
}) {
  const [attemptData, setAttemptData] = useState(null);

  const [
    currentQuestionIndex,
    setCurrentQuestionIndex
  ] = useState(0);

  const [
    selectedAnswers,
    setSelectedAnswers
  ] = useState({});

  const [
    savingQuestionId,
    setSavingQuestionId
  ] = useState(null);

  const [saveMessage, setSaveMessage] = useState('');
  const [pageMessage, setPageMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [integrityWarning, setIntegrityWarning] = useState('');

  const handleIntegrityIncident = useCallback((eventType) => {
    const messages = {
      page_hidden:
        'The exam page became hidden. This event was recorded for instructor review.',
      fullscreen_exited:
        'Fullscreen was exited. This event was recorded for instructor review.',
      connection_lost:
        'Your connection was lost. Continue working while the browser reconnects.',
    };
    setIntegrityWarning(
      messages[eventType] ??
        'An exam integrity event was recorded.'
    );
  }, []);

  useExamIntegrityMonitor({
    attemptId,
    enabled:
      attemptData?.attempt?.status === 'in_progress' &&
      !result,
    onIncident: handleIntegrityIncident
  });

  const loadAttempt = useCallback(async () => {
    try {
      setLoading(true);
      setPageMessage('');

      const data = await getQuizAttempt(attemptId);

      setAttemptData(data);

      const restoredAnswers = {};

      for (const question of data.questions ?? []) {
        if (question.selectedOptionId) {
          restoredAnswers[
            question.attemptQuestionId
          ] = question.selectedOptionId;
        }
      }

      setSelectedAnswers(restoredAnswers);

      if (
        data.attempt?.status !== 'in_progress'
      ) {
        setPageMessage(
          `This attempt is ${data.attempt?.status}.`
        );
      }
    } catch (error) {
      setPageMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    void loadAttempt();
  }, [loadAttempt]);

  const questions = attemptData?.questions ?? [];

  const currentQuestion =
    questions[currentQuestionIndex] ?? null;

  const answeredCount = useMemo(() => {
    return Object.values(selectedAnswers).filter(
      Boolean
    ).length;
  }, [selectedAnswers]);

  const progressPercentage = useMemo(() => {
    if (!questions.length) {
      return 0;
    }

    return Math.round(
      (answeredCount / questions.length) * 100
    );
  }, [answeredCount, questions.length]);

  const performSubmission = useCallback(
    async ({ skipConfirmation = false } = {}) => {
      if (submitting || result) {
        return;
      }

      if (!skipConfirmation) {
        const unanswered =
          questions.length - answeredCount;

        const confirmationMessage =
          unanswered > 0
            ? `You have ${unanswered} unanswered question(s). Submit anyway?`
            : 'Submit your quiz now? You cannot change your answers afterward.';

        const confirmed = window.confirm(
          confirmationMessage
        );

        if (!confirmed) {
          return;
        }
      }

      try {
        setSubmitting(true);
        setPageMessage('');

        const submissionResult =
          await submitQuizAttempt(attemptId);

        setResult(submissionResult);
      } catch (error) {
        const errorMessage =
          error?.message ?? 'Unable to submit quiz.';

        if (
          errorMessage
            .toLowerCase()
            .includes('already submitted')
        ) {
          setPageMessage(
            'This quiz has already been submitted.'
          );

          await loadAttempt();
        } else {
          setPageMessage(errorMessage);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      answeredCount,
      attemptId,
      loadAttempt,
      questions.length,
      result,
      submitting
    ]
  );

  const handleTimeExpired = useCallback(() => {
    if (submitting || result) {
      return;
    }

    setPageMessage(
      'Time expired. Your quiz is being submitted.'
    );

    void performSubmission({
      skipConfirmation: true
    });
  }, [performSubmission, result, submitting]);

  async function handleSelectOption(optionId) {
    if (!currentQuestion || submitting) {
      return;
    }

    const attemptQuestionId =
      currentQuestion.attemptQuestionId;

    const previousOption =
      selectedAnswers[attemptQuestionId] ?? null;

    setSelectedAnswers((currentAnswers) => ({
      ...currentAnswers,
      [attemptQuestionId]: optionId
    }));

    setSavingQuestionId(attemptQuestionId);
    setSaveMessage('Saving answer...');

    try {
      await saveQuizAnswer({
        attemptId,
        attemptQuestionId,
        selectedOptionId: optionId
      });

      setSaveMessage('Answer saved.');
    } catch (error) {
      setSelectedAnswers((currentAnswers) => ({
        ...currentAnswers,
        [attemptQuestionId]: previousOption
      }));

      setSaveMessage(
        error?.message ?? 'Unable to save answer.'
      );
    } finally {
      setSavingQuestionId(null);
    }
  }

  function goToPreviousQuestion() {
    setCurrentQuestionIndex((currentIndex) =>
      Math.max(0, currentIndex - 1)
    );
  }

  function goToNextQuestion() {
    setCurrentQuestionIndex((currentIndex) =>
      Math.min(
        questions.length - 1,
        currentIndex + 1
      )
    );
  }

  function goToQuestion(index) {
    setCurrentQuestionIndex(index);
  }

  async function enterFullscreen() {
    try {
      if (
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      ) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setIntegrityWarning(
        'Fullscreen could not be started in this browser.'
      );
    }
  }

  if (loading) {
    return (
      <main className="quiz-player">
        <p>Loading quiz...</p>
      </main>
    );
  }

  if (result) {
    return (
      <QuizResult
        result={result}
        onReturn={onExit}
      />
    );
  }

  if (!attemptData || !currentQuestion) {
    return (
      <main className="quiz-player">
        <p>
          {pageMessage ||
            'The quiz does not contain any questions.'}
        </p>

        <button
          type="button"
          onClick={onExit}
        >
          Return
        </button>
      </main>
    );
  }

  const selectedOptionId =
    selectedAnswers[
      currentQuestion.attemptQuestionId
    ] ?? null;

  const attemptIsActive =
    attemptData.attempt.status === 'in_progress';

  return (
    <main className="quiz-player">
      {integrityWarning && (
        <div className="integrity-warning" role="alert">
          <span>{integrityWarning}</span>
          <button
            type="button"
            onClick={() => setIntegrityWarning('')}
          >
            Dismiss
          </button>
        </div>
      )}
      <header className="quiz-player__header">
        <div>
          <p className="quiz-player__course-label">
            Quiz attempt{' '}
            {attemptData.attempt.attemptNumber}
          </p>

          <h1>{attemptData.quiz.title}</h1>

          {attemptData.quiz.instructions && (
            <p>
              {attemptData.quiz.instructions}
            </p>
          )}
        </div>

        <div className="quiz-player__exam-tools">
          <QuizTimer
            expiresAt={
              attemptData.attempt.expiresAt
            }
            onTimeExpired={handleTimeExpired}
          />
          <button
            className="secondary"
            type="button"
            onClick={() => void enterFullscreen()}
          >
            Enter fullscreen
          </button>
        </div>
      </header>

      <section className="quiz-progress">
        <div className="quiz-progress__labels">
          <span>
            Answered {answeredCount} of{' '}
            {questions.length}
          </span>

          <strong>
            {progressPercentage}%
          </strong>
        </div>

        <div className="quiz-progress__track">
          <div
            className="quiz-progress__bar"
            style={{
              width: `${progressPercentage}%`
            }}
          />
        </div>
      </section>

      <div className="quiz-player__layout">
        <aside className="quiz-navigation">
          <h2>Questions</h2>

          <div className="quiz-navigation__grid">
            {questions.map((question, index) => {
              const isAnswered = Boolean(
                selectedAnswers[
                  question.attemptQuestionId
                ]
              );

              const isCurrent =
                index === currentQuestionIndex;

              const className = [
                'quiz-navigation__button',
                isAnswered
                  ? 'quiz-navigation__button--answered'
                  : '',
                isCurrent
                  ? 'quiz-navigation__button--current'
                  : ''
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={
                    question.attemptQuestionId
                  }
                  type="button"
                  className={className}
                  onClick={() =>
                    goToQuestion(index)
                  }
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="quiz-navigation__legend">
            <span>
              <i className="legend-box legend-box--current" />
              Current
            </span>

            <span>
              <i className="legend-box legend-box--answered" />
              Answered
            </span>
          </div>
        </aside>

        <section className="quiz-question-card">
          <div className="quiz-question-card__heading">
            <div>
              <span>
                Question{' '}
                {currentQuestionIndex + 1} of{' '}
                {questions.length}
              </span>

              <h2>
                {currentQuestion.title}
              </h2>
            </div>

            <strong>
              {currentQuestion.points}{' '}
              {Number(
                currentQuestion.points
              ) === 1
                ? 'point'
                : 'points'}
            </strong>
          </div>

          <p className="quiz-question-card__text">
            {currentQuestion.questionText}
          </p>

          <div className="quiz-options">
            {(currentQuestion.options ?? []).map(
              (option) => {
                const isSelected =
                  selectedOptionId === option.id;

                return (
                  <label
                    key={option.id}
                    className={[
                      'quiz-option',
                      isSelected
                        ? 'quiz-option--selected'
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion.attemptQuestionId}`}
                      value={option.id}
                      checked={isSelected}
                      disabled={
                        !attemptIsActive ||
                        submitting ||
                        savingQuestionId ===
                          currentQuestion.attemptQuestionId
                      }
                      onChange={() =>
                        void handleSelectOption(
                          option.id
                        )
                      }
                    />

                    <span>{option.text}</span>
                  </label>
                );
              }
            )}
          </div>

          <div className="quiz-save-status">
            {saveMessage}
          </div>

          <footer className="quiz-question-card__footer">
            <button
              type="button"
              onClick={goToPreviousQuestion}
              disabled={
                currentQuestionIndex === 0
              }
            >
              Previous
            </button>

            {currentQuestionIndex <
            questions.length - 1 ? (
              <button
                type="button"
                onClick={goToNextQuestion}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="button-primary"
                onClick={() =>
                  void performSubmission()
                }
                disabled={
                  submitting ||
                  !attemptIsActive ||
                  savingQuestionId !== null
                }
              >
                {submitting
                  ? 'Submitting...'
                  : 'Submit quiz'}
              </button>
            )}
          </footer>
        </section>
      </div>

      {pageMessage && (
        <p className="form-message">
          {pageMessage}
        </p>
      )}

      <div className="quiz-player__bottom-actions">
        <button
          type="button"
          onClick={() =>
            void performSubmission()
          }
          disabled={
            submitting ||
            !attemptIsActive ||
            savingQuestionId !== null
          }
        >
          {submitting
            ? 'Submitting...'
            : 'Submit quiz'}
        </button>
      </div>
    </main>
  );
}
