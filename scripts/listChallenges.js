const { getInitializedRuntime } = require("./shared/bootstrap");
const { parseArgs, formatError, outputSuccess } = require("./shared/utils");

async function main() {
  try {
    const args = parseArgs();
    const { challengeStorage, didsStorage } = await getInitializedRuntime();

    const challenges = await challengeStorage.list();

    if (challenges.length === 0) {
      console.error(
        "No challenges found. Generate one with generateChallenge.js",
      );
      process.exit(1);
    }

    // Filter by DID if provided
    const filtered = args.did
      ? challenges.filter((entry) => entry.did === args.did)
      : challenges;

    if (filtered.length === 0) {
      console.error(`No challenges found for DID: ${args.did}`);
      process.exit(1);
    }

    // Enrich with default DID info
    const defaultEntry = await didsStorage.getDefault();
    const enriched = filtered.map((entry) => ({
      did: entry.did,
      challenge: entry.challenge,
      created_at: entry.created_at || "unknown",
      isDefaultDid: defaultEntry ? entry.did === defaultEntry.did : false,
    }));

    outputSuccess(enriched);
  } catch (error) {
    console.error(formatError(error));
    process.exit(1);
  }
}

main();
