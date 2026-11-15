/** @jest-environment node */
import { runAfterResponse } from "../run-after-response"

const mockAfter = jest.fn()
jest.mock("next/server", () => ({ after: (task: () => unknown) => mockAfter(task) }))

describe("runAfterResponse", () => {
  beforeEach(() => {
    mockAfter.mockReset()
  })

  it("hands the task to after() inside a request instead of running it inline", () => {
    const task = jest.fn().mockResolvedValue(undefined)

    runAfterResponse("task", task)

    expect(mockAfter).toHaveBeenCalledTimes(1)
    expect(task).not.toHaveBeenCalled()
  })

  it("runs the task right away when after() is unavailable (outside a request)", () => {
    mockAfter.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope")
    })
    const task = jest.fn().mockResolvedValue(undefined)

    runAfterResponse("task", task)

    expect(task).toHaveBeenCalledTimes(1)
  })

  it("logs a failing task instead of throwing", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    const failure = new Error("resend down")
    mockAfter.mockImplementation((run: () => Promise<unknown>) => run())

    expect(() => runAfterResponse("sendEmail", () => Promise.reject(failure))).not.toThrow()
    await new Promise((resolve) => setImmediate(resolve))

    expect(consoleError).toHaveBeenCalledWith("sendEmail failed", failure)
    consoleError.mockRestore()
  })
})
