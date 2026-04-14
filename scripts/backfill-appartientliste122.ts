import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { annotations } from "../shared/schema";
import { isSignTypeInList122 } from "../shared/sign-list-122";

type Options = {
  dryRun: boolean;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
  };
}

async function main() {
  const { dryRun } = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    const rows = await db
      .select({
        id: annotations.id,
        signType: annotations.signType,
        belongsToList122: annotations.belongsToList122,
      })
      .from(annotations);

    let scanned = 0;
    let toUpdate = 0;
    let alreadyCorrect = 0;
    let updated = 0;

    for (const row of rows) {
      scanned += 1;
      const computed = isSignTypeInList122(row.signType);

      if (row.belongsToList122 === computed) {
        alreadyCorrect += 1;
        continue;
      }

      toUpdate += 1;

      if (!dryRun) {
        await db
          .update(annotations)
          .set({ belongsToList122: computed })
          .where(eq(annotations.id, row.id));
        updated += 1;
      }
    }

    console.log(`Backfill belongsToList122 ${dryRun ? "(dry-run)" : ""}`.trim());
    console.log(`- scanned: ${scanned}`);
    console.log(`- already-correct: ${alreadyCorrect}`);
    console.log(`- to-update: ${toUpdate}`);
    console.log(`- updated: ${dryRun ? 0 : updated}`);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
