# Student exam and offline-continuation guide

## Before an assessment

- Sign in and open the assigned assessment while connected to the internet.
- Use a current version of Chrome, Edge, Firefox, or Safari.
- Keep the device charged and avoid private browsing, which may restrict local storage.
- Do not clear site data during an active attempt.

## During an assessment

- The server timer continues during a connection interruption.
- Quiz answers, question timing, CLI commands, PC settings, and submission intent are stored on the current device.
- The application synchronizes queued work in order when the connection returns.
- Keep the assessment tab open until synchronization and submission are confirmed.

## Offline security boundary

The application supports offline continuation and recovery, not offline exam creation or grading. Signing in, starting a new graded attempt, obtaining previously unseen questions, and final grading require Supabase. Correct answers and grading criteria are never cached for student access.

## Supported recovery scenarios

- Brief network interruption during a quiz or CLI practical.
- Browser refresh during an already-open attempt after its safe snapshot has been cached.
- Multiple locally saved quiz answers waiting to synchronize.
- Multiple CLI commands or PC configuration updates waiting to synchronize.
- A submit action performed offline, which is retried after reconnection.

## Browser and device coverage

Automated compatibility checks cover:

- Chromium on Android phone dimensions.
- WebKit on iPhone and iPad dimensions.
- Edge-compatible Chromium desktop behavior.
- The existing desktop Chrome, Firefox, and Safari projects.
- Compact phone, phone, tablet, and desktop responsive widths.

Run the focused device suite with `npm run test:e2e:devices` and the full cross-browser suite with `npm run test:e2e`.
