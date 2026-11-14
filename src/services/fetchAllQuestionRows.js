const QUESTION_BATCH_SIZE = 1000

export async function fetchAllQuestionRows(createQuery) {
  const questions = []
  let offset = 0

  while (true) {
    const { data, error } = await createQuery()
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + QUESTION_BATCH_SIZE - 1)
    if (error) throw error

    const batch = data ?? []
    // The API can return fewer rows than requested, so only an empty batch ends loading.
    if (!batch.length) return questions

    questions.push(...batch)
    offset += batch.length
  }
}
