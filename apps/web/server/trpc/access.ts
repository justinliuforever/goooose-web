import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { accessRequests, allowedEmails, users } from "@singularity/db";

import { db } from "@/lib/db";
import { sendApprovalEmail } from "@/lib/email";
import { adminProcedure, authedProcedure, router } from "./init";

export const accessRouter = router({
  status: authedProcedure.query(async ({ ctx }) => {
    const [latest] = await db
      .select({
        status: accessRequests.status,
        createdAt: accessRequests.createdAt,
      })
      .from(accessRequests)
      .where(eq(accessRequests.userId, ctx.user.id))
      .orderBy(desc(accessRequests.createdAt))
      .limit(1);
    return {
      accessStatus: ctx.user.accessStatus,
      latestRequest: latest ?? null,
    };
  }),

  submit: authedProcedure
    .input(
      z.object({
        message: z.string().trim().min(5, "请简单介绍一下使用场景").max(2000),
        contact: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.accessStatus === "approved") {
        return { status: "approved" as const };
      }
      if (ctx.user.accessStatus === "blocked") {
        throw new TRPCError({ code: "FORBIDDEN", message: "该账号访问已停用" });
      }
      const [pending] = await db
        .select({ id: accessRequests.id })
        .from(accessRequests)
        .where(eq(accessRequests.userId, ctx.user.id))
        .orderBy(desc(accessRequests.createdAt))
        .limit(1);
      if (pending) {
        await db
          .update(accessRequests)
          .set({ message: input.message, contact: input.contact ?? null, status: "pending" })
          .where(eq(accessRequests.id, pending.id));
      } else {
        await db.insert(accessRequests).values({
          userId: ctx.user.id,
          message: input.message,
          contact: input.contact ?? null,
        });
      }
      return { status: "pending" as const };
    }),
});

export const adminRouter = router({
  listRequests: adminProcedure.query(async () => {
    return db
      .select({
        id: accessRequests.id,
        message: accessRequests.message,
        contact: accessRequests.contact,
        status: accessRequests.status,
        createdAt: accessRequests.createdAt,
        decidedAt: accessRequests.decidedAt,
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(accessRequests)
      .innerJoin(users, eq(users.id, accessRequests.userId))
      .orderBy(desc(accessRequests.createdAt));
  }),

  decideRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [request] = await db
        .select()
        .from(accessRequests)
        .where(eq(accessRequests.id, input.requestId))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });

      const nextStatus = input.decision === "approve" ? "approved" : "rejected";
      await db.transaction(async (tx) => {
        await tx
          .update(accessRequests)
          .set({ status: nextStatus, decidedBy: ctx.user.id, decidedAt: new Date() })
          .where(eq(accessRequests.id, input.requestId));
        if (input.decision === "approve") {
          await tx
            .update(users)
            .set({ accessStatus: "approved" })
            .where(eq(users.id, request.userId));
        }
      });

      if (input.decision !== "approve") return { emailSent: false };
      const [target] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      const email = await sendApprovalEmail(target?.email ?? "");
      return { emailSent: email.sent, emailSkipReason: email.reason };
    }),

  listAllowedEmails: adminProcedure.query(async () => {
    return db.select().from(allowedEmails).orderBy(desc(allowedEmails.createdAt));
  }),

  addAllowedEmail: adminProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email(),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(allowedEmails)
        .values({ email: input.email, note: input.note ?? null, createdBy: ctx.user.id })
        .onConflictDoNothing();
      // Invitee may have already logged in and be waiting — approve them in place.
      await db
        .update(users)
        .set({ accessStatus: "approved" })
        .where(sql`lower(${users.email}) = ${input.email}`);
      return { ok: true };
    }),

  removeAllowedEmail: adminProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email() }))
    .mutation(async ({ input }) => {
      await db.delete(allowedEmails).where(eq(allowedEmails.email, input.email));
      return { ok: true };
    }),

  listUsers: adminProcedure.query(async () => {
    return db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        accessStatus: users.accessStatus,
        role: users.role,
        plan: users.plan,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
  }),

  setUserAccess: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        accessStatus: z.enum(["pending", "approved", "blocked"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能修改自己的访问状态" });
      }
      await db
        .update(users)
        .set({ accessStatus: input.accessStatus })
        .where(eq(users.id, input.userId));
      return { ok: true };
    }),
});
