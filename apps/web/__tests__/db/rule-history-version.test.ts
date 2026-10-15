import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { ActionType } from "@/generated/prisma/enums";

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

// Overlapping history writes for one rule (e.g. an assistant edit followed by
// another) read the same latest version and race on the (ruleId, version)
// unique index. Every write must still land with its own version.
describe.skipIf(!RUN_DB_TESTS)(
  "rule history versions (real database)",
  { timeout: 30_000 },
  () => {
    let prisma: typeof import("@/utils/prisma").default;
    let createRuleHistory: typeof import("@/utils/rule/rule-history").createRuleHistory;
    let ruleHistoryRuleInclude: typeof import("@/utils/rule/rule-history").ruleHistoryRuleInclude;
    let ruleId: string;

    const accountEmail = "rule-history-version-test@example.com";

    beforeAll(async () => {
      prisma = (await import("@/utils/prisma")).default;
      ({ createRuleHistory, ruleHistoryRuleInclude } = await import(
        "@/utils/rule/rule-history"
      ));
    });

    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });

      const user = await prisma.user.create({ data: { email: accountEmail } });
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          provider: "google",
          providerAccountId: accountEmail,
          type: "oauth",
        },
      });
      const emailAccount = await prisma.emailAccount.create({
        data: {
          email: accountEmail,
          userId: user.id,
          accountId: account.id,
        },
      });
      const rule = await prisma.rule.create({
        data: {
          name: "Newsletters",
          emailAccountId: emailAccount.id,
          actions: { create: [{ type: ActionType.ARCHIVE }] },
        },
      });
      ruleId = rule.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });
    });

    test("concurrent history writes for one rule each get the next version", async () => {
      const rule = await prisma.rule.findUniqueOrThrow({
        where: { id: ruleId },
        include: ruleHistoryRuleInclude,
      });

      await Promise.all(
        Array.from({ length: 5 }, () =>
          createRuleHistory({ rule, triggerType: "updated" }),
        ),
      );

      const history = await prisma.ruleHistory.findMany({
        where: { ruleId },
        orderBy: { version: "asc" },
        select: { version: true },
      });
      expect(history.map((row) => row.version)).toEqual([1, 2, 3, 4, 5]);
    });
  },
);
