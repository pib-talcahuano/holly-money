import { Section, Text } from "react-email"

import { ActionButton, BaseEmail, DataTable, formatAmount } from "./components/base-email"

export type CommentNotificationItem = {
  author: string
  message: string
  createdAt: string
}

export function CommentNotificationEmail({
  recipientName,
  intention,
  comments,
  detailUrl
}: {
  recipientName: string
  intention: { amount: number; purpose: string }
  comments: CommentNotificationItem[]
  detailUrl: string
}) {
  const title = comments.length === 1 ? "Nuevo comentario" : `${comments.length} nuevos comentarios`
  return (
    <BaseEmail preview={`${title} en una solicitud`}>
      <Section style={{ padding: "24px 32px 8px" }}>
        <Text style={{ margin: 0, fontSize: 18, color: "#222", fontWeight: 700 }}>
          {title} en una solicitud
        </Text>
        <Text style={{ margin: "8px 0 0", color: "#555", fontSize: 14 }}>
          Hola {recipientName},
        </Text>
      </Section>
      <Section style={{ padding: "8px 32px" }}>
        <DataTable
          rows={[
            ["Monto", formatAmount(intention.amount)],
            ["Descripción", intention.purpose]
          ]}
        />
      </Section>
      {comments.map((comment, i) => (
        <Section key={i} style={{ padding: "8px 32px" }}>
          <Text style={{ margin: 0, fontSize: 13, color: "#999", fontWeight: 600 }}>
            {comment.author} · {comment.createdAt}
          </Text>
          <Text style={{ margin: "4px 0 0", fontSize: 14, color: "#333", whiteSpace: "pre-wrap" }}>
            {comment.message}
          </Text>
        </Section>
      ))}
      <Section style={{ padding: "24px 32px" }}>
        <ActionButton label="Ver solicitud" url={detailUrl} />
        <Text style={{ margin: "12px 0 0", fontSize: 12, color: "#999" }}>
          Se requiere inicio de sesión para acceder.
        </Text>
      </Section>
    </BaseEmail>
  )
}
