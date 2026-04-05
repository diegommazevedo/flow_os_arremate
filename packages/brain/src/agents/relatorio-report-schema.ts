/**
 * Schema Zod do relatório — isolado para o barrel @flow-os/brain não puxar Playwright no Next.js.
 */
import { z } from "zod";

export const ReportAnaliseSchema = z.object({
  resumo: z.string().min(10).max(600),

  titleStatus: z.object({
    status:   z.enum(["ok", "atencao", "bloqueante"]),
    mensagem: z.string().min(5).max(300),
  }),

  riscos: z.array(
    z.object({
      titulo:    z.string().max(80),
      descricao: z.string().max(300),
      nivel:     z.enum(["baixo", "medio", "alto"]),
    }),
  ).min(1).max(8),

  proximosPassos: z.array(
    z.object({
      ordem: z.number().int().min(1),
      acao:  z.string().max(200),
      prazo: z.string().max(80),
    }),
  ).min(1).max(10),

  prazosCriticos: z.object({
    paymentDeadline: z.string().max(150),
    processo:        z.string().max(150),
  }),
});

export type ReportAnalise = z.infer<typeof ReportAnaliseSchema>;
