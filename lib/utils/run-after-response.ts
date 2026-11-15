import { after } from "next/server"

// Runs a best-effort side effect (an email, typically) once the response has been
// sent, so the user isn't kept waiting on a third-party API for something whose
// outcome they never see. Failures are logged, never thrown.
//
// after() only exists inside a request (server action / route handler). Anywhere
// else — a script, a unit test — it throws, and the task just starts right away.
export function runAfterResponse(label: string, task: () => Promise<unknown>) {
  const run = () =>
    task().catch((error: unknown) => {
      console.error(`${label} failed`, error)
    })

  try {
    after(run)
  } catch {
    void run()
  }
}
