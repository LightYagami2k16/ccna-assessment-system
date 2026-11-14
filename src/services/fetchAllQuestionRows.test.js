import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAllQuestionRows } from './fetchAllQuestionRows.js'

for (const [total, responseCap] of [[0, 1000], [1000, 1000], [1550, 1000], [1550, 500], [2000, 1000]]) {
  test(`loads ${total} questions with a ${responseCap}-row response cap`, async () => {
    const rows = Array.from({ length: total }, (_, id) => ({ id }))
    const requests = []
    const result = await fetchAllQuestionRows(() => {
      const order = []
      return {
        order(column, options) {
          order.push({ column, ...options })
          return this
        },
        async range(from, to) {
          requests.push({ from, to, order })
          return { data: rows.slice(from, Math.min(to + 1, from + responseCap)) }
        },
      }
    })
    assert.deepEqual(result, rows)
    assert.equal(new Set(result.map((row) => row.id)).size, total)
    assert.equal(requests[0].from, 0)
    assert.equal(requests.at(-1).from, total)
    for (const request of requests) {
      assert.equal(request.to - request.from + 1, 1000)
      assert.deepEqual(request.order, [
        { column: 'created_at', ascending: false },
        { column: 'id', ascending: false },
      ])
    }
  })
}

test('a later batch failure rejects the load instead of returning a partial bank', async () => {
  let requests = 0
  const failure = new Error('Second batch failed')
  await assert.rejects(fetchAllQuestionRows(() => ({
    order() { return this },
    async range() {
      requests += 1
      return requests === 1
        ? { data: [{ id: 'first-row' }] }
        : { data: null, error: failure }
    },
  })), failure)
  assert.equal(requests, 2)
})
