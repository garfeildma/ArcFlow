import { createPublicClient, getAddress, http, parseAbiItem } from "viem";
import type { Env } from "../types";
import { SupabaseRest } from "./supabase";
import { paymentIntentRegistryAbi, agentVaultAbi } from "../../shared/abi";

const intentPaidEvent = parseAbiItem(
  "event IntentPaid(uint256 indexed intentId, address indexed payer, address indexed recipient, address token, uint256 amount)"
);
const intentCreatedEvent = parseAbiItem(
  "event IntentCreated(uint256 indexed intentId, bytes32 indexed slugHash, address indexed recipient, address token, uint256 amount, string metadataUri)"
);
const vaultCreatedEvent = parseAbiItem(
  "event VaultCreated(uint256 indexed vaultId, address indexed owner, address indexed agent, address token, uint256 budget, uint256 singleSpendLimit)"
);
const agentSpentEvent = parseAbiItem(
  "event AgentSpent(uint256 indexed vaultId, address indexed agent, address indexed recipient, address token, uint256 amount, string memo)"
);

export async function runIndexer(env: Env) {
  const chainId = Number(env.ARC_CHAIN_ID || 5042002);
  const db = new SupabaseRest(env);
  const client = createPublicClient({
    transport: http(env.ARC_RPC_URL)
  });

  const state = await db.select<{ last_indexed_block: string }>("chain_indexer_state", {
    select: "last_indexed_block",
    chain_id: `eq.${chainId}`,
    limit: 1
  });

  const latest = await client.getBlockNumber();
  const indexed = state[0] ? BigInt(state[0].last_indexed_block) : latest > 2000n ? latest - 2000n : 0n;
  const fromBlock = indexed + 1n;
  const toBlock = latest > fromBlock + 1999n ? fromBlock + 1999n : latest;

  if (fromBlock > toBlock) {
    return { indexed: 0, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() };
  }

  let count = 0;
  if (env.PAYMENT_REGISTRY_ADDRESS && /^0x[a-fA-F0-9]{40}$/.test(env.PAYMENT_REGISTRY_ADDRESS)) {
    const address = getAddress(env.PAYMENT_REGISTRY_ADDRESS);
    const created = await client.getLogs({ address, event: intentCreatedEvent, fromBlock, toBlock });
    const paid = await client.getLogs({ address, event: intentPaidEvent, fromBlock, toBlock });

    for (const log of created) {
      await upsertEvent(db, chainId, address, "IntentCreated", log);
      count += 1;
    }

    for (const log of paid) {
      await upsertEvent(db, chainId, address, "IntentPaid", log);
      const intentId = log.args.intentId?.toString();
      if (intentId) {
        await db.update(
          "payment_intents",
          `onchain_intent_id=eq.${intentId}`,
          {
            status: "paid",
            tx_hash: log.transactionHash,
            paid_at: new Date().toISOString()
          }
        );
      }
      count += 1;
    }
  }

  if (env.AGENT_VAULT_ADDRESS && /^0x[a-fA-F0-9]{40}$/.test(env.AGENT_VAULT_ADDRESS)) {
    const address = getAddress(env.AGENT_VAULT_ADDRESS);
    const vaults = await client.getLogs({ address, event: vaultCreatedEvent, fromBlock, toBlock });
    const spends = await client.getLogs({ address, event: agentSpentEvent, fromBlock, toBlock });

    for (const log of vaults) {
      await upsertEvent(db, chainId, address, "VaultCreated", log);
      count += 1;
    }

    for (const log of spends) {
      await upsertEvent(db, chainId, address, "AgentSpent", log);
      count += 1;
    }
  }

  await db.upsert(
    "chain_indexer_state",
    {
      chain_id: chainId,
      last_indexed_block: toBlock.toString(),
      updated_at: new Date().toISOString()
    },
    "chain_id"
  );

  return {
    indexed: count,
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
    abiEvents: paymentIntentRegistryAbi.length + agentVaultAbi.length
  };
}

async function upsertEvent(
  db: SupabaseRest,
  chainId: number,
  contractAddress: string,
  eventName: string,
  log: {
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    logIndex: number;
    args: Record<string, unknown>;
  }
) {
  await db.upsert(
    "chain_events",
    {
      chain_id: chainId,
      contract_address: contractAddress.toLowerCase(),
      event_name: eventName,
      block_number: log.blockNumber.toString(),
      tx_hash: log.transactionHash,
      log_index: log.logIndex,
      args: stringifyBigInts(log.args)
    },
    "chain_id,tx_hash,log_index"
  );
}

function stringifyBigInts(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stringifyBigInts);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringifyBigInts(item)]));
  }
  return value;
}
