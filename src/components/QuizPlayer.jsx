import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import QuizTimer from './QuizTimer';
import QuizResult from './QuizResult';
import ConfirmationDialog from './ConfirmationDialog';
import useExamIntegrityMonitor from '../hooks/useExamIntegrityMonitor';
import {
  cachePendingAnswer,
  clearAttemptCache,
  getAttemptSnapshot,
  getPendingAnswers,
  markPendingAnswerSynced,
  saveAttemptSnapshot,
  updateSnapshotAnswer
} from '../services/quizAnswerCache';

import {
  getQuizAttempt,
  saveQuizAnswer,
  submitQuizAttempt
} from '../services/quizAttemptService';

function answerFromQuestion(question) {
  if (question.type === 'identification') {
    return question.answerText ?? '';
  }

  if (question.type === 'multiple_answer') {
    return question.selectedOptionIds ?? [];
  }

  return question.selectedOptionId ?? null;
}

function answerFromPending(question, pendingAnswer) {
  if (question.type === 'identification') {
    return pendingAnswer.answerText ?? '';
  }

  if (question.type === 'multiple_answer') {
    return pendingAnswer.selectedOptionIds ?? [];
  }

  return pendingAnswer.selectedOptionId ?? null;
}

function answerIsComplete(question, answer) {
  if (question.type === 'identification') {
    return Boolean(String(answer ?? '').trim());
  }

  if (question.type === 'multiple_answer') {
    return Array.isArray(answer) && answer.length > 0;
  }

  return Boolean(answer);
}

function answerFields(question, answer) {
  if (question.type === 'identification') {
    return {
      selectedOptionId: null,
      selectedOptionIds: [],
      answerText: String(answer ?? ''),
    };
  }

  if (question.type === 'multiple_answer') {
    const optionIds = Array.isArray(answer) ? answer : [];
    return {
      selectedOptionId: null,
      selectedOptionIds: optionIds,
      answerText: null,
    };
  }

  return {
    selectedOptionId: answer || null,
    selectedOptionIds: answer ? [answer] : [],
    answerText: null,
  };
}

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
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

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

      let data;

      try {
        data = await getQuizAttempt(attemptId);
        saveAttemptSnapshot(attemptId, data);
      } catch (error) {
        data = getAttemptSnapshot(attemptId);

        if (!data) {
          throw error;
        }

        setPageMessage(
          'You are offline. A saved copy of this attempt was restored from this device.'
        );
      }

      setAttemptData(data);

      const restoredAnswers = {};

      for (const question of data.questions ?? []) {
        const restoredAnswer = answerFromQuestion(question);

        if (answerIsComplete(question, restoredAnswer)) {
          restoredAnswers[
            question.attemptQuestionId
          ] = restoredAnswer;
        }
      }

      const pendingAnswers = getPendingAnswers(attemptId);

      for (const [
        attemptQuestionId,
        pendingAnswer
      ] of Object.entries(pendingAnswers)) {
        const question = (data.questions ?? []).find(
          (item) => item.attemptQuestionId === attemptQuestionId
        );

        if (!question) {
          continue;
        }

        const pendingValue = answerFromPending(
          question,
          pendingAnswer
        );

        restoredAnswers[attemptQuestionId] = pendingValue;
        updateSnapshotAnswer(
          attemptId,
          attemptQuestionId,
          answerFields(question, pendingValue)
        );
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

  const questions = useMemo(
    () => attemptData?.questions ?? [],
    [attemptData?.questions]
  );

  const currentQuestion =
    questions[currentQuestionIndex] ?? null;

  const answeredCount = useMemo(() => {
    return questions.filter((question) =>
      answerIsComplete(
        question,
        selectedAnswers[question.attemptQuestionId]
      )
    ).length;
  }, [questions, selectedAnswers]);

  const progressPercentage = useMemo(() => {
    if (!questions.length) {
      return 0;
    }

    return Math.round(
      (answeredCount / questions.length) * 100
    );
  }, [answeredCount, questions.length]);

  const unansweredCount = Math.max(
    0,
    questions.length - answeredCount
  );

  const syncPendingAnswers = useCallback(async () => {
    const pendingAnswers = getPendingAnswers(attemptId);
    const pendingEntries = Object.entries(pendingAnswers);

    if (!pendingEntries.length) {
      return true;
    }

    if (!navigator.onLine) {
      setSaveMessage(
        'Offline: answers are saved on this device and will sync after reconnection.'
      );
      return false;
    }

    setSaveMessage(
      `Synchronizing ${pendingEntries.length} saved answer(s)...`
    );

    for (const [
      attemptQuestionId,
      pendingAnswer
    ] of pendingEntries) {
      const question = (attemptData?.questions ?? []).find(
        (item) => item.attemptQuestionId === attemptQuestionId
      );

      if (!question) {
        markPendingAnswerSynced(attemptId, attemptQuestionId);
        continue;
      }

      try {
        await saveQuizAnswer({
          attemptId,
          attemptQuestionId,
          ...answerFields(
            question,
            answerFromPending(question, pendingAnswer)
          )
        });
        markPendingAnswerSynced(
          attemptId,
          attemptQuestionId
        );
      } catch {
        setSaveMessage(
          'Some answers are still saved on this device and will retry automatically.'
        );
        return false;
      }
    }

    setSaveMessage('All saved answers are synchronized.');
    return true;
  }, [attemptData?.questions, attemptId]);

  useEffect(() => {
    function handleOnline() {
      void syncPendingAnswers();
    }

    window.addEventListener('online', handleOnline);

    if (
      attemptData?.attempt?.status === 'in_progress' &&
      navigator.onLine
    ) {
      void syncPendingAnswers();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [attemptData?.attempt?.status, syncPendingAnswers]);

  const performSubmission = useCallback(
    async () => {
      if (submitting || result) {
        return;
      }

      try {
        setSubmitting(true);
        setPageMessage('');

        const answersSynchronized =
          await syncPendingAnswers();

        if (!answersSynchronized) {
          setPageMessage(
            'Your answers are saved on this device, but submission must wait until they synchronize.'
          );
          return;
        }

        const submissionResult =
          await submitQuizAttempt(attemptId);

        clearAttemptCache(attemptId);
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
      attemptId,
      loadAttempt,
      result,
      submitting,
      syncPendingAnswers
    ]
  );

  const handleTimeExpired = useCallback(() => {
    if (submitting || result) {
      return;
    }

    setPageMessage(
      'Time expired. Your quiz is being submitted.'
    );

    setSubmitDialogOpen(false);
    void performSubmission();
  }, [performSubmission, result, submitting]);

  function cacheAnswer(question, answer) {
    const attemptQuestionId = question.attemptQuestionId;
    const fields = answerFields(question, answer);

    cachePendingAnswer(
      attemptId,
      attemptQuestionId,
      fields
    );
    updateSnapshotAnswer(
      attemptId,
      attemptQuestionId,
      fields
    );

    setSelectedAnswers((currentAnswers) => ({
      ...currentAnswers,
      [attemptQuestionId]: answer
    }));
  }

  async function persistAnswer(question, answer) {
    if (!question || submitting) {
      return;
    }

    const attemptQuestionId =
      question.attemptQuestionId;

    setSavingQuestionId(attemptQuestionId);
    setSaveMessage('Saving answer...');

    try {
      await saveQuizAnswer({
        attemptId,
        attemptQuestionId,
        ...answerFields(question, answer)
      });

      markPendingAnswerSynced(
        attemptId,
        attemptQuestionId
      );
      setSaveMessage('Answer saved.');
    } catch (error) {
      setSaveMessage(
        navigator.onLine
          ? `${
              error?.message ?? 'Unable to reach the server.'
            } The answer remains saved on this device.`
          : 'Offline: the answer is saved on this device and will sync automatically.'
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

  function handleSelectOption(optionId) {
    if (!currentQuestion || submitting) return;

    cacheAnswer(currentQuestion, optionId);
    void persistAnswer(currentQuestion, optionId);
  }

  function handleToggleOption(optionId) {
    if (!currentQuestion || submitting) return;

    const attemptQuestionId =
      currentQuestion.attemptQuestionId;
    const currentSelection = Array.isArray(
      selectedAnswers[attemptQuestionId]
    )
      ? selectedAnswers[attemptQuestionId]
      : [];
    const nextSelection = currentSelection.includes(optionId)
      ? currentSelection.filter((id) => id !== optionId)
      : [...currentSelection, optionId];

    cacheAnswer(currentQuestion, nextSelection);
    void persistAnswer(currentQuestion, nextSelection);
  }

  function handleIdentificationChange(answerText) {
    if (!currentQuestion || submitting) return;

    cacheAnswer(currentQuestion, answerText);
    setSaveMessage(
      'Answer saved on this device. It will synchronize automatically.'
    );
  }

  function handleIdentificationBlur() {
    if (!currentQuestion || submitting) return;

    const answerText =
      selectedAnswers[currentQuestion.attemptQuestionId] ?? '';
    void persistAnswer(currentQuestion, answerText);
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

  const currentAnswer =
    selectedAnswers[
      currentQuestion.attemptQuestionId
    ] ?? answerFromQuestion(currentQuestion);
  const selectedOptionIds =
    currentQuestion.type === 'multiple_answer' &&
    Array.isArray(currentAnswer)
      ? currentAnswer
      : [];

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
              const isAnswered = answerIsComplete(
                question,
                selectedAnswers[question.attemptQuestionId]
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
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`Question ${index + 1}${isAnswered ? ', answered' : ', unanswered'}${isCurrent ? ', current' : ''}`}
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

          {currentQuestion.type === 'identification' ? (
            <label className="quiz-identification-answer">
              Your answer
              <input
                type="text"
                value={String(currentAnswer ?? '')}
                disabled={
                  !attemptIsActive ||
                  submitting ||
                  savingQuestionId ===
                    currentQuestion.attemptQuestionId
                }
                autoComplete="off"
                placeholder="Type your answer"
                onChange={(event) =>
                  handleIdentificationChange(event.target.value)
                }
                onBlur={handleIdentificationBlur}
              />
              <small>
                Capitalization and extra spacing do not affect grading.
              </small>
            </label>
          ) : (
          <>
          {currentQuestion.type === 'multiple_answer' && (
            <p className="quiz-answer-instruction">
              Select all answers that apply.
            </p>
          )}
          <div className="quiz-options">
            {(currentQuestion.options ?? []).map(
              (option) => {
                const isSelected =
                  currentQuestion.type === 'multiple_answer'
                    ? selectedOptionIds.includes(option.id)
                    : currentAnswer === option.id;

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
                      type={
                        currentQuestion.type === 'multiple_answer'
                          ? 'checkbox'
                          : 'radio'
                      }
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
                        currentQuestion.type === 'multiple_answer'
                          ? handleToggleOption(option.id)
                          : handleSelectOption(option.id)
                      }
                    />

                    <span>{option.text}</span>
                  </label>
                );
              }
            )}
          </div>
          </>
          )}

          <div className="quiz-save-status" role="status" aria-live="polite">
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
                disabled
              >
                Last question
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
        <span>
          <strong>{answeredCount}</strong> answered
          <small>
          {unansweredCount} unanswered
          </small>
        </span>
        <button
          type="button"
          onClick={() => setSubmitDialogOpen(true)}
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

      <ConfirmationDialog
        open={submitDialogOpen}
        title="Submit quiz?"
        message={
          unansweredCount > 0
            ? `You have ${unansweredCount} unanswered question(s). Submit now? Answers cannot be changed afterward.`
            : 'Your answers are ready. Submit this quiz for grading? Answers cannot be changed afterward.'
        }
        confirmLabel="Submit quiz"
        tone="primary"
        onCancel={() => setSubmitDialogOpen(false)}
        onConfirm={() => {
          setSubmitDialogOpen(false)
          void performSubmission()
        }}
      />
    </main>
  );
}
