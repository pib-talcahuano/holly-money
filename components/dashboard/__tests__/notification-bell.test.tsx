import { render, screen, fireEvent } from "@testing-library/react"
import { NotificationBell } from "../notification-bell"

const ITEMS = [
  { type: "INTENTION_APPROVED", id: "1", description: "a", href: "/requests/1" },
  { type: "INTENTION_APPROVED", id: "2", description: "b", href: "/requests/2" },
  { type: "INTENTION_APPROVED", id: "3", description: "c", href: "/requests/3" }
]

describe("NotificationBell", () => {
  beforeEach(() => {
    window.localStorage.clear()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: ITEMS.length, items: ITEMS })
    }) as jest.Mock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("shows the unread count on the badge, not the raw item total", async () => {
    render(<NotificationBell />)
    expect(await screen.findByText("3")).toBeInTheDocument()
  })

  it("clears the badge after marking all as read", async () => {
    render(<NotificationBell />)
    await screen.findByText("3")

    fireEvent.click(screen.getByRole("button", { name: "Notificaciones" }))
    fireEvent.click(await screen.findByText("Marcar todas"))

    expect(screen.queryByText("3")).not.toBeInTheDocument()
  })
})
