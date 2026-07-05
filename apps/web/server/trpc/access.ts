import "server-only";

import { randomBytes } from "node:crypto";

import { desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  accessRequests,
  allowedEmails,
  checkMinutes,
  codeRedemptions,
  grantMinutes,
  loginEvents,
  pipelineRuns,
  quotaAdjustments,
  redemptionCodes,
  usageEvents,
  users,
} from "@singularity/db";

import { db } from "@/lib/db";
import { sendApprovalEmail } from "@/lib/email";
import { adminProcedure, authedProcedure, protectedProcedure, router } from "./init";

// No 0/O/1/I — codes get read over WeChat voice messages.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `SING-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

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

  myUsage: protectedProcedure.query(async ({ ctx }) => {
    const minutes = await checkMinutes(db, { userId: ctx.user.id });
    return {
      plan: ctx.user.plan ?? "free",
      minutes: { used: minutes.used, base: minutes.base, bonus: minutes.bonus },
    };
  }),

  redeem: protectedProcedure
    .input(z.object({ code: z.string().trim().toUpperCase().min(6).max(32) }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [code] = await tx
          .select()
          .from(redemptionCodes)
          .where(eq(redemptionCodes.code, input.code))
          .for("update")
          .limit(1);
        if (!code) throw new TRPCError({ code: "NOT_FOUND", message: "兑换码不存在" });
        if (code.expiresAt && code.expiresAt < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "兑换码已过期" });
        }
        if (code.usedCount >= code.maxUses) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "兑换码已被用完" });
        }
        const inserted = await tx
          .insert(codeRedemptions)
          .values({ codeId: code.id, userId: ctx.user.id })
          .onConflictDoNothing()
          .returning();
        if (inserted.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "你已兑换过这个码" });
        }
        await tx
          .update(redemptionCodes)
          .set({ usedCount: sql`${redemptionCodes.usedCount} + 1` })
          .where(eq(redemptionCodes.id, code.id));
        const minutes = code.grant?.minutes ?? 0;
        if (minutes <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "兑换码额度无效" });
        }
        await grantMinutes(tx, { userId: ctx.user.id, amount: minutes });
        await tx.insert(quotaAdjustments).values({
          userId: ctx.user.id,
          source: "code",
          codeId: code.id,
          minutesDelta: minutes,
          note: code.note,
        });
        return { minutes };
      });
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

  createCode: adminProcedure
    .input(
      z.object({
        minutes: z.number().int().min(1).max(100000),
        maxUses: z.number().int().min(1).max(1000).default(1),
        expiresInDays: z.number().int().min(1).max(365).optional(),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await db
        .insert(redemptionCodes)
        .values({
          code: generateCode(),
          grant: { minutes: input.minutes },
          maxUses: input.maxUses,
          expiresAt: input.expiresInDays
            ? new Date(Date.now() + input.expiresInDays * 86400_000)
            : null,
          note: input.note ?? null,
          createdBy: ctx.user.id,
        })
        .returning();
      return created!;
    }),

  listCodes: adminProcedure.query(async () => {
    return db.select().from(redemptionCodes).orderBy(desc(redemptionCodes.createdAt)).limit(100);
  }),

  disableCode: adminProcedure
    .input(z.object({ codeId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db
        .update(redemptionCodes)
        .set({ expiresAt: new Date() })
        .where(eq(redemptionCodes.id, input.codeId));
      return { ok: true };
    }),

  usageSummary: adminProcedure.query(async () => {
    const month = sql<string>`to_char(${usageEvents.createdAt} at time zone 'Asia/Shanghai', 'YYYY-MM')`;
    return db
      .select({
        userId: usageEvents.userId,
        email: users.email,
        month,
        llmTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0) + coalesce(sum(${usageEvents.outputTokens}), 0)`,
        asrSeconds: sql<number>`coalesce(sum(${usageEvents.audioSeconds}), 0)`,
        scrapeCalls: sql<number>`coalesce(sum(${usageEvents.apiCalls}) filter (where ${usageEvents.resourceType} = 'scrape'), 0)`,
        costUsd: sql<number>`coalesce(sum(${usageEvents.estimatedCostUsd}), 0)`,
      })
      .from(usageEvents)
      .innerJoin(users, eq(users.id, usageEvents.userId))
      .groupBy(usageEvents.userId, users.email, month)
      .orderBy(desc(month), desc(sql`sum(${usageEvents.estimatedCostUsd})`));
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

  setUserRole: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(["member", "admin"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能修改自己的角色" });
      }
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { ok: true };
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能删除自己" });
      }
      // FK cascades wipe channels/projects/runs/analyses; usage_events keep rows
      // with user_id nulled for cost history.
      await db.delete(users).where(eq(users.id, input.userId));
      return { ok: true };
    }),

  userDetail: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const month = sql<string>`to_char(${usageEvents.createdAt} at time zone 'Asia/Shanghai', 'YYYY-MM')`;
      const [usageByMonth, logins, [loginStats], [runStats], [latestRequest]] = await Promise.all([
        db
          .select({
            month,
            llmInputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)`,
            llmOutputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)`,
            asrSeconds: sql<number>`coalesce(sum(${usageEvents.audioSeconds}), 0)`,
            scrapeCalls: sql<number>`coalesce(sum(${usageEvents.apiCalls}) filter (where ${usageEvents.resourceType} = 'scrape'), 0)`,
            costUsd: sql<number>`coalesce(sum(${usageEvents.estimatedCostUsd}), 0)`,
          })
          .from(usageEvents)
          .where(eq(usageEvents.userId, input.userId))
          .groupBy(month)
          .orderBy(desc(month))
          .limit(6),
        db
          .select({
            ip: loginEvents.ip,
            userAgent: loginEvents.userAgent,
            createdAt: loginEvents.createdAt,
          })
          .from(loginEvents)
          .where(eq(loginEvents.userId, input.userId))
          .orderBy(desc(loginEvents.createdAt))
          .limit(10),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(loginEvents)
          .where(eq(loginEvents.userId, input.userId)),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(pipelineRuns)
          .where(eq(pipelineRuns.userId, input.userId)),
        db
          .select({
            message: accessRequests.message,
            contact: accessRequests.contact,
            status: accessRequests.status,
            createdAt: accessRequests.createdAt,
          })
          .from(accessRequests)
          .where(eq(accessRequests.userId, input.userId))
          .orderBy(desc(accessRequests.createdAt))
          .limit(1),
      ]);
      const minutes = await checkMinutes(db, { userId: input.userId });
      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          accessStatus: user.accessStatus,
          role: user.role,
          plan: user.plan,
          createdAt: user.createdAt,
          lastSeenAt: user.lastSeenAt,
        },
        minutes: { used: minutes.used, base: minutes.base, bonus: minutes.bonus },
        usageByMonth,
        logins,
        loginCount: loginStats?.total ?? 0,
        runCount: runStats?.total ?? 0,
        latestRequest: latestRequest ?? null,
      };
    }),
});
